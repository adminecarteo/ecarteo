-- Run only against a disposable local Supabase database after the migration.
-- psql -v ON_ERROR_STOP=1 "$LOCAL_DATABASE_URL" -f supabase/tests/isolation.sql
-- Fixtures and checks are rolled back; no pgTAP extension is required.
begin;

insert into auth.users(id,email) values
 ('10000000-0000-0000-0000-000000000001','quality@example.test'),
 ('10000000-0000-0000-0000-000000000002','operator-a@example.test'),
 ('10000000-0000-0000-0000-000000000003','operator-b@example.test'),
 ('10000000-0000-0000-0000-000000000004','client-a@example.test'),
 ('10000000-0000-0000-0000-000000000005','client-b@example.test'),
 ('10000000-0000-0000-0000-000000000006','unprovisioned@example.test'),
 ('10000000-0000-0000-0000-000000000007','disabled@example.test');
insert into public.clients(id,name) values
 ('20000000-0000-0000-0000-000000000001','Fictional Client A'),
 ('20000000-0000-0000-0000-000000000002','Fictional Client B');
insert into public.profiles(id,display_name,role,client_id,active) values
 ('10000000-0000-0000-0000-000000000001','Quality','qualite',null,true),
 ('10000000-0000-0000-0000-000000000002','Operator A','operateur',null,true),
 ('10000000-0000-0000-0000-000000000003','Operator B','operateur',null,true),
 ('10000000-0000-0000-0000-000000000004','Client A','client','20000000-0000-0000-0000-000000000001',true),
 ('10000000-0000-0000-0000-000000000005','Client B','client','20000000-0000-0000-0000-000000000002',true),
 ('10000000-0000-0000-0000-000000000007','Disabled','client','20000000-0000-0000-0000-000000000001',false);
-- Existing trusted fixtures are confirmed after provisioning; the unprovisioned identity stays unconfirmed.
update auth.users set email_confirmed_at=now() where id in (
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
 '10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004',
 '10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000007');
insert into public.scenarios(id,client_id,status,content,created_by,approved_by,approved_at) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','validated','{"title":"A"}',
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now()),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','validated','{"title":"B"}',
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now());
insert into public.missions(id,client_id,scenario_id,scenario_snapshot,criteria_snapshot,operator_id,scheduled_at,status,created_by) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','{}','[]',
 '10000000-0000-0000-0000-000000000002',now(),'review','10000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','{}','[]',
 '10000000-0000-0000-0000-000000000003',now(),'review','10000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','{}','[]',
 '10000000-0000-0000-0000-000000000003',now(),'review','10000000-0000-0000-0000-000000000001');
insert into public.evidence(id,mission_id,client_id,type,label,occurred_at,uploaded_by,client_visible) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','note','"A published"',now(),'10000000-0000-0000-0000-000000000002',true),
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','note','"B published"',now(),'10000000-0000-0000-0000-000000000003',true),
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','note','"A unpublished"',now(),'10000000-0000-0000-0000-000000000003',false);
update public.evidence set object_path=client_id::text||'/'||mission_id::text||'/'||id::text,
  filename='observation.txt',mime_type='text/plain',size_bytes=100;
insert into storage.objects(bucket_id,name) select bucket_id,object_path from public.evidence;
-- A correctly prefixed object without matching metadata must remain inaccessible.
insert into storage.objects(bucket_id,name) values ('ecarteo-evidence','20000000-0000-0000-0000-000000000001/orphan-object');
update public.missions set status='done',validated_by='10000000-0000-0000-0000-000000000001',validated_at=now()
where id in ('40000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002');
insert into public.published_reports(mission_id,client_id,snapshot,score,published_by) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"title":"A report"}',75,'10000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','{"title":"B report"}',50,'10000000-0000-0000-0000-000000000001');
set constraints all immediate;

insert into app_private.privacy_cases(id,client_id,kind,reference) values
 ('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','correction','LOCAL-TEST');
insert into public.report_addenda(id,mission_id,client_id,case_id,body) values
 ('81000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Approved factual correction.');

do $$ begin
  assert not has_table_privilege('anon','public.clients','SELECT'), 'anon has a client-table grant';
  assert not has_table_privilege('authenticated','public.profiles','UPDATE'), 'authenticated can self-promote';
  assert not has_table_privilege('authenticated','public.missions','INSERT,UPDATE,DELETE'), 'browser has direct mission writes';
  assert not has_function_privilege('anon','app_private.current_role()','EXECUTE'), 'anonymous can execute internal helper';
end $$;

-- Client A: own published projection only, no working records, no foreign tenant.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.clients) = 1, 'client A must see exactly its company';
  assert (select count(*) from public.profiles) = 1, 'client A must see only own profile';
  assert (select count(*) from public.published_reports) = 1, 'client A report isolation failed';
  assert (select count(*) from public.published_reports where client_id='20000000-0000-0000-0000-000000000002') = 0, 'client B report leaked';
  assert (select count(*) from public.evidence) = 1, 'unpublished or other-tenant evidence leaked';
  assert (select count(*) from storage.objects where bucket_id='ecarteo-evidence') = 1, 'private object isolation or orphan protection failed';
  assert (select count(*) from public.missions) = 0, 'working mission records leaked to client';
  assert (select count(*) from public.scenarios) = 0, 'internal scenario records leaked to client';
  assert (select count(id) from public.report_addenda) = 1, 'client A cannot read its correction';
  begin perform case_id from public.report_addenda;
    raise exception 'internal correction case identifier leaked';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set role='qualite',client_id=null where id='10000000-0000-0000-0000-000000000004';
    raise exception 'self-role update unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name) values ('ecarteo-evidence','unauthorized-object');
    raise exception 'direct browser upload unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Client B must get the other projection and not Client A's data.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.published_reports) = 1, 'client B report isolation failed';
  assert (select count(*) from public.published_reports where client_id='20000000-0000-0000-0000-000000000001') = 0, 'client A report leaked';
  assert (select count(*) from storage.objects where bucket_id='ecarteo-evidence') = 1, 'client B object isolation failed';
  assert (select count(id) from public.report_addenda) = 0, 'client A correction leaked to client B';
end $$;
reset role;

-- Operator A has exactly its single assigned mission and associated evidence.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.missions) = 1, 'operator assignment isolation failed';
  assert (select count(*) from public.evidence) = 1, 'operator evidence isolation failed';
  assert (select count(*) from public.clients) = 1, 'operator can read unrelated clients';
  assert (select count(*) from storage.objects where bucket_id='ecarteo-evidence') = 1, 'operator can read unrelated objects';
end $$;
reset role;

-- Quality role may read the complete operational scope.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.clients) = 2, 'quality client scope wrong';
  assert (select count(*) from public.missions) = 3, 'quality mission scope wrong';
  assert (select count(*) from public.published_reports) = 2, 'quality report scope wrong';
end $$;
reset role;

-- No provisioned profile: no access, including when user metadata asks for quality access.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated","user_metadata":{"role":"qualite"}}',true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.clients) = 0, 'unprovisioned identity received access';
  assert (select count(*) from public.published_reports) = 0, 'unprovisioned identity received reports';
end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000007',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}',true);
set local role authenticated;
do $$ begin assert (select count(*) from public.clients) = 0, 'disabled identity received access'; end $$;
reset role;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":true}',true);
set local role authenticated;
do $$ begin assert (select count(*) from public.clients) = 0, 'anonymous Auth session received access'; end $$;
reset role;

set local role anon;
do $$ begin
  assert (select count(*) from storage.objects where bucket_id='ecarteo-evidence') = 0, 'anonymous object access leaked';
  begin perform 1 from public.clients; raise exception 'anonymous SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Immutability is enforced independently of RLS, including trusted database writes.
do $$ begin
  begin update public.published_reports set score=10 where mission_id='40000000-0000-0000-0000-000000000001';
    raise exception 'published report was mutable'; exception when check_violation then null; end;
  begin update public.missions set critical=true where id='40000000-0000-0000-0000-000000000001';
    raise exception 'published mission was mutable'; exception when check_violation then null; end;
  begin update public.scenarios set content='{}' where id='30000000-0000-0000-0000-000000000001';
    raise exception 'approved scenario was mutable'; exception when check_violation then null; end;
  begin update public.evidence set label='"changed"' where id='50000000-0000-0000-0000-000000000001';
    raise exception 'published evidence was mutable'; exception when check_violation then null; end;
  begin update public.missions set status='done',validated_by='10000000-0000-0000-0000-000000000001',validated_at=now()
      where id='40000000-0000-0000-0000-000000000003';
    raise exception 'approval without report unexpectedly committed'; exception when check_violation then null; end;
end $$;

do $$ declare changed boolean := false; begin
  begin
    update public.report_addenda set body='Altered correction' where id='81000000-0000-0000-0000-000000000001';
    changed := true;
  exception when raise_exception then null; end;
  assert not changed, 'published correction is mutable';
  begin
    insert into public.report_addenda(mission_id,client_id,case_id,body) values
    ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','Wrong tenant');
    raise exception 'cross-tenant privacy case reference accepted';
  exception when foreign_key_violation then null; end;
end $$;

rollback;
\echo 'All Écartéo SQL isolation/immutability assertions passed; fixtures rolled back.'
