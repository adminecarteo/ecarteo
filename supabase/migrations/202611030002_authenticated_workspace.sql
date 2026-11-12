begin;

alter table public.mission_events add column event_sequence bigint generated always as identity;

-- RLS clients may read this table directly. Redaction must be enforced at publication, not just in HTTP responses.
alter table public.published_reports add constraint published_report_client_safe check (
  coalesce(snapshot #>> '{scenario,persona}','') = ''
  and coalesce(snapshot #>> '{scenario,limits}','') = ''
  and coalesce(snapshot #> '{scenario,steps}','[]'::jsonb) = '[]'::jsonb
  and coalesce(snapshot #> '{scenario,evidence}','[]'::jsonb) = '[]'::jsonb
);

create table app_private.auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null check (attempts > 0)
);
create index auth_rate_limits_window_idx on app_private.auth_rate_limits(window_started_at);
alter table app_private.auth_rate_limits enable row level security;
revoke all on app_private.auth_rate_limits from public, anon, authenticated;
grant all on app_private.auth_rate_limits to service_role;

-- A pending upload is private until evidence.add atomically attaches it to its authorized mission.
create table app_private.staged_attachments (
  id uuid primary key,
  client_id uuid not null,
  mission_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  object_path text not null unique,
  filename text not null check (length(filename) between 1 and 500),
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','application/pdf','text/plain','message/rfc822')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key(mission_id,client_id) references public.missions(id,client_id) on delete restrict,
  check (object_path = client_id::text || '/' || mission_id::text || '/' || id::text)
);
create index staged_attachments_owner_time_idx on app_private.staged_attachments(owner_id,created_at);
alter table app_private.staged_attachments enable row level security;
revoke all on app_private.staged_attachments from public, anon, authenticated;
grant all on app_private.staged_attachments to service_role;

create or replace function app_private.current_role() returns public.console_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
$$;
create or replace function app_private.current_client() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.client_id from public.profiles p join auth.users u on u.id=p.id
  where p.id=(select auth.uid()) and p.active and p.role='client' and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false)
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
$$;

-- Self-signup can create only a customer account. Editable metadata supplies display labels only.
-- Confirmation is checked in both this trigger and the server's fresh account lookup.
create function app_private.provision_confirmed_customer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare new_client uuid;
declare company_name text;
declare full_name text;
begin
  if new.email_confirmed_at is null or coalesce(new.is_anonymous,false) then return new; end if;
  if exists(select 1 from public.profiles p where p.id=new.id) then return new; end if;
  company_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'company_name'),''),'Mon organisation'),250);
  full_name := left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),nullif(split_part(new.email,'@',1),''),'Client'),250);
  insert into public.clients(name) values(company_name) returning id into new_client;
  insert into public.profiles(id,display_name,role,client_id,active)
    values(new.id,full_name,'client',new_client,true);
  return new;
end $$;
revoke all on function app_private.provision_confirmed_customer() from public, anon, authenticated;
create trigger ecarteo_customer_after_confirmation
after insert or update of email_confirmed_at on auth.users
for each row execute function app_private.provision_confirmed_customer();

comment on table app_private.staged_attachments is 'Server-only upload reservations; never returned across owners or tenant boundaries.';
comment on function app_private.provision_confirmed_customer() is 'Confirmed signup only; always client role. Staff provisioning remains a trusted administrator operation.';
commit;
