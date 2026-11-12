'use client';
import { useState, type FormEvent } from 'react';
import type { MemberRecord, TeamPage, OrganizationPage } from '@/lib/accounts-requests-schema';
import { useLocale } from '@/lib/locale-context';
import { portalRequest } from '@/lib/portal-client';
import styles from './portal.module.css';

function roleLabels(copy: (fr: string, en: string) => string): Record<string, string> {
  return {
    qualite: copy('Responsable qualité', 'Quality manager'),
    operateur: copy('Opérateur', 'Operator'),
    client: copy('Client', 'Client'),
  };
}
export function TeamPanel({ initial, actorId }: { initial: TeamPage; actorId: string }) {
  const { locale, copy } = useLocale();
  const roles = roleLabels(copy);
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('client');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [organizationSearch, setOrganizationSearch] = useState('');
  const [organizations, setOrganizations] = useState<OrganizationPage>({
    clients: initial.clients,
    total: initial.clientTotal,
    page: 1,
    pageSize: 25,
  });
  async function findOrganizations(page = 1) {
    setOrganizations(
      await portalRequest<OrganizationPage>(
        `/api/team/organizations?${new URLSearchParams({ page: String(page), search: organizationSearch })}`,
      ),
    );
  }
  async function reload(page = data.page) {
    setData(
      await portalRequest<TeamPage>(
        `/api/team?${new URLSearchParams({ page: String(page), search })}`,
      ),
    );
  }
  async function perform(work: () => Promise<void>) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy('Réessayez.', 'Please try again.'));
    } finally {
      setPending(false);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    await perform(async () => {
      const result = await portalRequest<{ url: string }>('/api/team', 'POST', {
        email: fields.get('email'),
        role,
        clientId: role === 'client' ? fields.get('clientId') : null,
        isClientAdmin: role === 'client' && fields.get('isClientAdmin') === 'on',
      });
      setInviteUrl(result.url);
      setMessage(
        copy(
          'Invitation créée. Copiez le lien et transmettez-le à la personne concernée.',
          'Invitation created. Copy the link and share it with the intended recipient.',
        ),
      );
      form.reset();
      await reload();
    });
  }
  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>{copy('Inviter un membre', 'Invite a member')}</h2>
          <form className={styles.form} onSubmit={invite}>
            <label className={styles.field}>
              {copy('Adresse email', 'Email address')}
              <input name="email" type="email" required maxLength={254} autoComplete="email" />
            </label>
            <label className={styles.field}>
              {copy('Rôle', 'Role')}
              <select
                aria-label={copy('Rôle', 'Role')}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {Object.entries(roles).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {role === 'client' && (
              <>
                <label className={styles.field}>
                  {copy('Rechercher une organisation', 'Find an organization')}
                  <input
                    value={organizationSearch}
                    onChange={(e) => setOrganizationSearch(e.target.value)}
                    maxLength={160}
                    placeholder={copy('Nom de l’organisation', 'Organization name')}
                  />
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={pending}
                  onClick={() => void perform(() => findOrganizations())}
                >
                  {copy('Chercher l’organisation', 'Find organization')}
                </button>
                <label className={styles.field}>
                  {copy('Organisation', 'Organization')}
                  <select
                    aria-label={copy('Organisation', 'Organization')}
                    name="clientId"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {copy('Choisir une organisation', 'Choose an organization')}
                    </option>
                    {organizations.clients.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {organizations.total > organizations.pageSize && (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className="btn"
                      disabled={pending || organizations.page <= 1}
                      onClick={() => void perform(() => findOrganizations(organizations.page - 1))}
                    >
                      {copy('← Organisations', '← Organizations')}
                    </button>
                    <span>
                      {organizations.page} /{' '}
                      {Math.ceil(organizations.total / organizations.pageSize)}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        pending ||
                        organizations.page * organizations.pageSize >= organizations.total
                      }
                      onClick={() => void perform(() => findOrganizations(organizations.page + 1))}
                    >
                      {copy('Organisations →', 'Organizations →')}
                    </button>
                  </div>
                )}
                <label className={styles.check}>
                  <input type="checkbox" name="isClientAdmin" />
                  {copy('Administrateur de la facturation', 'Billing administrator')}
                </label>
              </>
            )}
            <p className={styles.muted}>
              {copy(
                'Le lien expire après 7 jours. La personne devra confirmer cette adresse email avant d’accepter. Aucun email n’est envoyé automatiquement.',
                'The link expires after 7 days. The recipient must confirm this email address before accepting. No email is sent automatically.',
              )}
            </p>
            <button
              className="btn primary"
              type="submit"
              disabled={pending || (role === 'client' && !organizations.clients.length)}
            >
              {copy('Créer une invitation', 'Create invitation')}
            </button>
          </form>
          {inviteUrl && (
            <div className={styles.message}>
              <label htmlFor="invite-link">
                {copy('Lien personnel — affiché une seule fois', 'Personal link — shown only once')}
              </label>
              <input
                id="invite-link"
                className={styles.linkValue}
                value={inviteUrl}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button
                className="btn"
                type="button"
                onClick={() =>
                  void perform(async () => {
                    await navigator.clipboard.writeText(inviteUrl);
                    setMessage(copy('Lien copié.', 'Link copied.'));
                  })
                }
              >
                {copy('Copier le lien', 'Copy link')}
              </button>
            </div>
          )}
        </section>
        <section className={styles.card}>
          <h2>{copy('Membres et accès', 'Members and access')}</h2>
          <form
            className={styles.toolbar}
            onSubmit={(e) => {
              e.preventDefault();
              void perform(() => reload(1));
            }}
          >
            <label className={styles.field}>
              {copy('Rechercher', 'Search')}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy('Nom, email ou organisation', 'Name, email or organization')}
                maxLength={160}
              />
            </label>
            <button className="btn" disabled={pending}>
              {copy('Rechercher', 'Search')}
            </button>
          </form>
          {data.members.length === 0 && (
            <p className={styles.muted}>
              {copy('Aucun membre pour cette recherche.', 'No members match this search.')}
            </p>
          )}
          {data.members.map((member) => (
            <MemberEditor
              key={`${member.id}:${member.name}:${member.active}:${member.isClientAdmin}`}
              member={member}
              self={member.id === actorId}
              pending={pending}
              onSave={(input) =>
                perform(async () => {
                  await portalRequest('/api/team', 'PATCH', input);
                  setMessage(copy('Accès mis à jour.', 'Access updated.'));
                  await reload();
                })
              }
            />
          ))}
          <div className={styles.pager}>
            <button
              className="btn"
              disabled={pending || data.page <= 1}
              onClick={() => void perform(() => reload(data.page - 1))}
            >
              {copy('Précédent', 'Previous')}
            </button>
            <span>
              {data.total} {copy('membres · page', 'members · page')} {data.page}
            </span>
            <button
              className="btn"
              disabled={pending || data.page * data.pageSize >= data.total}
              onClick={() => void perform(() => reload(data.page + 1))}
            >
              {copy('Suivant', 'Next')}
            </button>
          </div>
        </section>
      </div>
      <section className={`${styles.card} ${styles.wide}`}>
        <h2>{copy('Invitations récentes', 'Recent invitations')}</h2>
        <p className={styles.muted}>
          {copy(
            'Les 50 dernières invitations correspondant à la recherche. Créer un nouveau lien pour une adresse révoque son ancien lien.',
            'The 50 most recent invitations matching your search. Creating a new link for an email address revokes its previous link.',
          )}
        </p>
        {data.invitations.length === 0 && <p>{copy('Aucune invitation.', 'No invitations.')}</p>}
        {data.invitations.map((invite) => (
          <article className={styles.item} key={invite.id}>
            <strong>{invite.email}</strong>
            <div className={styles.meta}>
              <span>{roles[invite.role]}</span>
              <span>{invite.clientName}</span>
              <span>
                {invite.acceptedAt
                  ? copy('Acceptée', 'Accepted')
                  : invite.revokedAt
                    ? copy('Révoquée', 'Revoked')
                    : invite.expired
                      ? copy('Expirée', 'Expired')
                      : `${copy('Expire le', 'Expires on')} ${new Date(invite.expiresAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { timeZone: 'Europe/Paris' })}`}
              </span>
            </div>
            {!invite.acceptedAt && !invite.revokedAt && (
              <div>
                <button
                  className="btn"
                  disabled={pending}
                  onClick={() =>
                    void perform(async () => {
                      await portalRequest('/api/team', 'DELETE', { id: invite.id });
                      setMessage(copy('Invitation révoquée.', 'Invitation revoked.'));
                      await reload();
                    })
                  }
                >
                  {copy('Révoquer le lien', 'Revoke link')}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
function MemberEditor({
  member,
  self,
  pending,
  onSave,
}: {
  member: MemberRecord;
  self: boolean;
  pending: boolean;
  onSave: (value: unknown) => Promise<void>;
}) {
  const { copy } = useLocale();
  const roles = roleLabels(copy);
  return (
    <form
      className={styles.item}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void onSave({
          id: member.id,
          displayName: f.get('displayName'),
          active: self ? true : f.get('active') === 'on',
          isClientAdmin: f.get('isClientAdmin') === 'on',
          expected: {
            displayName: member.name,
            active: member.active,
            isClientAdmin: member.isClientAdmin,
          },
        });
      }}
    >
      <label className={styles.field}>
        {copy('Nom du membre', 'Member name')}
        <input
          name="displayName"
          required
          minLength={2}
          maxLength={120}
          defaultValue={member.name}
        />
      </label>
      <div className={styles.meta}>
        <span>{member.email}</span>
        <span>
          {roles[member.role]}
          {self ? copy(' · vous', ' · you') : ''}
        </span>
        <span>{member.clientName}</span>
      </div>
      <div className={styles.actions}>
        <label className={styles.check}>
          <input name="active" type="checkbox" disabled={self} defaultChecked={member.active} />{' '}
          {copy('Accès actif', 'Active access')}
        </label>
        {member.role === 'client' && (
          <label className={styles.check}>
            <input type="checkbox" name="isClientAdmin" defaultChecked={member.isClientAdmin} />{' '}
            {copy('Administrateur de la facturation', 'Billing administrator')}
          </label>
        )}
        <button className="btn" type="submit" disabled={pending}>
          {copy('Enregistrer l’accès', 'Save access')}
        </button>
      </div>
    </form>
  );
}
