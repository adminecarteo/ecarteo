-- Privileged operations journal. No application role can read or modify these records.
begin;
create table app_private.privacy_cases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  kind text not null check (kind in ('access','correction','erasure')),
  reference text not null check (length(reference) between 1 and 200),
  status text not null default 'open' check (status in ('open','completed','declined')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  resolution_reference text,
  unique(id,client_id),
  check ((status='open' and closed_at is null and resolution_reference is null)
    or (status<>'open' and closed_at is not null and length(resolution_reference) between 1 and 200))
);
create index privacy_cases_client_status_idx on app_private.privacy_cases(client_id,status,created_at);
create table app_private.operations_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references app_private.privacy_cases(id) on delete restrict,
  operation text not null check(length(operation) between 1 and 100),
  operator_reference text not null check(length(operator_reference) between 1 and 200),
  created_at timestamptz not null default now()
);
alter table app_private.privacy_cases enable row level security;
alter table app_private.operations_events enable row level security;
revoke all on app_private.privacy_cases,app_private.operations_events from public,anon,authenticated;
grant select,insert,update on app_private.privacy_cases to service_role;
grant select,insert on app_private.operations_events to service_role;
create function app_private.protect_operations_journal() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Operations journal is append-only'; end
$$;
create trigger operations_events_immutable before update or delete on app_private.operations_events
for each row execute function app_private.protect_operations_journal();
revoke all on function app_private.protect_operations_journal() from public,anon,authenticated;

-- Corrections are append-only supplements; the originally published assessment stays immutable.
create table public.report_addenda (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null,
  client_id uuid not null,
  case_id uuid not null,
  body text not null check(length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  unique(case_id,mission_id),
  foreign key(case_id,client_id) references app_private.privacy_cases(id,client_id) on delete restrict,
  foreign key(mission_id,client_id) references public.missions(id,client_id) on delete restrict,
  foreign key(mission_id) references public.published_reports(mission_id) on delete restrict
);
create index report_addenda_mission_time_idx on public.report_addenda(mission_id,created_at,id);
alter table public.report_addenda enable row level security;
revoke all on public.report_addenda from public,anon,authenticated;
grant select(id,mission_id,client_id,body,created_at) on public.report_addenda to authenticated;
grant select,insert on public.report_addenda to service_role;
create policy report_addenda_read on public.report_addenda for select to authenticated
using(app_private.can_read_published_mission(mission_id));
create trigger report_addenda_immutable before update or delete on public.report_addenda
for each row execute function app_private.protect_operations_journal();
commit;
