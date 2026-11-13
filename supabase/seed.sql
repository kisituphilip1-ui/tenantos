-- Development-only example records. Create these fictional users first in local Supabase Auth:
-- owner@haven-demo.test, manager@haven-demo.test, tenant@haven-demo.test.
-- Do not use real tenant data or these addresses in a production project.
do $$
declare
  v_owner uuid;
  v_manager uuid;
  v_tenant uuid;
  v_org uuid := '10000000-0000-4000-8000-000000000001';
  v_property uuid := '20000000-0000-4000-8000-000000000001';
  v_unit uuid := '30000000-0000-4000-8000-000000000001';
  v_tenancy uuid := '40000000-0000-4000-8000-000000000001';
  v_member uuid;
begin
  select id into v_owner from auth.users where lower(email) = 'owner@haven-demo.test';
  select id into v_manager from auth.users where lower(email) = 'manager@haven-demo.test';
  select id into v_tenant from auth.users where lower(email) = 'tenant@haven-demo.test';

  if v_owner is null or v_manager is null or v_tenant is null then
    raise exception 'Create all three fictional development users in Supabase Auth before seeding';
  end if;

  insert into public.organizations (id, name)
  values (v_org, 'Haven Kampala Demo')
  on conflict (id) do nothing;

  insert into public.organization_members (organization_id, user_id, role, status)
  values
    (v_org, v_owner, 'owner', 'active'),
    (v_org, v_manager, 'property_manager', 'active'),
    (v_org, v_tenant, 'tenant', 'active')
  on conflict (organization_id, user_id) do nothing;

  insert into public.properties (id, organization_id, name, address, district, city, created_by)
  values (
    v_property, v_org, 'Acacia Court', 'Plot 12, Kira Road',
    'Kampala Central', 'Kampala', v_owner
  )
  on conflict (id) do nothing;

  select id into v_member from public.organization_members
  where organization_id = v_org and user_id = v_manager;
  insert into public.property_assignments (organization_id, property_id, member_id, assigned_by)
  values (v_org, v_property, v_member, v_owner)
  on conflict (property_id, member_id) do nothing;

  insert into public.units (id, organization_id, property_id, unit_number, bedrooms, monthly_rent_ugx)
  values (v_unit, v_org, v_property, '4A', 2, 650000)
  on conflict (id) do nothing;

  insert into public.tenancies (
    id, organization_id, property_id, unit_id, tenant_user_id,
    lease_start, lease_end, rent_amount_ugx, status
  ) values (
    v_tenancy, v_org, v_property, v_unit, v_tenant,
    date '2026-01-01', date '2026-12-31', 650000, 'active'
  )
  on conflict (id) do nothing;

  insert into public.rent_charges (
    id, organization_id, tenancy_id, amount_ugx, due_date, period_start, period_end,
    description, created_by
  ) values (
    '50000000-0000-4000-8000-000000000001',
    v_org, v_tenancy, 650000, date '2026-11-05', date '2026-11-01',
    date '2026-11-30', 'November 2026 rent', v_owner
  )
  on conflict (id) do nothing;

  insert into public.payments (
    id, organization_id, tenancy_id, amount_ugx, status, payment_method, created_by
  ) values (
    '60000000-0000-4000-8000-000000000001',
    v_org, v_tenancy, 300000, 'pending', 'mobile_money', v_tenant
  )
  on conflict (id) do nothing;

  insert into public.maintenance_requests (
    id, organization_id, property_id, unit_id, tenancy_id, created_by,
    title, description, priority
  ) values (
    '70000000-0000-4000-8000-000000000001',
    v_org, v_property, v_unit, v_tenancy, v_tenant,
    'Kitchen tap leak', 'The kitchen tap is dripping and needs a washer replacement.',
    'normal'
  ) on conflict (id) do nothing;

  insert into public.notices (id, organization_id, property_id, title, body, created_by)
  values (
    '80000000-0000-4000-8000-000000000001',
    v_org, v_property, 'Water tank service',
    'Water tank cleaning is scheduled for Saturday morning.', v_owner
  ) on conflict (id) do nothing;
end;
$$;
