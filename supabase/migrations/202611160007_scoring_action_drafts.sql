-- Editable action plans are visible only to quality staff, even for assigned operators.
create table app_private.scoring_action_drafts (
  mission_id uuid primary key references public.missions(id) on delete cascade,
  revision integer not null check (revision > 0),
  actions jsonb not null check (jsonb_typeof(actions) = 'array' and jsonb_array_length(actions) <= 8)
);

alter table app_private.scoring_action_drafts enable row level security;
revoke all on app_private.scoring_action_drafts from public, anon, authenticated;
grant select on app_private.scoring_action_drafts to authenticated;
grant all on app_private.scoring_action_drafts to service_role;

create policy quality_reads_scoring_action_drafts on app_private.scoring_action_drafts
  for select to authenticated using ((select app_private.current_role()) = 'qualite');
