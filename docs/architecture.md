# Architecture and security model

## Architecture

- **Client:** Vite, React, and TypeScript. The browser uses Supabase Auth and the publishable key; it never has a service-role key.
- **Trust boundary:** PostgreSQL RLS is the authorization boundary for every table and Storage object. The UI hides unavailable actions for usability, not security.
- **Trusted operations:** Supabase Edge Functions verify the caller's access token, organization membership, input, and any required approval before using server-side credentials. Payment provider callbacks must be verified in a separate trusted function before a payment can become confirmed.
- **Files:** A private Storage bucket is addressed through database-authorized, short-lived signed URLs. A document row is created before upload, allowing Storage policies to check the record's organization and scope.
- **Regions and money:** Amounts use `numeric(14,2)` in UGX. Dates are stored as PostgreSQL `date` or `timestamptz`, and displayed in the `Africa/Kampala` time zone.

## Data model

`profiles` extends `auth.users`; it contains no credentials. `organizations` owns the business data. `organization_members` assigns one organization role and account status to each user. Properties contain units; tenancies connect a tenant user to a unit and lease period. Rent charges and payments reference a tenancy. Maintenance requests, documents, and notices may be scoped to a property or tenancy. Approval requests capture a proposed action and its reason; approval actions retain each decision. Audit logs are append-only for application roles.

Employee property scope is represented by `property_assignments`. Tenants can only see records reachable from their own tenancy. Foreign keys, organization consistency checks, unique constraints, nonnegative money checks, and indexes are defined in the migration.

## Role-permission matrix

| Capability | Owner | Administrator | Property manager | Employee | Tenant |
|---|---:|---:|---:|---:|---:|
| Organization settings and full portfolio | Yes | Yes | Read / manage assigned operations | Assigned properties only | No |
| Invite staff, change roles, deactivate membership | Yes | Yes, subject to approval policy | Request only | No | No |
| Properties, units, tenancy administration | Yes | Yes | Assigned properties | Assigned tasks; no ownership changes | Own tenancy summary |
| Rent charges and payment details | Yes | Yes | Assigned operations | Status only | Own charges and payments |
| Confirm, refund, or adjust payments | Approval required | Approval required | Request only | No | No |
| Maintenance and notices | Yes | Yes | Assigned properties | Assigned work | Own tenancy requests/notices |
| Sensitive exports / ownership transfer / high-value expense | Approval required | Approval required | Request only | No | No |
| Approve sensitive action | Only if authorized and not requester | Only if authorized and not requester | Only if policy grants approver authority | No | No |

Database policies and security-definer functions enforce role and scope checks. Owner and administrator privileges are still restricted by approval checks for configured sensitive actions. A client-side role check is never sufficient.

## Approval flow

1. An authorized member submits a typed action, organization ID, reason, and optional expiry. The server validates the payload and records the requester.
2. The request remains `pending`. For actions requiring two people, the requester cannot approve it. A second authorized member records an immutable approve/reject action.
3. Requests transition to `approved`, `rejected`, or `expired`; decisions retain actor and timestamp. Expired and terminal requests cannot be reused.
4. A trusted function revalidates the action and approval immediately before executing it. Approval alone never changes a role, ownership, payment, or export state.

This starter includes the database workflow and role-gated invitation function. It intentionally does not implement a payment provider, ownership transfer, expense ledger, or bulk export executor.

## RLS policy plan

- Every business table has RLS enabled and grants are limited to `authenticated` users.
- Membership helpers check the current authenticated user and active organization membership. Property-scoped helpers additionally check the member's assigned properties. Tenant helpers match the authenticated user to an active tenancy.
- Read policies grant organization-wide visibility only to owners/administrators, assigned visibility to property managers/employees, and tenancy-linked visibility to tenants.
- Write policies are operation-specific. Tenants may create their own maintenance requests and pending payment records, but cannot confirm payments or change roles. Staff cannot self-assign properties or alter audit history.
- Approval decisions are written through a database function that checks approver authority, expiry, and self-approval rules. Sensitive executors must verify the approved request again.
- Storage policies only allow access to a private object whose document row is readable/writable under the same organization/property/tenancy rules.
- SQL tests cover cross-organization denial, employee scope, tenant scope, and approval self-review denial.

## Launch boundary

This is a security-conscious starter, not a guarantee of security or legal compliance. Production still requires independent security testing, provider-specific payment callback verification, malware scanning, rate limits and abuse monitoring, MFA enforcement for privileged users, backup/restore drills, retention decisions, and review of Ugandan lease language by qualified local professionals.
