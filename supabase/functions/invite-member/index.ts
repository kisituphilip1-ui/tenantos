import { createClient } from "npm:@supabase/supabase-js@2";

type InviteRole = "administrator" | "property_manager" | "employee" | "tenant";
type InviteBody = {
  organization_id?: unknown;
  email?: unknown;
  role?: unknown;
  approval_request_id?: unknown;
};

const allowedRoles = new Set<InviteRole>([
  "administrator",
  "property_manager",
  "employee",
  "tenant",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(status: number, body: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

function jwtClaims(accessToken: string): Record<string, unknown> | null {
  try {
    const segment = accessToken.split(".")[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const value: unknown = JSON.parse(atob(padded));
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  const allowedOrigins = (Deno.env.get("APP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const origin = request.headers.get("Origin") ?? "";

  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
      },
    });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 8192) {
    return jsonResponse(413, { error: "Request too large" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appBaseUrl = Deno.env.get("APP_BASE_URL");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !appBaseUrl) {
    return jsonResponse(503, { error: "Invitation service is not configured" }, origin);
  }

  let appUrl: URL;
  try {
    appUrl = new URL(appBaseUrl);
  } catch {
    return jsonResponse(503, { error: "Invitation service is not configured" }, origin);
  }
  if (!allowedOrigins.includes(appUrl.origin) || (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost")) {
    return jsonResponse(503, { error: "Invitation service is not configured" }, origin);
  }

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return jsonResponse(401, { error: "Authentication required" }, origin);

  const callerClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser(bearer);
  if (userError || !userData.user) {
    return jsonResponse(401, { error: "Authentication required" }, origin);
  }
  const claims = jwtClaims(bearer);
  if (!claims) return jsonResponse(401, { error: "Authentication required" }, origin);

  let body: InviteBody;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 8192) {
      return jsonResponse(413, { error: "Request too large" }, origin);
    }
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return jsonResponse(400, { error: "Invalid request" }, origin);
    }
    body = parsed as InviteBody;
  } catch {
    return jsonResponse(400, { error: "Invalid request" }, origin);
  }

  const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const roleValue = typeof body.role === "string" ? body.role : "";
  const approvalRequestId = typeof body.approval_request_id === "string" ? body.approval_request_id : null;
  if (
    !uuidPattern.test(organizationId) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 320 ||
    !allowedRoles.has(roleValue as InviteRole)
  ) {
    return jsonResponse(400, { error: "Invalid invitation details" }, origin);
  }
  const role = roleValue as InviteRole;

  const { data: membership, error: membershipError } = await callerClient
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError || !membership) {
    return jsonResponse(403, { error: "Not authorized" }, origin);
  }

  const inviterRole = membership.role as string;
  if (!["owner", "administrator"].includes(inviterRole)) {
    return jsonResponse(403, { error: "Not authorized" }, origin);
  }
  if (["owner", "administrator"].includes(inviterRole) && claims.aal !== "aal2") {
    return jsonResponse(403, { error: "Multi-factor authentication required" }, origin);
  }
  if (role === "administrator" && inviterRole !== "owner") {
    return jsonResponse(403, { error: "Not authorized" }, origin);
  }

  const { data: organization, error: organizationError } = await callerClient
    .from("organizations")
    .select("require_second_approval")
    .eq("id", organizationId)
    .maybeSingle();
  if (organizationError || !organization) {
    return jsonResponse(403, { error: "Not authorized" }, origin);
  }

  if (organization.require_second_approval || approvalRequestId) {
    if (!approvalRequestId || !uuidPattern.test(approvalRequestId)) {
      return jsonResponse(403, { error: "Approved request required" }, origin);
    }
    const { data: approval, error: approvalError } = await adminClient
      .from("approval_requests")
      .select("id,organization_id,action_type,payload,requested_by,status,expires_at")
      .eq("id", approvalRequestId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    const payload = approval?.payload;
    const validPayload = payload !== null && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    if (
      approvalError ||
      !approval ||
      approval.status !== "approved" ||
      approval.action_type !== "staff_invitation" ||
      approval.requested_by === userData.user.id ||
      String(validPayload.email ?? "").toLowerCase() !== email ||
      validPayload.role !== role
    ) {
      return jsonResponse(403, { error: "Approved request required" }, origin);
    }
  } else if (inviterRole !== "owner") {
    return jsonResponse(403, { error: "Only the owner may invite members" }, origin);
  }

  const invitationId = crypto.randomUUID();
  const { error: insertError } = await adminClient.from("organization_invitations").insert({
    id: invitationId,
    organization_id: organizationId,
    email,
    role,
    invited_by: userData.user.id,
    approval_request_id: approvalRequestId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (insertError) {
    return jsonResponse(409, { error: "Invitation could not be created" }, origin);
  }

  const redirectTo = new URL("/", appUrl);
  redirectTo.searchParams.set("invitation_id", invitationId);
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo.toString(),
  });
  if (inviteError) {
    await adminClient.from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId);
    return jsonResponse(400, { error: "Invitation could not be delivered" }, origin);
  }

  return jsonResponse(202, { ok: true }, origin);
});
