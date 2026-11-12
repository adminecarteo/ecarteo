begin;

alter table public.profiles add column is_client_admin boolean not null default false;
alter table public.profiles add constraint client_admin_role check (not is_client_admin or role='client');
-- Existing identities are not silently promoted. A trusted quality administrator must nominate owners.

create table app_private.team_invitations (
  id uuid primary key,
  email text not null check (email=lower(btrim(email)) and length(email) <=254),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role public.console_role not null,
  client_id uuid references public.clients(id) on delete restrict,
  is_client_admin boolean not null default false,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete restrict,
  check ((role='client' and client_id is not null) or (role<>'client' and client_id is null)),
  check (not is_client_admin or role='client'),
  check ((accepted_at is null)=(accepted_by is null)),
  check (expires_at>created_at)
);
create unique index team_invitations_pending_email_idx on app_private.team_invitations(email)
  where revoked_at is null and accepted_at is null;
alter table app_private.team_invitations enable row level security;
revoke all on app_private.team_invitations from public,anon,authenticated;
grant all on app_private.team_invitations to service_role;

create table app_private.account_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_id uuid not null,
  kind text not null check (kind in ('invitation.created','invitation.revoked','invitation.accepted','member.updated')),
  created_at timestamptz not null default now(),
  detail jsonb not null default '{}'
);
alter table app_private.account_events enable row level security;
revoke all on app_private.account_events from public,anon,authenticated;
grant all on app_private.account_events to service_role;
grant usage,select on sequence app_private.account_events_id_seq to service_role;
create trigger account_event_immutable before update or delete on app_private.account_events
  for each row execute function app_private.prevent_mutation();

create table public.audit_requests (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete restrict,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(title) between 5 and 160),
  sector text not null check (sector in ('hospitality','health','training','property')),
  channels text[] not null check (cardinality(channels) between 1 and 6 and channels <@ array['form','email','phone','whatsapp','chat','social']::text[]),
  site_count integer not null check (site_count between 1 and 10000),
  preferred_date date,
  brief text not null check (length(brief) between 20 and 5000),
  status text not null default 'submitted' check (status in ('submitted','accepted','declined','cancelled','converted')),
  review_note text not null default '' check (length(review_note)<=2000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  scenario_id uuid,
  revision integer not null default 1 check (revision>0),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(scenario_id,client_id) references public.scenarios(id,client_id) on delete restrict,
  check ((status='converted')=(scenario_id is not null))
);
create index audit_requests_client_time_idx on public.audit_requests(client_id,created_at desc,id desc);
create index audit_requests_status_time_idx on public.audit_requests(status,created_at desc,id desc);
alter table public.audit_requests enable row level security;
revoke all on public.audit_requests from public,anon,authenticated;
grant select on public.audit_requests to authenticated;
grant all on public.audit_requests to service_role;
create policy audit_requests_read on public.audit_requests for select to authenticated using (
  (select app_private.current_role())='qualite'
  or client_id=(select app_private.current_client())
);

-- An invited identity must explicitly accept the email-bound token before receiving any role.
-- Never derive tenant, staff role or admin authority from editable Auth metadata.
create or replace function app_private.provision_confirmed_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare new_client uuid;
declare company_name text;
declare full_name text;
begin
  if new.email_confirmed_at is null or coalesce(new.is_anonymous,false) then return new; end if;
  if exists(select 1 from public.profiles p where p.id=new.id) then return new; end if;
  if exists(select 1 from app_private.team_invitations i where i.email=lower(btrim(new.email))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) then return new; end if;
  company_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'company_name'),''),'Mon organisation'),250);
  full_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'Client'),250);
  insert into public.clients(name) values(company_name) returning id into new_client;
  insert into public.profiles(id,display_name,role,client_id,active,is_client_admin)
    values(new.id,full_name,'client',new_client,true,true);
  return new;
end $$;
revoke all on function app_private.provision_confirmed_customer() from public,anon,authenticated;
comment on column public.profiles.is_client_admin is 'Trusted owner/admin flag, never sourced from editable metadata. Existing accounts require explicit nomination.';
commit;
