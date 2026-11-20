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
            where t.organization_id = target.organization_id
              and t.tenant_user_id = target.user_id
              and t.status = 'active'
              and public.can_access_property(t.organization_id, t.property_id)
          )
        )
      )
  );
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

drop trigger if exists on_auth_user_before_insert on auth.users;
drop function if exists public.auto_confirm_owner_email();
