import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Role, Scenario } from '@/domain/types';
import {
  acceptInvitationSchema,
  invitationSchema,
  memberSchema,
  requestSchema,
  reviewRequestSchema,
  listQuerySchema,
  requestListQuerySchema,
  type AuditRequestRecord,
  type TeamPage,
  type RequestPage,
  type OrganizationPage,
} from '@/lib/accounts-requests-schema';
import { auditOfferId } from '@/lib/audit-offer';
import { database, type Transaction } from './database';
import { WorkspaceError } from './workspace-errors';
import { siteOrigin } from './config';

export interface TrustedAccess {
  id: string;
  display_name: string;
  role: Role;
  client_id: string | null;
  active: boolean;
  is_client_admin: boolean;
  email: string;
  audit_offer?: unknown;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : String(value));
const deny = () => new WorkspaceError(403, 'FORBIDDEN', 'Cet accès ne vous est pas autorisé.');
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new WorkspaceError(400, 'INVALID_INPUT', 'Vérifiez les champs du formulaire.');
  return result.data;
}
/** Read and lock authoritative assignments for the entire transaction. Never trust browser profile data. */
export async function trustedAccess(tx: Transaction, userId: string): Promise<TrustedAccess> {
  if (!z.uuid().safeParse(userId).success) throw deny();
  const rows =
    await tx`select p.*,u.email,u.raw_user_meta_data->>'audit_offer' as audit_offer from public.profiles p join auth.users u on u.id=p.id
    where p.id=${userId} and p.active and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) for share of p,u`;
  if (!rows[0]) throw deny();
  return rows[0] as TrustedAccess;
}
async function quality(tx: Transaction, userId: string) {
  const profile = await trustedAccess(tx, userId);
  if (profile.role !== 'qualite') throw deny();
  return profile;
}
async function readRole(tx: Transaction, userId: string) {
  await tx`select set_config('request.jwt.claim.sub',${userId},true),
    set_config('request.jwt.claims',${JSON.stringify({ sub: userId, role: 'authenticated', is_anonymous: false })},true)`;
  await tx.unsafe('set local role authenticated');
}
async function accountEvent(
  tx: Transaction,
  actorId: string,
  targetId: string,
  kind: string,
  detail: Record<string, unknown> = {},
) {
  await tx`insert into app_private.account_events(actor_id,target_id,kind,detail)
    values(${actorId},${targetId},${kind},${tx.json(detail)})`;
}

export async function listTeam(userId: string, input: unknown): Promise<TeamPage> {
  const query = parse(listQuerySchema, input);
  return database().begin(async (tx) => {
    await quality(tx, userId);
    const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const members = await tx`select p.*,u.email,c.name as client_name,count(*) over() as total
      from public.profiles p join auth.users u on u.id=p.id left join public.clients c on c.id=p.client_id
      where p.display_name ilike ${pattern} or u.email ilike ${pattern} or c.name ilike ${pattern}
      order by p.display_name,p.id limit 25 offset ${(query.page - 1) * 25}`;
    const count = members.length
      ? Number(members[0].total)
      : Number(
          (
            await tx`select count(*) as n
      from public.profiles p join auth.users u on u.id=p.id left join public.clients c on c.id=p.client_id
      where p.display_name ilike ${pattern} or u.email ilike ${pattern} or c.name ilike ${pattern}`
          )[0].n,
        );
    const invitations =
      await tx`select i.id,i.email,i.role,c.name as client_name,i.expires_at,i.accepted_at,i.revoked_at
      from app_private.team_invitations i left join public.clients c on c.id=i.client_id
      where i.email ilike ${pattern} order by i.created_at desc,i.id desc limit 50`;
    const clients = await tx`select id,name from public.clients order by name,id limit 25`;
    const clientTotal = Number((await tx`select count(*) as n from public.clients`)[0].n);
    return {
      page: query.page,
      pageSize: 25,
      total: count,
      members: members.map((r) => ({
        id: r.id,
        name: r.display_name,
        email: r.email,
        role: r.role,
        clientId: r.client_id,
        clientName: r.client_name,
        active: r.active,
        isClientAdmin: r.is_client_admin,
      })),
      invitations: invitations.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        clientName: r.client_name,
        expiresAt: iso(r.expires_at),
        acceptedAt: r.accepted_at ? iso(r.accepted_at) : null,
        revokedAt: r.revoked_at ? iso(r.revoked_at) : null,
        expired: new Date(r.expires_at).getTime() <= Date.now(),
      })),
      clients: clients.map((r) => ({ id: r.id, name: r.name })),
      clientTotal,
    };
  });
}
export async function listOrganizations(userId: string, input: unknown): Promise<OrganizationPage> {
  const query = parse(listQuerySchema, input);
  return database().begin(async (tx) => {
    await quality(tx, userId);
    const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const rows =
      await tx`select id,name from public.clients where name ilike ${pattern} order by name,id limit 25 offset ${(query.page - 1) * 25}`;
    const count = await tx`select count(*) as n from public.clients where name ilike ${pattern}`;
    return {
      clients: rows.map((r) => ({ id: r.id, name: r.name })),
      total: Number(count[0].n),
      page: query.page,
      pageSize: 25,
    };
  });
}
export async function createInvitation(userId: string, input: unknown) {
  const data = parse(invitationSchema, input);
  const token = randomBytes(32).toString('base64url');
  const id = randomUUID();
  await database().begin(async (tx) => {
    await quality(tx, userId);
    await tx`select pg_advisory_xact_lock(hashtextextended(${`invite-rate:${userId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`invite:${data.email}`},0))`;
    if (
      data.clientId &&
      !(await tx`select id from public.clients where id=${data.clientId}`).length
    )
      throw new WorkspaceError(404, 'CLIENT_NOT_FOUND', 'Organisation introuvable.');
    const existing = await tx`select p.role,p.client_id,p.active from public.profiles p
      join auth.users u on u.id=p.id where lower(btrim(u.email))=${data.email}`;
    if (existing.some((p) => p.role !== data.role || p.client_id !== data.clientId || !p.active))
      throw new WorkspaceError(
        409,
        'ACCOUNT_ALREADY_ASSIGNED',
        'Ce compte possède déjà un autre accès. Gérez son profil existant.',
      );
    const recent = await tx`select count(*) as n from app_private.team_invitations
      where invited_by=${userId} and created_at>now()-interval '1 day'`;
    if (Number(recent[0].n) >= 100)
      throw new WorkspaceError(
        429,
        'INVITATION_LIMIT',
        'Limite quotidienne atteinte. Réessayez demain.',
      );
    await tx`update app_private.team_invitations set revoked_at=now()
      where email=${data.email} and accepted_at is null and revoked_at is null`;
    await tx`insert into app_private.team_invitations(id,email,token_hash,role,client_id,is_client_admin,invited_by)
      values(${id},${data.email},${hash(token)},${data.role},${data.clientId},${data.isClientAdmin},${userId})`;
    await accountEvent(tx, userId, id, 'invitation.created', {
      role: data.role,
      clientId: data.clientId,
    });
  });
  // Fragment tokens are not sent in HTTP requests or Referer headers. Raw secrets are returned once, never stored.
  return { id, url: `${siteOrigin()}/app/join#${token}` };
}
export async function revokeInvitation(userId: string, input: unknown) {
  const { id } = parse(z.object({ id: z.uuid() }).strict(), input);
  await database().begin(async (tx) => {
    await quality(tx, userId);
    const rows =
      await tx`update app_private.team_invitations set revoked_at=coalesce(revoked_at,now())
      where id=${id} and accepted_at is null returning id`;
    if (!rows.length)
      throw new WorkspaceError(
        409,
        'INVITATION_UNAVAILABLE',
        'Invitation déjà acceptée ou introuvable.',
      );
    await accountEvent(tx, userId, id, 'invitation.revoked');
  });
}
export async function updateMember(userId: string, input: unknown) {
  const data = parse(memberSchema, input);
  await database().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended('account-administration',0))`;
    await quality(tx, userId);
    const rows = await tx`select * from public.profiles where id=${data.id} for update`;
    if (!rows[0]) throw new WorkspaceError(404, 'MEMBER_NOT_FOUND', 'Membre introuvable.');
    if (
      rows[0].display_name !== data.expected.displayName ||
      rows[0].active !== data.expected.active ||
      rows[0].is_client_admin !== data.expected.isClientAdmin
    )
      throw new WorkspaceError(
        409,
        'STALE_MEMBER',
        'Ce profil a changé. Actualisez la page avant de réessayer.',
      );
    if (data.id === userId && !data.active)
      throw new WorkspaceError(
        409,
        'SELF_DISABLE',
        'Vous ne pouvez pas désactiver votre propre compte.',
      );
    if (rows[0].role !== 'client' && data.isClientAdmin) throw deny();
    await tx`update public.profiles set display_name=${data.displayName},active=${data.active},
      is_client_admin=${data.isClientAdmin} where id=${data.id}`;
    await accountEvent(tx, userId, data.id, 'member.updated', {
      before: { active: rows[0].active, isClientAdmin: rows[0].is_client_admin },
      after: { active: data.active, isClientAdmin: data.isClientAdmin },
    });
  });
}
export async function acceptInvitation(userId: string, input: unknown) {
  const data = parse(acceptInvitationSchema, input);
  return database().begin(async (tx) => {
    const users = await tx`select id,email from auth.users where id=${userId}
      and email_confirmed_at is not null and not coalesce(is_anonymous,false) for share`;
    if (!users[0]) throw deny();
    const invites =
      await tx`select * from app_private.team_invitations where token_hash=${hash(data.token)} for update`;
    const invite = invites[0];
    if (
      !invite ||
      invite.email !== String(users[0].email).trim().toLowerCase() ||
      invite.revoked_at ||
      (!invite.accepted_at && new Date(invite.expires_at).getTime() <= Date.now()) ||
      (invite.accepted_by && invite.accepted_by !== userId)
    )
      throw new WorkspaceError(
        400,
        'INVITATION_INVALID',
        'Invitation invalide, expirée ou destinée à une autre adresse confirmée.',
      );
    await tx`select pg_advisory_xact_lock(hashtextextended(${`profile:${userId}`},0))`;
    const profiles = await tx`select * from public.profiles where id=${userId} for update`;
    if (
      profiles[0] &&
      (!profiles[0].active ||
        profiles[0].role !== invite.role ||
        profiles[0].client_id !== invite.client_id)
    )
      throw new WorkspaceError(
        409,
        'ACCOUNT_ALREADY_ASSIGNED',
        'Ce compte appartient déjà à un autre espace. Contactez Écartéo.',
      );
    if (invite.accepted_at) return { redirect: '/app' };
    // Recheck issuer authority: disabling or demoting an inviter invalidates outstanding links.
    const issuer = await trustedAccess(tx, String(invite.invited_by));
    if (issuer.role !== 'qualite')
      throw new WorkspaceError(400, 'INVITATION_INVALID', 'Demandez une nouvelle invitation.');
    if (!profiles[0])
      await tx`insert into public.profiles(id,display_name,role,client_id,active,is_client_admin)
      values(${userId},${data.displayName},${invite.role},${invite.client_id},true,${invite.is_client_admin})`;
    else
      await tx`update public.profiles set is_client_admin=${invite.is_client_admin} where id=${userId}`;
    await tx`update app_private.team_invitations set accepted_at=now(),accepted_by=${userId} where id=${invite.id}`;
    await accountEvent(tx, userId, invite.id, 'invitation.accepted');
    return { redirect: '/app' };
  });
}

export async function listRequests(userId: string, input: unknown): Promise<RequestPage> {
  const query = parse(requestListQuerySchema, input);
  return database().begin(async (tx) => {
    const profile = await trustedAccess(tx, userId);
    if (profile.role === 'operateur') throw deny();
    await readRole(tx, userId);
    const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
    const hasPublishedReport = tx`exists (
      select 1 from public.published_reports p where p.client_id=r.client_id
        and p.snapshot #>> '{scenario,id}' = r.scenario_id::text
    )`;
    let filter = tx`true`;
    if (query.status === 'published') filter = hasPublishedReport;
    else if (query.status === 'converted')
      filter = tx`r.status='converted' and not ${hasPublishedReport}`;
    else if (query.status !== 'all') filter = tx`r.status=${query.status}`;
    const rows =
      await tx`select r.*,c.name as client_name from public.audit_requests r join public.clients c on c.id=r.client_id
      where ${filter} and (r.title ilike ${pattern} or c.name ilike ${pattern})
      order by r.created_at desc,r.id desc limit 25 offset ${(query.page - 1) * 25}`;
    const total =
      await tx`select count(*) as n from public.audit_requests r join public.clients c on c.id=r.client_id
      where ${filter} and (r.title ilike ${pattern} or c.name ilike ${pattern})`;
    // Use the frozen report projection under the reader's RLS policies. A retest
    // has its own scenario, so follow the published baseline link, never a title.
    const reportsByRequest = new Map<string, AuditRequestRecord['publishedReports']>();
    const converted = rows.filter((row) => row.scenario_id).map((row) => row.id);
    if (converted.length) {
      const reports = await tx`with recursive linked as (
        select r.id as request_id,p.client_id,p.mission_id,p.published_at,
          (p.snapshot->>'baselineMissionId' is not null) as is_retest
        from public.audit_requests r join public.published_reports p
          on p.client_id=r.client_id and p.snapshot #>> '{scenario,id}' = r.scenario_id::text
        where r.id=any(${converted}::uuid[])
        union
        select l.request_id,p.client_id,p.mission_id,p.published_at,true
        from linked l join public.published_reports p
          on p.client_id=l.client_id and p.snapshot->>'baselineMissionId'=l.mission_id::text
      ) select request_id,mission_id,published_at,is_retest from linked
        order by published_at desc,mission_id desc`;
      for (const row of reports) {
        const list = reportsByRequest.get(row.request_id) ?? [];
        list.push({
          missionId: row.mission_id,
          publishedAt: iso(row.published_at),
          isRetest: row.is_retest,
        });
        reportsByRequest.set(row.request_id, list);
      }
    }
    return {
      page: query.page,
      pageSize: 25,
      total: Number(total[0].n),
      ...(profile.role === 'client' &&
      Number(total[0].n) === 0 &&
      query.status === 'all' &&
      !query.search &&
      auditOfferId(profile.audit_offer)
        ? { suggestedOffer: auditOfferId(profile.audit_offer) }
        : {}),
      items: rows.map((r) => ({
        id: r.id,
        clientId: r.client_id,
        clientName: r.client_name,
        title: r.title,
        sector: r.sector,
        channels: r.channels,
        siteCount: r.site_count,
        preferredDate: r.preferred_date ? iso(r.preferred_date).slice(0, 10) : null,
        brief: r.brief,
        status: reportsByRequest.has(r.id) ? 'published' : r.status,
        reviewNote: r.review_note,
        scenarioId: profile.role === 'qualite' ? r.scenario_id : null,
        publishedReports: reportsByRequest.get(r.id) ?? [],
        revision: r.revision,
        createdAt: iso(r.created_at),
      })),
    };
  });
}
export async function createRequest(userId: string, input: unknown) {
  const data = parse(requestSchema, input);
  const payloadHash = hash(JSON.stringify(data));
  return database().begin(async (tx) => {
    const profile = await trustedAccess(tx, userId);
    if (profile.role !== 'client' || !profile.client_id) throw deny();
    await tx`select pg_advisory_xact_lock(hashtextextended(${`intake-rate:${userId}`},0))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`request:${data.id}`},0))`;
    const existing =
      await tx`select created_by,payload_hash from public.audit_requests where id=${data.id}`;
    if (existing.length) {
      if (existing[0].created_by === userId && existing[0].payload_hash === payloadHash)
        return { id: data.id };
      throw new WorkspaceError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Référence déjà utilisée pour une autre demande.',
      );
    }
    if (data.preferredDate && data.preferredDate < new Date().toISOString().slice(0, 10))
      throw new WorkspaceError(400, 'PAST_DATE', 'Choisissez une date à venir.');
    const count =
      await tx`select count(*) as n from public.audit_requests where created_by=${userId} and created_at>now()-interval '1 day'`;
    if (Number(count[0].n) >= 20)
      throw new WorkspaceError(
        429,
        'REQUEST_LIMIT',
        'Limite quotidienne atteinte. Contactez Écartéo.',
      );
    await tx`insert into public.audit_requests(id,client_id,created_by,title,sector,channels,site_count,preferred_date,brief,payload_hash)
      values(${data.id},${profile.client_id},${userId},${data.title},${data.sector},${data.channels},${data.siteCount},${data.preferredDate},${data.brief},${payloadHash})`;
    return { id: data.id };
  });
}
export async function reviewRequest(userId: string, input: unknown) {
  const data = parse(reviewRequestSchema, input);
  return database().begin(async (tx) => {
    const profile = await trustedAccess(tx, userId);
    const rows = await tx`select * from public.audit_requests where id=${data.id} for update`;
    const request = rows[0];
    if (
      !request ||
      (profile.role !== 'qualite' &&
        (profile.role !== 'client' || profile.client_id !== request.client_id))
    )
      throw new WorkspaceError(404, 'REQUEST_NOT_FOUND', 'Demande introuvable.');
    if (request.revision !== data.revision)
      throw new WorkspaceError(
        409,
        'STALE_REQUEST',
        'Cette demande a changé. Actualisez la liste.',
      );
    if (data.action === 'cancel') {
      if (profile.role !== 'client' || request.status !== 'submitted') throw deny();
    } else if (profile.role !== 'qualite') throw deny();
    if (!['submitted', 'accepted'].includes(request.status))
      throw new WorkspaceError(409, 'REQUEST_CLOSED', 'Cette demande est déjà clôturée.');
    if (data.action === 'decline' && data.note.length < 5)
      throw new WorkspaceError(400, 'REASON_REQUIRED', 'Indiquez la raison du refus.');
    let scenarioId: string | null = null;
    if (data.action === 'convert') {
      scenarioId = randomUUID();
      const scenario: Scenario = {
        id: scenarioId,
        clientId: request.client_id,
        title: request.title,
        objective: request.brief,
        family: 'info',
        channels: request.channels,
        lang: 'FR',
        persona: '',
        steps: [{ label: '', seuil: '' }],
        evidence: [],
        limits: '',
        status: 'draft',
        parentId: null,
        createdAt: new Date().toISOString(),
      };
      await tx`insert into public.scenarios(id,client_id,status,content,created_by)
        values(${scenarioId},${request.client_id},'draft',${tx.json(JSON.parse(JSON.stringify(scenario)))},${userId})`;
    }
    const status = {
      accept: 'accepted',
      decline: 'declined',
      cancel: 'cancelled',
      convert: 'converted',
    }[data.action];
    await tx`update public.audit_requests set status=${status},review_note=${data.note},reviewed_by=${userId},
      scenario_id=${scenarioId},revision=revision+1,updated_at=now() where id=${data.id}`;
    return { id: data.id, scenarioId };
  });
}
