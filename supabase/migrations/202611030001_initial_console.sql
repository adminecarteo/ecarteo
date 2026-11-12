-- Écartéo hosted foundation. Applying this migration does not connect the local app.
-- Deliberately no browser write policies: an authenticated, transactional command API is required.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to authenticated;

create type public.console_role as enum ('qualite', 'operateur', 'client');
create type public.scenario_status as enum ('draft', 'validated');
create type public.mission_status as enum ('todo', 'doing', 'review', 'done');
create type public.evidence_type as enum ('capture', 'email', 'appel', 'note', 'fichier');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 250),
  site_count integer not null default 1 check (site_count > 0),
  created_at timestamptz not null default now()
);

-- Only trusted provisioning creates these rows. Never derive role/client_id from user_metadata.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 250),
  role public.console_role not null,
  client_id uuid references public.clients(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check ((role = 'client' and client_id is not null) or (role <> 'client' and client_id is null))
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  parent_id uuid,
  revision integer not null default 1 check (revision > 0),
  status public.scenario_status not null default 'draft',
  -- Versioned, bilingual ScenarioDraft data; the command API validates its complete schema.
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  unique(id, client_id),
  foreign key (parent_id, client_id) references public.scenarios(id, client_id) on delete restrict,
  check ((status = 'draft' and approved_by is null and approved_at is null)
    or (status = 'validated' and approved_by is not null and approved_at is not null))
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  scenario_id uuid not null,
  scenario_snapshot jsonb not null check (jsonb_typeof(scenario_snapshot) = 'object'),
  criteria_version text not null default 'ecarteo-v1',
  criteria_snapshot jsonb not null check (jsonb_typeof(criteria_snapshot) = 'array'),
  baseline_mission_id uuid,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  scheduled_at timestamptz not null,
  status public.mission_status not null default 'todo',
  elapsed_ms bigint not null default 0 check (elapsed_ms >= 0),
  running_since timestamptz,
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  scores jsonb not null default '{}' check (jsonb_typeof(scores) = 'object'),
  comments jsonb not null default '{}' check (jsonb_typeof(comments) = 'object'),
  critical boolean not null default false,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  validated_by uuid references public.profiles(id) on delete restrict,
  validated_at timestamptz,
  unique(id, client_id),
  foreign key (scenario_id, client_id) references public.scenarios(id, client_id) on delete restrict,
  foreign key (baseline_mission_id, client_id) references public.missions(id, client_id) on delete restrict,
  check (baseline_mission_id is null or baseline_mission_id <> id),
  check (running_since is null or status = 'doing'),
  check ((status = 'done' and validated_by is not null and validated_at is not null)
    or (status <> 'done' and validated_by is null and validated_at is null))
);

-- Clients read this frozen projection; they never read working mission/scenario records.
create table public.published_reports (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique,
  client_id uuid not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  score smallint not null check (score between 0 and 100),
  critical boolean not null default false,
  published_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  foreign key (mission_id, client_id) references public.missions(id, client_id) on delete restrict
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  client_id uuid not null,
  type public.evidence_type not null,
  label jsonb not null,
  content jsonb not null default '""',
  occurred_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  bucket_id text not null default 'ecarteo-evidence' check (bucket_id = 'ecarteo-evidence'),
  object_path text,
  filename text,
  mime_type text,
  size_bytes bigint check (size_bytes between 1 and 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  client_visible boolean not null default false,
  foreign key (mission_id, client_id) references public.missions(id, client_id) on delete restrict,
  unique(bucket_id, object_path),
  check ((object_path is null and filename is null and mime_type is null and size_bytes is null)
    or (object_path is not null and filename is not null and mime_type is not null and size_bytes is not null)),
  -- Generated by the server, never accepted directly from browser input.
  check (object_path is null or object_path = client_id::text || '/' || mission_id::text || '/' || id::text),
  check (mime_type is null or mime_type in ('image/png','image/jpeg','image/webp','application/pdf','text/plain','message/rfc822'))
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  client_id uuid not null,
  criterion_id text not null check (criterion_id in ('dispo','vitesse','compr','commercial','omni','lang','sensible','suivi')),
  horizon smallint not null check (horizon in (7,30,90)),
  content jsonb not null,
  owner_label jsonb not null default '""',
  due_at timestamptz not null,
  done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (mission_id, client_id) references public.missions(id, client_id) on delete restrict,
  check ((done and completed_at is not null and completed_by is not null)
    or (not done and completed_at is null and completed_by is null))
);

create table public.mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  client_id uuid not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (mission_id, client_id) references public.missions(id, client_id) on delete restrict
);

-- Transactional command adapter stores a receipt in the same transaction as its writes.
create table app_private.command_receipts (
  actor_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  command_type text not null,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id, idempotency_key)
);

create index profiles_client_idx on public.profiles(client_id) where client_id is not null;
create index scenarios_client_status_idx on public.scenarios(client_id, status);
create index scenarios_parent_idx on public.scenarios(parent_id) where parent_id is not null;
create index missions_client_status_date_idx on public.missions(client_id, status, scheduled_at desc);
create index missions_operator_status_idx on public.missions(operator_id, status, scheduled_at);
create index missions_scenario_idx on public.missions(scenario_id);
create index missions_baseline_idx on public.missions(baseline_mission_id) where baseline_mission_id is not null;
create index reports_client_published_idx on public.published_reports(client_id, published_at desc);
create index evidence_mission_time_idx on public.evidence(mission_id, occurred_at);
create index evidence_client_type_idx on public.evidence(client_id, type);
create index actions_client_open_due_idx on public.actions(client_id, due_at) where not done;
create index actions_mission_idx on public.actions(mission_id);
create index events_mission_time_idx on public.mission_events(mission_id, created_at);

-- These helpers consult immutable, trusted account assignments rather than user-editable JWT metadata.
-- All names are qualified; an empty search_path prevents object shadowing.
create function app_private.current_role() returns public.console_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.active
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
$$;
create function app_private.current_client() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.client_id from public.profiles p
  where p.id = (select auth.uid()) and p.active and p.role = 'client'
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
$$;
create function app_private.can_read_working_mission(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.missions m where m.id = target and (
    (select app_private.current_role()) = 'qualite'
    or ((select app_private.current_role()) = 'operateur' and m.operator_id = (select auth.uid()))
  ))
$$;
create function app_private.can_read_published_mission(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.missions m join public.published_reports r on r.mission_id = m.id
    where m.id = target and m.status = 'done' and (
      app_private.can_read_working_mission(m.id)
      or ((select app_private.current_role()) = 'client' and m.client_id = (select app_private.current_client()))
    ))
$$;

create function app_private.freeze_scenario() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'validated' then
    raise exception 'Approved scenarios are immutable; create a new revision' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.client_id <> old.client_id or new.id <> old.id or new.parent_id is distinct from old.parent_id then
    raise exception 'Scenario identity is immutable' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger scenario_immutable before update or delete on public.scenarios
for each row execute function app_private.freeze_scenario();

create function app_private.guard_mission() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    if old.status = 'done' then raise exception 'Published missions are immutable' using errcode = '23514'; end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.id <> old.id or new.client_id <> old.client_id or new.scenario_id <> old.scenario_id
      or new.scenario_snapshot <> old.scenario_snapshot or new.criteria_version <> old.criteria_version
      or new.criteria_snapshot <> old.criteria_snapshot or new.baseline_mission_id is distinct from old.baseline_mission_id then
      raise exception 'Mission snapshot and lineage are immutable' using errcode = '23514';
    end if;
    if new.status <> old.status and not (
      (old.status = 'todo' and new.status = 'doing') or (old.status = 'doing' and new.status = 'review')
      or (old.status = 'review' and new.status = 'done')
    ) then raise exception 'Invalid mission transition' using errcode = '23514'; end if;
    new.revision := old.revision + 1;
  end if;
  if not exists(select 1 from public.profiles p where p.id = new.operator_id and p.role = 'operateur' and p.active) then
    raise exception 'Mission operator must be an active operator profile' using errcode = '23514';
  end if;
  if not exists(select 1 from public.scenarios s where s.id = new.scenario_id and s.status = 'validated') then
    raise exception 'Mission requires an approved scenario' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger mission_guard before insert or update or delete on public.missions
for each row execute function app_private.guard_mission();

create function app_private.prevent_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'This record is append-only' using errcode = '23514'; end $$;
create trigger report_immutable before update or delete on public.published_reports
for each row execute function app_private.prevent_mutation();
create trigger event_immutable before update or delete on public.mission_events
for each row execute function app_private.prevent_mutation();

create function app_private.guard_evidence() returns trigger
language plpgsql set search_path = '' as $$
declare target uuid;
begin
  target := case when tg_op = 'DELETE' then old.mission_id else new.mission_id end;
  if exists(select 1 from public.missions where id = target and status = 'done')
    or (tg_op = 'UPDATE' and exists(select 1 from public.missions where id = old.mission_id and status = 'done')) then
    raise exception 'Evidence attached to a published mission is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger evidence_guard before insert or update or delete on public.evidence
for each row execute function app_private.guard_evidence();

create function app_private.guard_report() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from public.missions m where m.id = new.mission_id and m.status = 'done'
    and m.client_id = new.client_id and m.validated_by = new.published_by) then
    raise exception 'Report requires a matching approved mission' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger report_guard before insert on public.published_reports
for each row execute function app_private.guard_report();

create function app_private.ensure_published_report() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'done' and not exists(select 1 from public.published_reports where mission_id = new.id) then
    raise exception 'Mission approval and report publication must commit together' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger mission_requires_report after insert or update on public.missions
deferrable initially deferred for each row execute function app_private.ensure_published_report();

-- Grant explicitly; permissive Supabase project defaults must never expose writes.
revoke all on public.clients, public.profiles, public.scenarios, public.missions,
  public.published_reports, public.evidence, public.actions, public.mission_events from public, anon, authenticated;
grant select on public.clients, public.profiles, public.scenarios, public.missions,
  public.published_reports, public.evidence, public.actions, public.mission_events to authenticated;
grant all on public.clients, public.profiles, public.scenarios, public.missions,
  public.published_reports, public.evidence, public.actions, public.mission_events to service_role;
revoke all on app_private.command_receipts from public, anon, authenticated;
grant all on app_private.command_receipts to service_role;
grant usage on schema app_private to service_role;

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.missions enable row level security;
alter table public.published_reports enable row level security;
alter table public.evidence enable row level security;
alter table public.actions enable row level security;
alter table public.mission_events enable row level security;
alter table app_private.command_receipts enable row level security;

create policy clients_read on public.clients for select to authenticated using (
  (select app_private.current_role()) = 'qualite'
  or id = (select app_private.current_client())
  or exists(select 1 from public.missions m where m.client_id = clients.id and app_private.can_read_working_mission(m.id))
);
create policy profiles_read on public.profiles for select to authenticated using (
  (select app_private.current_role()) = 'qualite'
  or (id = (select auth.uid()) and (select app_private.current_role()) is not null)
);
create policy scenarios_read on public.scenarios for select to authenticated using (
  (select app_private.current_role()) = 'qualite'
  or exists(select 1 from public.missions m where m.scenario_id = scenarios.id and app_private.can_read_working_mission(m.id))
);
create policy missions_read on public.missions for select to authenticated using (app_private.can_read_working_mission(id));
create policy reports_read on public.published_reports for select to authenticated using (app_private.can_read_published_mission(mission_id));
create policy evidence_read on public.evidence for select to authenticated using (
  app_private.can_read_working_mission(mission_id)
  or (client_visible and app_private.can_read_published_mission(mission_id))
);
create policy actions_read on public.actions for select to authenticated using (
  app_private.can_read_working_mission(mission_id) or app_private.can_read_published_mission(mission_id)
);
create policy events_read on public.mission_events for select to authenticated using (app_private.can_read_working_mission(mission_id));

revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.current_role(), app_private.current_client(),
  app_private.can_read_working_mission(uuid), app_private.can_read_published_mission(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ecarteo-evidence','ecarteo-evidence',false,10485760,
  array['image/png','image/jpeg','image/webp','application/pdf','text/plain','message/rfc822']);

-- A metadata row authorizes exactly one object; path guessing conveys no access.
create policy ecarteo_evidence_read on storage.objects for select to authenticated using (
  bucket_id = 'ecarteo-evidence' and exists(
    select 1 from public.evidence e where e.bucket_id = storage.objects.bucket_id
      and e.object_path = storage.objects.name
  )
);
-- No INSERT/UPDATE/DELETE policy is created. Uploads must use the future trusted command endpoint.
-- Service role keys bypass RLS and belong only on the server.

comment on schema app_private is 'Internal policy helpers and command receipts. Do not add to exposed API schemas.';
comment on table public.profiles is 'Trusted provisioning only. Browser has no writes; role/client_id never copied from user_metadata.';
comment on table public.published_reports is 'Immutable client-safe report projection; browser clients cannot read working mission records.';
commit;
