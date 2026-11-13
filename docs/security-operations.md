# Security operations and launch checklist

No application is “hack proof.” This project provides layered controls, but a production operator must complete the following configuration and independent checks.

## Before accepting real data

- [ ] Use separate development, test, and production Supabase projects, environments, and credentials.
- [ ] Configure production HTTPS, restrictive CSP/security headers, Auth redirect allow-lists, SMTP, password/confirmation policy, Auth rate limits, abuse protection, and administrator TOTP MFA.
- [ ] Keep the service-role key only in Edge Function secrets. Review function logs and avoid including request bodies, tokens, passwords, phone numbers, payment references, or uploaded filenames.
- [ ] Confirm RLS is enabled on every application table and test each role against both its allowed and denied scope. Include two organizations, two assigned properties, tenant-owned and unrelated tenancies, suspended/revoked members, and aal1/aal2 privileged sessions.
- [ ] Review every `SECURITY DEFINER` routine for its fixed `search_path`, explicit authorization checks, bounded inputs, and minimum grants. Test calls with missing, expired, wrong-organization, and replayed approvals.
- [ ] Add independent server-side executors for approved role changes, ownership transfers, payment confirmation/refunds/adjustments, high-value expenses, exports, and important-record deletion. The approval table alone does not execute or authorize an external operation.
- [ ] Integrate provider-specific callback signature verification, idempotency, replay resistance, amount/currency matching, and reconciliation. The browser cannot confirm a payment.
- [ ] Add a trusted malware scanning pipeline. Keep new objects pending; only a scanner service may mark an accepted document clean. Test MIME spoofing, oversized files, malformed images/PDFs, denied downloads, and signed URL expiry.
- [ ] Choose data retention, correction, export, deletion, and breach-notification rules. Minimize profile/tenant information and document the lawful purpose for each field.
- [ ] Have qualified Ugandan professionals review lease language and local privacy, tenancy, consumer, and payment obligations.
- [ ] Run dependency/security checks, independent penetration testing, database policy tests, and restore drills before production.

## Current implementation boundaries

- RLS scopes records to active organization membership, assigned properties, or the user's tenancy. Owner and administrator row access and privileged functions require an `aal2` MFA session.
- Payment amounts are withheld from direct table selects. A bounded database function returns them only to owners, administrators, property managers, or the tenant on that tenancy. Employee queries can see payment status without amounts.
- Payments can only be created as `pending` from the client. No provider integration or confirmation/refund executor exists.
- Employee invitations use an Edge Function, role checks, expiry, email-bound acceptance, and the organization's second-approval setting. Role changes and other approval action types are deliberately not executable yet.
- The Storage bucket is private. The SQL policies require a matching document row; downloads are allowed only after `scan_status='clean'`. The scanner is not included.
- Audit rows omit payloads and payment amounts and have no ordinary authenticated write/delete grant. Supabase Auth logs should be used for authentication events. A production audit retention/export process is still required.
- Global sign-out is available. The Supabase browser SDK does not expose a full cross-device session inventory in this app; implementing session review/revocation beyond global sign-out needs a trusted server endpoint and UX.
- The SPA uses Supabase’s browser session storage/refresh flow and PKCE. It is not an HTTP-only-cookie backend. Use strong CSP/XSS controls; for environments requiring HTTP-only cookies, move auth to a trusted server/BFF before launch.
- Edge Function rate limiting beyond Supabase gateway/Auth controls is not implemented. Configure platform rate limits or add a shared, server-side limiter before public deployment.

## Monitoring and response

1. Send Supabase Auth, database, Storage, Edge Function, and hosting security events to monitored logs/alerts. Alert on repeated failed sign-ins, MFA changes, invitation/role changes, approval decisions, payment status changes, exports, unusual signed URL activity, and policy/function errors.
2. Do not log passwords, access/refresh tokens, full bank/mobile-money credentials, full card data, or sensitive document content. Restrict log access and define log retention.
3. Maintain encrypted backups in a separate protected location, restrict backup access, and perform scheduled restore tests to an isolated project. Record restore time and data-loss objectives.
4. On suspected compromise: disable affected Auth accounts and invitations; revoke sessions/rotate exposed secrets; restrict affected Edge Functions or Storage access; preserve relevant logs; assess the scope and integrity of database/payment records; restore only after validation; notify the responsible organization and regulators/affected people as required by counsel.
5. Record an incident owner, timeline, decisions, affected data, containment actions, and recovery verification. Do not delete evidence or silently alter audit records.
6. For recovery, verify the person and organization through a documented out-of-band process, use Auth password recovery, require MFA re-enrollment for privileged accounts, review/revoke sessions, and audit the recovery action. Never ask a user to send a password or MFA secret.

## Backup and recovery drill

At minimum, quarterly in a non-production environment:

1. Restore the encrypted Supabase backup to an isolated project.
2. Apply the currently approved migrations and verify extensions, RLS flags/policies, private bucket settings, triggers, and Edge Function configuration.
3. Sign in as test users for each role and run the denied/allowed RLS suite.
4. Verify audit event consistency and document access denial before scanning plus signed-link expiry after scanning.
5. Record elapsed recovery time, any missing data/configuration, and remediation owner/date.
