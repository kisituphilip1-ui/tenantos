create extension if not exists pgcrypto with schema extensions;

create type public.member_role as enum (
  'owner', 'administrator', 'property_manager', 'employee', 'tenant'
);
create type public.member_status as enum (
  'invited', 'active', 'suspended', 'revoked'
);
create type public.approval_status as enum (
  'pending', 'approved', 'rejected', 'expired'
);

create or replace function public.approval_payload_is_safe(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_child jsonb;
  v_key text;
begin
  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value) loop
      if lower(v_key) ~ '(password|token|secret|authorization|cvv|card.?number|account.?number)'
         or not public.approval_payload_is_safe(v_child) then
        return false;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if not public.approval_payload_is_safe(v_child) then
        return false;
      end if;
    end loop;
  end if;
  return true;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_phone_e164 check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  country_code char(2) not null default 'UG',
  currency char(3) not null default 'UGX' check (currency = 'UGX'),
  require_second_approval boolean not null default true,
  expense_approval_threshold_ugx numeric(14,2) not null default 1000000
    check (expense_approval_threshold_ugx >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create unique index organization_one_active_owner_idx
  on public.organization_members (organization_id)
  where role = 'owner' and status = 'active';

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (length(trim(email)) between 3 and 320),
  role public.member_role not null check (role <> 'owner'),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  approval_request_id uuid,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index organization_invitations_pending_email_idx
  on public.organization_invitations (organization_id, lower(email))
  where status = 'pending';

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text not null check (length(trim(address)) between 1 and 300),
  district text,
  city text,
  country_code char(2) not null default 'UG',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.property_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  member_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (property_id, member_id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete cascade,
  foreign key (organization_id, member_id)
    references public.organization_members(organization_id, id) on delete cascade
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_number text not null check (length(trim(unit_number)) between 1 and 40),
  bedrooms smallint check (bedrooms is null or bedrooms between 0 and 30),
  monthly_rent_ugx numeric(14,2) not null check (monthly_rent_ugx >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, unit_number),
  unique (organization_id, id),
  unique (organization_id, property_id, id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete cascade
);

create table public.tenancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  tenant_user_id uuid references auth.users(id) on delete set null,
  lease_start date not null,
  lease_end date,
  rent_amount_ugx numeric(14,2) not null check (rent_amount_ugx >= 0),
  status text not null default 'active' check (status in ('active', 'ended', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (lease_end is null or lease_end >= lease_start),
  unique (organization_id, id),
  unique (organization_id, property_id, id),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, property_id, unit_id)
    references public.units(organization_id, property_id, id) on delete restrict
);

create unique index tenancies_one_active_unit_idx
  on public.tenancies (unit_id) where status = 'active';
create index tenancies_tenant_user_idx on public.tenancies (tenant_user_id)
  where tenant_user_id is not null;

create table public.rent_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tenancy_id uuid not null,
  amount_ugx numeric(14,2) not null check (amount_ugx > 0),
  due_date date not null,
  period_start date not null,
  period_end date not null,
  description text not null default 'Rent',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (organization_id, tenancy_id, id),
  foreign key (organization_id, tenancy_id)
    references public.tenancies(organization_id, id) on delete restrict
);

create index rent_charges_tenancy_due_idx
  on public.rent_charges (tenancy_id, due_date desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tenancy_id uuid not null,
  rent_charge_id uuid,
  amount_ugx numeric(14,2) not null check (amount_ugx > 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'refunded', 'adjusted', 'failed')),
  payment_method text not null default 'manual'
    check (payment_method in ('manual', 'mobile_money', 'bank_transfer', 'cash')),
  provider_reference text,
  received_at timestamptz,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, tenancy_id)
    references public.tenancies(organization_id, id) on delete restrict,
  foreign key (organization_id, tenancy_id, rent_charge_id)
    references public.rent_charges(organization_id, tenancy_id, id) on delete restrict,
  constraint payment_reference_length check (
    provider_reference is null or length(provider_reference) between 1 and 180
  )
);

create index payments_tenancy_created_idx on public.payments (tenancy_id, created_at desc);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid,
  tenancy_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null default '' check (length(description) <= 5000),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, property_id, unit_id)
    references public.units(organization_id, property_id, id) on delete restrict,
  foreign key (organization_id, property_id, tenancy_id)
    references public.tenancies(organization_id, property_id, id) on delete restrict
);

create index maintenance_property_status_idx
  on public.maintenance_requests (property_id, status, created_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid,
  tenancy_id uuid,
  storage_path text not null unique,
  display_name text not null check (length(trim(display_name)) between 1 and 180),
  content_type text not null check (length(content_type) <= 120),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  scan_status text not null default 'pending'
    check (scan_status in ('pending', 'clean', 'rejected')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (property_id is not null or tenancy_id is not null),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete restrict,
  foreign key (organization_id, tenancy_id)
    references public.tenancies(organization_id, id) on delete restrict,
  foreign key (organization_id, property_id, tenancy_id)
    references public.tenancies(organization_id, property_id, id) on delete restrict
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid,
  tenancy_id uuid,
  title text not null check (length(trim(title)) between 3 and 160),
  body text not null check (length(trim(body)) between 1 and 8000),
  publish_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (property_id is null or tenancy_id is null),
  foreign key (organization_id, property_id)
    references public.properties(organization_id, id) on delete cascade,
  foreign key (organization_id, tenancy_id)
    references public.tenancies(organization_id, id) on delete cascade
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_type text not null check (action_type in (
    'staff_invitation', 'role_change', 'ownership_transfer',
    'payment_confirmation', 'payment_refund', 'payment_adjustment',
    'high_value_expense', 'record_deletion', 'sensitive_export'
  )),
  payload jsonb not null default '{}'::jsonb
    check (pg_column_size(payload) <= 16384 and public.approval_payload_is_safe(payload)),
  reason text not null check (length(trim(reason)) between 8 and 1000),
  requested_by uuid not null references auth.users(id) on delete restrict,
  status public.approval_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '8 days'),
  unique (organization_id, id)
);

create index approval_requests_inbox_idx
  on public.approval_requests (organization_id, status, created_at desc);

alter table public.organization_invitations
  add constraint organization_invitations_approval_request_fk
  foreign key (organization_id, approval_request_id)
  references public.approval_requests(organization_id, id) on delete restrict;

create table public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  approval_request_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null check (length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, approval_request_id)
    references public.approval_requests(organization_id, id) on delete cascade,
  unique (approval_request_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (length(event_type) <= 100),
  entity_type text not null check (length(entity_type) <= 100),
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_tenancy_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tenant_user_id is not null and not exists (
    select 1 from public.organization_members m
    where m.organization_id = new.organization_id
      and m.user_id = new.tenant_user_id
      and m.role = 'tenant'
      and m.status = 'active'
  ) then
    raise exception 'Tenant must have active tenant membership in this organization';
  end if;
  return new;
end;
$$;

create or replace function public.validate_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.phone is distinct from old.phone and not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.phone = new.phone
      and u.phone_confirmed_at is not null
  ) then
    raise exception 'Phone number must be verified by Supabase Auth';
  end if;
  return new;
end;
$$;

create or replace function public.validate_property_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.organization_members m
    where m.id = new.member_id
      and m.organization_id = new.organization_id
      and m.role in ('property_manager', 'employee')
      and m.status = 'active'
  ) then
    raise exception 'Only active property managers and employees can be assigned';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create trigger profile_phone_verification_check
  before update of phone on public.profiles
  for each row execute function public.validate_profile_phone();
create trigger tenancy_tenant_membership_check
  before insert or update of organization_id, tenant_user_id on public.tenancies
  for each row execute function public.validate_tenancy_tenant();
create trigger property_assignment_role_check
  before insert or update of organization_id, member_id on public.property_assignments
  for each row execute function public.validate_property_assignment();

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and (
        m.role not in ('owner', 'administrator')
        or auth.jwt() ->> 'aal' = 'aal2'
      )
      and m.role = any(p_roles)
  );
$$;

create or replace function public.can_access_property(
  p_organization_id uuid,
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.properties p
    join public.organization_members m
      on m.organization_id = p.organization_id
     and m.user_id = auth.uid()
     and m.status = 'active'
     and (
       m.role not in ('owner', 'administrator')
       or auth.jwt() ->> 'aal' = 'aal2'
     )
    where p.organization_id = p_organization_id
      and p.id = p_property_id
      and (
        m.role in ('owner', 'administrator')
        or (
          m.role in ('property_manager', 'employee')
          and exists (
            select 1 from public.property_assignments pa
            where pa.organization_id = p.organization_id
              and pa.property_id = p.id
              and pa.member_id = m.id
          )
        )
        or (
          m.role = 'tenant'
          and exists (
            select 1 from public.tenancies t
            where t.organization_id = p.organization_id
              and t.property_id = p.id
              and t.tenant_user_id = auth.uid()
              and t.status = 'active'
          )
        )
      )
  );
$$;

create or replace function public.can_access_tenancy(
  p_organization_id uuid,
  p_tenancy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenancies t
    where t.organization_id = p_organization_id
      and t.id = p_tenancy_id
      and (
        t.tenant_user_id = auth.uid()
        or (
          public.has_org_role(
            t.organization_id,
            array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
          )
          and public.can_access_property(t.organization_id, t.property_id)
        )
      )
  );
$$;

create or replace function public.can_view_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id = auth.uid() or exists (
    select 1
    from public.organization_members target
    join public.organization_members viewer
      on viewer.organization_id = target.organization_id
    where target.user_id = p_user_id
      and viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and target.status in ('active', 'invited')
      and (
        (
          viewer.role in ('owner', 'administrator')
          and auth.jwt() ->> 'aal' = 'aal2'
        )
        or (
          viewer.role = 'property_manager'
          and exists (
            select 1 from public.tenancies t
            where t.organization_id = viewer.organization_id
              and t.tenant_user_id = target.user_id
              and t.status = 'active'
              and public.can_access_property(t.organization_id, t.property_id)
          )
        )
      )
  );
$$;

create or replace function public.accept_org_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.organization_invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_member_id uuid;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'A verified signed-in account is required';
  end if;
  if not exists (
    select 1 from auth.users u
    where u.id = v_user_id and lower(u.email) = v_email and u.email_confirmed_at is not null
  ) then
    raise exception 'A verified signed-in account is required';
  end if;

  select * into v_invitation
  from public.organization_invitations
  where id = p_invitation_id
    and lower(email) = v_email
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invitation is unavailable';
  end if;

  insert into public.organization_members as existing_member (
    organization_id, user_id, role, status, invited_by
  ) values (
    v_invitation.organization_id, v_user_id, v_invitation.role, 'active', v_invitation.invited_by
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role, status = 'active', invited_by = excluded.invited_by, updated_at = now()
    where existing_member.status in ('invited', 'revoked')
  returning id into v_member_id;

  if v_member_id is null then
    raise exception 'An organization membership already exists';
  end if;

  update public.organization_invitations
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invitation.id;

  return v_member_id;
end;
$$;

create or replace function public.resolve_approval_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.approval_requests%rowtype;
  v_require_second boolean;
begin
  if auth.uid() is null or p_decision is null or p_decision not in ('approved', 'rejected')
     or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Invalid approval decision';
  end if;

  select * into v_request
  from public.approval_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'pending' or v_request.expires_at <= now() then
    raise exception 'Approval request is unavailable';
  end if;

  if not public.has_org_role(
    v_request.organization_id, array['owner', 'administrator']::public.member_role[]
  ) then
    raise exception 'Not authorized to decide this request';
  end if;

  select require_second_approval into v_require_second
  from public.organizations where id = v_request.organization_id;

  if v_require_second and v_request.requested_by = auth.uid() and p_decision = 'approved' then
    raise exception 'A requester cannot approve their own request';
  end if;

  insert into public.approval_actions (
    organization_id, approval_request_id, actor_id, decision, reason
  ) values (
    v_request.organization_id, v_request.id, auth.uid(), p_decision, trim(p_reason)
  );

  update public.approval_requests
  set status = p_decision::public.approval_status, resolved_at = now(), updated_at = now()
  where id = v_request.id;
end;
$$;

create or replace function public.get_financial_amounts(p_kind text, p_ids uuid[])
returns table (record_id uuid, amount_ugx numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind is null or p_kind not in ('unit', 'tenancy', 'rent_charge', 'payment')
     or coalesce(cardinality(p_ids), 0) > 500 then
    raise exception 'Invalid financial records request';
  end if;

  if p_kind = 'unit' then
    return query
      select u.id, u.monthly_rent_ugx
      from public.units u
      where u.id = any(p_ids)
        and public.can_access_property(u.organization_id, u.property_id)
        and public.has_org_role(
          u.organization_id,
          array['owner', 'administrator', 'property_manager']::public.member_role[]
        );
  elsif p_kind = 'tenancy' then
    return query
      select t.id, t.rent_amount_ugx
      from public.tenancies t
      where t.id = any(p_ids)
        and (
          t.tenant_user_id = auth.uid()
          or (
            public.has_org_role(
              t.organization_id,
              array['owner', 'administrator', 'property_manager']::public.member_role[]
            )
            and public.can_access_property(t.organization_id, t.property_id)
          )
        );
  elsif p_kind = 'rent_charge' then
    return query
      select r.id, r.amount_ugx
      from public.rent_charges r
      where r.id = any(p_ids)
        and (
          public.can_access_tenancy(r.organization_id, r.tenancy_id)
          and (
            public.has_org_role(
              r.organization_id,
              array['owner', 'administrator', 'property_manager']::public.member_role[]
            )
            or exists (
              select 1 from public.tenancies t
              where t.id = r.tenancy_id and t.tenant_user_id = auth.uid()
            )
          )
        );
  else
    return query
      select p.id, p.amount_ugx
      from public.payments p
      where p.id = any(p_ids)
        and public.can_access_tenancy(p.organization_id, p.tenancy_id)
        and (
          public.has_org_role(
            p.organization_id,
            array['owner', 'administrator', 'property_manager']::public.member_role[]
          )
          or exists (
            select 1 from public.tenancies t
            where t.id = p.tenancy_id and t.tenant_user_id = auth.uid()
          )
        );
  end if;
end;
$$;

create or replace function public.expire_approval_requests()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.approval_requests
  set status = 'expired', updated_at = now()
  where status = 'pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record jsonb;
  v_org_id uuid;
  v_entity_id uuid;
  v_actor_id uuid;
begin
  v_record := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_org_id := nullif(v_record ->> 'organization_id', '')::uuid;
  v_entity_id := nullif(v_record ->> 'id', '')::uuid;
  v_actor_id := coalesce(
    auth.uid(),
    nullif(v_record ->> 'invited_by', '')::uuid,
    nullif(v_record ->> 'requested_by', '')::uuid,
    nullif(v_record ->> 'created_by', '')::uuid,
    nullif(v_record ->> 'uploaded_by', '')::uuid
  );

  insert into public.audit_logs (organization_id, actor_id, event_type, entity_type, entity_id)
  values (
    v_org_id,
    v_actor_id,
    lower(tg_table_name || '.' || tg_op),
    tg_table_name,
    v_entity_id
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
create trigger properties_updated_at before update on public.properties
  for each row execute function public.set_updated_at();
create trigger units_updated_at before update on public.units
  for each row execute function public.set_updated_at();
create trigger tenancies_updated_at before update on public.tenancies
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();
create trigger maintenance_requests_updated_at before update on public.maintenance_requests
  for each row execute function public.set_updated_at();
create trigger notices_updated_at before update on public.notices
  for each row execute function public.set_updated_at();
create trigger approval_requests_updated_at before update on public.approval_requests
  for each row execute function public.set_updated_at();

create trigger audit_memberships after insert or update or delete on public.organization_members
  for each row execute function public.write_audit_log();
create trigger audit_invitations after insert or update or delete on public.organization_invitations
  for each row execute function public.write_audit_log();
create trigger audit_properties after insert or update or delete on public.properties
  for each row execute function public.write_audit_log();
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.write_audit_log();
create trigger audit_approvals after insert or update or delete on public.approval_requests
  for each row execute function public.write_audit_log();
create trigger audit_approval_actions after insert or update or delete on public.approval_actions
  for each row execute function public.write_audit_log();
create trigger audit_documents after insert or update or delete on public.documents
  for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.properties enable row level security;
alter table public.property_assignments enable row level security;
alter table public.units enable row level security;
alter table public.tenancies enable row level security;
alter table public.rent_charges enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.documents enable row level security;
alter table public.notices enable row level security;
alter table public.approval_requests enable row level security;
alter table public.approval_actions enable row level security;
alter table public.audit_logs enable row level security;

create policy "Profiles are visible to self or organization admins"
  on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy "Users update only their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "Organization members read their organization"
  on public.organizations for select to authenticated
  using (public.is_org_member(id));

create policy "Members read own membership or admin directory"
  on public.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_role(
      organization_id, array['owner', 'administrator']::public.member_role[]
    )
  );

create policy "Admins read invitations"
  on public.organization_invitations for select to authenticated
  using (public.has_org_role(
    organization_id, array['owner', 'administrator']::public.member_role[]
  ));

create policy "Properties are visible in assigned scope"
  on public.properties for select to authenticated
  using (public.can_access_property(organization_id, id));
create policy "Admins create properties"
  on public.properties for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_org_role(
      organization_id, array['owner', 'administrator']::public.member_role[]
    )
  );
create policy "Scoped managers update properties"
  on public.properties for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'administrator']::public.member_role[])
    or (
      public.has_org_role(organization_id, array['property_manager']::public.member_role[])
      and public.can_access_property(organization_id, id)
    )
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'administrator']::public.member_role[])
    or (
      public.has_org_role(organization_id, array['property_manager']::public.member_role[])
      and public.can_access_property(organization_id, id)
    )
  );
create policy "Admins delete properties"
  on public.properties for delete to authenticated
  using (public.has_org_role(
    organization_id, array['owner', 'administrator']::public.member_role[]
  ));

create policy "Assignments visible to self and admins"
  on public.property_assignments for select to authenticated
  using (
    exists (
      select 1 from public.organization_members m
      where m.id = member_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or public.has_org_role(
      organization_id, array['owner', 'administrator']::public.member_role[]
    )
  );

create policy "Units follow property scope"
  on public.units for select to authenticated
  using (
    (
      public.has_org_role(
        organization_id,
        array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
      )
      and public.can_access_property(organization_id, property_id)
    )
    or exists (
      select 1 from public.tenancies t
      where t.organization_id = units.organization_id
        and t.unit_id = units.id
        and t.tenant_user_id = auth.uid()
        and t.status = 'active'
    )
  );
create policy "Managers create units in scope"
  on public.units for insert to authenticated
  with check (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  );
create policy "Managers update units in scope"
  on public.units for update to authenticated
  using (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  )
  with check (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  );
create policy "Admins delete units"
  on public.units for delete to authenticated
  using (public.has_org_role(
    organization_id, array['owner', 'administrator']::public.member_role[]
  ));

create policy "Tenancies visible to assigned staff and tenant"
  on public.tenancies for select to authenticated
  using (public.can_access_tenancy(organization_id, id));
create policy "Managers create tenancies in scope"
  on public.tenancies for insert to authenticated
  with check (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  );
create policy "Managers update tenancies in scope"
  on public.tenancies for update to authenticated
  using (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  )
  with check (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  );
create policy "Admins delete tenancies"
  on public.tenancies for delete to authenticated
  using (public.has_org_role(
    organization_id, array['owner', 'administrator']::public.member_role[]
  ));

create policy "Rent charges visible with tenancy"
  on public.rent_charges for select to authenticated
  using (public.can_access_tenancy(organization_id, tenancy_id));
create policy "Managers create rent charges"
  on public.rent_charges for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and public.can_access_tenancy(organization_id, tenancy_id)
  );

create policy "Payments visible with tenancy"
  on public.payments for select to authenticated
  using (public.can_access_tenancy(organization_id, tenancy_id));
create policy "Tenants and billing staff create pending payments"
  on public.payments for insert to authenticated
  with check (
    status = 'pending'
    and provider_reference is null
    and received_at is null
    and verified_at is null
    and created_by = auth.uid()
    and (
      (
        public.has_org_role(organization_id, array['tenant']::public.member_role[])
        and exists (
          select 1 from public.tenancies t
          where t.id = tenancy_id and t.organization_id = payments.organization_id
            and t.tenant_user_id = auth.uid() and t.status = 'active'
        )
      )
      or (
        public.has_org_role(
          organization_id,
          array['owner', 'administrator', 'property_manager']::public.member_role[]
        )
        and public.can_access_tenancy(organization_id, tenancy_id)
      )
    )
  );

create policy "Maintenance follows property and tenancy scope"
  on public.maintenance_requests for select to authenticated
  using (
    (
      public.has_org_role(
        organization_id,
        array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
      )
      and public.can_access_property(organization_id, property_id)
    )
    or (
      tenancy_id is not null
      and public.can_access_tenancy(organization_id, tenancy_id)
    )
  );
create policy "Members create in-scope maintenance requests"
  on public.maintenance_requests for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_access_property(organization_id, property_id)
    and (
      public.has_org_role(
        organization_id,
        array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
      )
      or (
        public.has_org_role(organization_id, array['tenant']::public.member_role[])
        and tenancy_id is not null
        and public.can_access_tenancy(organization_id, tenancy_id)
      )
    )
  );
create policy "Assigned staff update maintenance"
  on public.maintenance_requests for update to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  )
  with check (
    public.has_org_role(
      organization_id,
      array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
    )
    and public.can_access_property(organization_id, property_id)
  );

create policy "Documents follow property or tenancy scope"
  on public.documents for select to authenticated
  using (
    (
      property_id is not null
      and public.has_org_role(
        organization_id,
        array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
      )
      and public.can_access_property(organization_id, property_id)
    )
    or (tenancy_id is not null and public.can_access_tenancy(organization_id, tenancy_id))
  );
create policy "Scoped users register documents"
  on public.documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and scan_status = 'pending'
    and (
      (
        property_id is not null
        and public.can_access_property(organization_id, property_id)
        and public.has_org_role(
          organization_id,
          array['owner', 'administrator', 'property_manager', 'employee']::public.member_role[]
        )
      )
      or (
        tenancy_id is not null
        and public.can_access_tenancy(organization_id, tenancy_id)
      )
    )
  );

create policy "Notices visible in assigned scope"
  on public.notices for select to authenticated
  using (
    (property_id is null and tenancy_id is null and public.is_org_member(organization_id))
    or (property_id is not null and public.can_access_property(organization_id, property_id))
    or (tenancy_id is not null and public.can_access_tenancy(organization_id, tenancy_id))
  );
create policy "Managers create notices"
  on public.notices for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and (property_id is null or public.can_access_property(organization_id, property_id))
    and (tenancy_id is null or public.can_access_tenancy(organization_id, tenancy_id))
  );
create policy "Managers update notices"
  on public.notices for update to authenticated
  using (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
    and (
      property_id is null
      or public.can_access_property(organization_id, property_id)
    )
  )
  with check (
    public.has_org_role(
      organization_id, array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
  );

create policy "Requesters and approvers read approval requests"
  on public.approval_requests for select to authenticated
  using (
    requested_by = auth.uid()
    or public.has_org_role(
      organization_id, array['owner', 'administrator']::public.member_role[]
    )
  );
create policy "Authorized members request approval"
  on public.approval_requests for insert to authenticated
  with check (
    requested_by = auth.uid()
    and status = 'pending'
    and public.has_org_role(
      organization_id,
      array['owner', 'administrator', 'property_manager']::public.member_role[]
    )
  );
create policy "Participants read approval decisions"
  on public.approval_actions for select to authenticated
  using (
    exists (
      select 1 from public.approval_requests r
      where r.id = approval_request_id
        and (
          r.requested_by = auth.uid()
          or public.has_org_role(
            r.organization_id, array['owner', 'administrator']::public.member_role[]
          )
        )
    )
  );

create policy "Admins read audit history"
  on public.audit_logs for select to authenticated
  using (
    organization_id is not null
    and public.has_org_role(
      organization_id, array['owner', 'administrator']::public.member_role[]
    )
  );

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;
grant select (id, name, country_code, currency, require_second_approval)
  on public.organizations to authenticated;
grant select on public.organization_members, public.organization_invitations,
  public.property_assignments to authenticated;
grant select, insert on public.properties to authenticated;
grant select (
  id, organization_id, property_id, unit_number, bedrooms, created_at, updated_at
) on public.units to authenticated;
grant insert on public.units to authenticated;
grant update (name, address, district, city, country_code) on public.properties to authenticated;
grant update (unit_number, bedrooms) on public.units to authenticated;
grant select (
  id, organization_id, property_id, unit_id, tenant_user_id, lease_start, lease_end,
  status, created_at, updated_at
) on public.tenancies to authenticated;
grant insert on public.tenancies to authenticated;
grant update (lease_start, lease_end, status) on public.tenancies to authenticated;
grant select (
  id, organization_id, tenancy_id, due_date, period_start, period_end,
  description, created_by, created_at
) on public.rent_charges to authenticated;
grant insert on public.rent_charges to authenticated;
grant select (
  id, organization_id, tenancy_id, rent_charge_id, status, payment_method,
  received_at, verified_at, created_by, created_at, updated_at
) on public.payments to authenticated;
grant insert on public.payments to authenticated;
grant select on public.maintenance_requests, public.documents, public.notices,
  public.approval_requests to authenticated;
grant update (title, description, priority, status) on public.maintenance_requests to authenticated;
grant update (title, body, publish_at) on public.notices to authenticated;
grant select on public.approval_actions, public.audit_logs to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from anon, authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.approval_payload_is_safe(jsonb) from public, anon;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.validate_tenancy_tenant() from public, anon, authenticated;
revoke all on function public.validate_profile_phone() from public, anon, authenticated;
revoke all on function public.validate_property_assignment() from public, anon, authenticated;
revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public, anon;
revoke all on function public.can_access_property(uuid, uuid) from public, anon;
revoke all on function public.can_access_tenancy(uuid, uuid) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.accept_org_invitation(uuid) from public, anon;
revoke all on function public.resolve_approval_request(uuid, text, text) from public, anon;
revoke all on function public.get_financial_amounts(text, uuid[]) from public, anon;
revoke all on function public.expire_approval_requests() from public, anon, authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;

grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.approval_payload_is_safe(jsonb) to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function public.can_access_property(uuid, uuid) to authenticated;
grant execute on function public.can_access_tenancy(uuid, uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.accept_org_invitation(uuid) to authenticated;
grant execute on function public.resolve_approval_request(uuid, text, text) to authenticated;
grant execute on function public.get_financial_amounts(text, uuid[]) to authenticated;
grant execute on function public.expire_approval_requests() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-documents', 'tenant-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Read document objects with readable metadata"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tenant-documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.scan_status = 'clean'
    )
  );
create policy "Upload objects with an authorized pending document"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.scan_status = 'pending'
        and d.uploaded_by = auth.uid()
        and (
          (d.property_id is not null and public.can_access_property(d.organization_id, d.property_id))
          or (d.tenancy_id is not null and public.can_access_tenancy(d.organization_id, d.tenancy_id))
        )
    )
  );
