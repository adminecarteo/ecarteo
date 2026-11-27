begin;

-- Account-scoped, server-only dispatch bookkeeping. Never backfill existing identities.
create table app_private.registration_activations (
  account_id uuid primary key references auth.users(id) on delete cascade,
  activated_at timestamptz not null default clock_timestamp(),
  receipt_hash text unique check (receipt_hash ~ '^[0-9a-f]{64}$'),
  receipt_issued_at timestamptz,
  receipt_expires_at timestamptz,
  next_path text not null default '/app' check (next_path in ('/app','/app/requests')),
  settled_at timestamptz,
  decision text check (decision in ('dispatch','declined','expired')),
  check ((receipt_hash is null) = (receipt_issued_at is null)),
  check ((receipt_hash is null) = (receipt_expires_at is null)),
  check (receipt_expires_at > receipt_issued_at),
  check ((settled_at is null) = (decision is null))
);
alter table app_private.registration_activations enable row level security;
revoke all on app_private.registration_activations from public,anon,authenticated;
grant all on app_private.registration_activations to service_role;

create function app_private.record_registration_activation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active and new.role='client' and exists (
    select 1 from auth.users u where u.id=new.id and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous,false)
  ) then
    insert into app_private.registration_activations(account_id) values(new.id)
      on conflict(account_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function app_private.record_registration_activation() from public,anon,authenticated;
create trigger ecarteo_registration_after_profile
  after insert on public.profiles
  for each row execute function app_private.record_registration_activation();

comment on table app_private.registration_activations is
  'At-most-once registration analytics dispatch. New profile activation only; no identity or receipt is sent to analytics. Refusal consumes the dispatch opportunity.';
commit;
