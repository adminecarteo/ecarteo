begin;
-- Stable keyset ordering for bounded workspace lists and tenant-filtered history.
create index scenarios_created_page_idx on public.scenarios(created_at desc,id desc);
create index scenarios_tenant_page_idx on public.scenarios(client_id,created_at desc,id desc);
create index missions_created_page_idx on public.missions(created_at desc,id desc);
create index missions_tenant_page_idx on public.missions(client_id,created_at desc,id desc);
create index missions_operator_page_idx on public.missions(operator_id,created_at desc,id desc);
create index reports_published_page_idx on public.published_reports(published_at desc,mission_id desc);
create index reports_tenant_page_idx on public.published_reports(client_id,published_at desc,mission_id desc);
commit;
