begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select is(
  (select public from storage.buckets where id = 'tenant-documents'),
  false,
  'tenant document bucket is private'
);

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rls-owner@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls-employee@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('14141414-1414-4414-8414-141414141414', 'rls-manager@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rls-tenant@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}'),
  ('12121212-1212-4212-8212-121212121212', 'rls-other-tenant@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}');

insert into public.organizations (id, name)
values
  ('11111111-1111-4111-8111-111111111111', 'RLS Test One'),
  ('22222222-2222-4222-8222-222222222222', 'RLS Test Two');

insert into public.organization_members (id, organization_id, user_id, role, status)
values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'active'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'employee', 'active'),
  ('15151515-1515-4515-8515-151515151515', '11111111-1111-4111-8111-111111111111', '14141414-1414-4414-8414-141414141414', 'property_manager', 'active'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'tenant', 'active'),
  ('13131313-1313-4313-8313-131313131313', '11111111-1111-4111-8111-111111111111', '12121212-1212-4212-8212-121212121212', 'tenant', 'active');

insert into public.properties (id, organization_id, name, address, created_by)
values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Assigned', 'Kira Road', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('43434343-4343-4343-8343-434343434343', '11111111-1111-4111-8111-111111111111', 'Unassigned', 'Entebbe Road', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'Other org', 'Entebbe Road', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.property_assignments (organization_id, property_id, member_id)
values
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', '15151515-1515-4515-8515-151515151515');

insert into public.units (id, organization_id, property_id, unit_number, monthly_rent_ugx)
values
  ('55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'A1', 500000),
  ('51555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'A2', 450000),
  ('54555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111', '43434343-4343-4343-8343-434343434343', 'B1', 450000);

insert into public.tenancies (
  id, organization_id, property_id, unit_id, tenant_user_id,
  lease_start, rent_amount_ugx, status
) values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '55555555-5555-4555-8555-555555555555',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  date '2026-01-01', 500000, 'active'
), (
  '61666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  '43434343-4343-4343-8343-434343434343',
  '54555555-5555-4555-8555-555555555555',
  '12121212-1212-4212-8212-121212121212',
  date '2026-01-01', 450000, 'active'
);

insert into public.rent_charges (
  id, organization_id, tenancy_id, amount_ugx, due_date, period_start, period_end
) values (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666',
  500000, date '2026-11-05', date '2026-11-01', date '2026-11-30'
);

insert into public.payments (
  id, organization_id, tenancy_id, amount_ugx, status
) values (
  '88888888-8888-4888-8888-888888888888',
  '11111111-1111-4111-8111-111111111111',
  '66666666-6666-4666-8666-666666666666',
  500000, 'confirmed'
);

insert into public.maintenance_requests (
  id, organization_id, property_id, unit_id, tenancy_id, created_by, title
) values
  ('71717171-7171-4171-8171-717171717171',
   '11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333',
   '55555555-5555-4555-8555-555555555555',
   '66666666-6666-4666-8666-666666666666',
   'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Own unit repair'),
  ('72727272-7272-4272-8272-727272727272',
   '11111111-1111-4111-8111-111111111111',
   '43434343-4343-4343-8343-434343434343',
   '54555555-5555-4555-8555-555555555555',
   '61666666-6666-4666-8666-666666666666',
   '12121212-1212-4212-8212-121212121212', 'Other tenant repair'),
  ('73737373-7373-4373-8373-737373737373',
   '11111111-1111-4111-8111-111111111111',
   '33333333-3333-4333-8333-333333333333',
   null, null, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Staff-only repair');

insert into public.documents (
  id, organization_id, tenancy_id, storage_path, display_name, content_type, size_bytes, uploaded_by
) values
  ('81818181-8181-4181-8181-818181818181',
   '11111111-1111-4111-8111-111111111111',
   '66666666-6666-4666-8666-666666666666',
   '11111111-1111-4111-8111-111111111111/tenancy/own/file.pdf',
   'Own lease', 'application/pdf', 100, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('82828282-8282-4282-8282-828282828282',
   '11111111-1111-4111-8111-111111111111',
   '61666666-6666-4666-8666-666666666666',
   '11111111-1111-4111-8111-111111111111/tenancy/other/file.pdf',
   'Other lease', 'application/pdf', 100, '12121212-1212-4212-8212-121212121212');

insert into public.documents (
  id, organization_id, property_id, storage_path, display_name, content_type, size_bytes, uploaded_by
) values (
  '83838383-8383-4383-8383-838383838383',
  '11111111-1111-4111-8111-111111111111',
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111/property/shared/file.pdf',
  'Shared property file', 'application/pdf', 100, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select is((select count(*)::integer from public.properties), 1, 'employee sees only assigned property');
select is((select count(*)::integer from public.properties where id = '44444444-4444-4444-8444-444444444444'), 0, 'employee cannot read another organization');
select is((select count(*)::integer from public.get_financial_amounts('payment', array['88888888-8888-4888-8888-888888888888']::uuid[])), 0, 'employee cannot retrieve payment amount');
select ok(not public.approval_payload_is_safe('{"payment_token":"sensitive"}'::jsonb), 'approval payload rejects secret-like keys');
select throws_ok(
  $$insert into public.properties (organization_id, name, address, created_by)
    values ('11111111-1111-4111-8111-111111111111', 'Unauthorized', 'Nowhere', auth.uid())$$,
  '42501',
  'new row violates row-level security policy for table "properties"',
  'employee cannot create a property'
);

set local request.jwt.claim.sub = '14141414-1414-4414-8414-141414141414';
select is((select count(*)::integer from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1, 'property manager can view tenant profile for an assigned property');
select is((select count(*)::integer from public.profiles where id = '12121212-1212-4212-8212-121212121212'), 0, 'property manager cannot view tenant profile outside assigned properties');

set local request.jwt.claim.sub = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is((select count(id)::integer from public.tenancies), 1, 'tenant sees own tenancy only');
select is((select count(*)::integer from public.get_financial_amounts('payment', array['88888888-8888-4888-8888-888888888888']::uuid[])), 1, 'tenant can see own payment amount');
select is((select count(id)::integer from public.units), 1, 'tenant sees only their own unit');
select is((select count(*)::integer from public.maintenance_requests), 1, 'tenant sees only own maintenance requests');
select is((select count(*)::integer from public.documents), 1, 'tenant sees only own tenancy documents');
select throws_ok(
  $$update public.profiles set phone = '+256700000001' where id = auth.uid()$$,
  'P0001',
  'Phone number must be verified by Supabase Auth',
  'tenant cannot save an unverified phone number'
);

set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aal":"aal2","email":"rls-owner@example.test"}';
insert into public.approval_requests (
  id, organization_id, action_type, reason, requested_by
) values (
  '99999999-9999-4999-8999-999999999999',
  '11111111-1111-4111-8111-111111111111',
  'sensitive_export', 'Quarterly reporting export request', auth.uid()
);
select throws_ok(
  $$select public.resolve_approval_request(
    '99999999-9999-4999-8999-999999999999', 'approved', 'Reviewed'
  )$$,
  'P0001',
  'A requester cannot approve their own request',
  'requester cannot approve their own request'
);
select is(
  (select status::text from public.approval_requests where id = '99999999-9999-4999-8999-999999999999'),
  'pending',
  'rejected self-approval leaves request pending'
);

select * from finish();
rollback;
