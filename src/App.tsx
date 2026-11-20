import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Home,
  KeyRound,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";



type Role = "owner" | "administrator" | "property_manager" | "employee" | "tenant";
type Page =
  | "Overview"
  | "Properties"
  | "Tenancies"
  | "Payments"
  | "Maintenance"
  | "Documents"
  | "Notices"
  | "Approvals"
  | "Team"
  | "Audit"
  | "Security";
type Organization = {
  id: string;
  name: string;
  require_second_approval: boolean;
};
type Membership = {
  organization_id: string;
  role: Role;
  organization: Organization;
};
type Row = Record<string, string | number | null>;

const isAdminRole = (role: Role) => role === "owner" || role === "administrator";
const roleLabels: Record<Role, string> = {
  owner: "Owner",
  administrator: "Administrator",
  property_manager: "Property manager",
  employee: "Employee",
  tenant: "Customer / Tenant",
};

const navigation: { name: Page; icon: typeof Home; group: "Workspace" | "Management" }[] = [
  { name: "Overview", icon: Home, group: "Workspace" },
  { name: "Properties", icon: Building2, group: "Workspace" },
  { name: "Tenancies", icon: KeyRound, group: "Workspace" },
  { name: "Payments", icon: Wallet, group: "Workspace" },
  { name: "Maintenance", icon: Wrench, group: "Workspace" },
  { name: "Documents", icon: FileText, group: "Workspace" },
  { name: "Notices", icon: Bell, group: "Workspace" },
  { name: "Approvals", icon: ClipboardCheck, group: "Management" },
  { name: "Team", icon: Users, group: "Management" },
  { name: "Audit", icon: ShieldCheck, group: "Management" },
  { name: "Security", icon: ShieldCheck, group: "Management" },
];

const pageConfig: Partial<Record<Page, { table: string; select: string; columns: [string, string][] }>> = {
  Properties: {
    table: "properties",
    select: "id,name,address,district,city,created_at",
    columns: [["name", "Property"], ["address", "Address"], ["district", "District"], ["city", "City"]],
  },
  Tenancies: {
    table: "tenancies",
    select: "id,unit_id,lease_start,lease_end,status,tenant_user_id",
    columns: [["unit_id", "Unit"], ["tenant_user_id", "Tenant"], ["lease_start", "Lease starts"], ["lease_end", "Lease ends"], ["status", "Status"]],
  },
  Payments: {
    table: "payments",
    select: "id,tenancy_id,status,payment_method,received_at,created_at",
    columns: [["tenancy_id", "Tenancy reference"], ["amount_ugx", "Amount"], ["payment_method", "Method"], ["received_at", "Received"], ["status", "Status"]],
  },
  Maintenance: {
    table: "maintenance_requests",
    select: "id,title,description,priority,status,created_at",
    columns: [["title", "Request"], ["description", "Details"], ["priority", "Priority"], ["status", "Status"], ["created_at", "Created"]],
  },
  Documents: {
    table: "documents",
    select: "id,display_name,content_type,size_bytes,scan_status,created_at,storage_path",
    columns: [["display_name", "Document"], ["content_type", "Type"], ["size_bytes", "Size"], ["scan_status", "Scan status"], ["created_at", "Uploaded"]],
  },
  Notices: {
    table: "notices",
    select: "id,title,body,publish_at,created_at",
    columns: [["title", "Notice"], ["body", "Message"], ["publish_at", "Published"]],
  },
  Team: {
    table: "organization_members",
    select: "id,user_id,role,status,created_at",
    columns: [["user_id", "Member"], ["role", "Role"], ["status", "Status"], ["created_at", "Joined"]],
  },
  Audit: {
    table: "audit_logs",
    select: "id,actor_id,event_type,entity_type,created_at",
    columns: [["event_type", "Event"], ["entity_type", "Record type"], ["actor_id", "Actor reference"], ["created_at", "Time"]],
  },
};

function formatUGX(value: unknown) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return "—";
  const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `UGX ${match[1]}${grouped}${fraction ? `.${fraction}` : ""}`;
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeZone: "Africa/Kampala",
      }).format(date);
}

function safeErrorMessage() {
  return "We couldn't complete that request. Check the details and your access, then try again.";
}

function passwordRecoveryErrorMessage(error: unknown) {
  const detail = error instanceof Error ? error.message.toLowerCase() : "";
  if (/expired|invalid|session.*missing|flow_state|code verifier|otp.*expired/.test(detail)) {
    return "This reset link is expired or unavailable in this browser. Request a fresh link and open it in the same browser.";
  }
  if (/weak_password|password.{0,40}(weak|minimum|length|characters)/.test(detail)) {
    return "Choose a stronger password with at least 10 characters.";
  }
  return "We couldn't update your password. Request a fresh reset email and open the newest link in the same browser.";
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return objectValue(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [demoMode] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(
    new URLSearchParams(window.location.search).get("view") === "reset",
  );

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        setSession(null);
        setUser(null);
        setAuthMessage("We couldn't verify your session. Check your connection and try signing in again.");
      })
      .finally(() => setReady(true));

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const startDemo = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("demo", "1");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setDemoMode(true);
  };

  if (!ready) {
    return <div className="loading-screen" role="status">Loading your secure workspace…</div>;
  }

  if (demoMode) {
    return (
      <Suspense fallback={<div className="loading-screen" role="status">Loading demo preview…</div>}>
        <DemoWorkspace onExit={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete("demo");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          setDemoMode(false);
        }} />
      </Suspense>
    );
  }

  if (!supabase) {
    return <ConfigurationScreen onStartDemo={startDemo} />;
  }

  if ((!user || !session) || passwordRecovery) {
    return <AuthScreen
      message={authMessage}
      onMessage={setAuthMessage}
      onStartDemo={startDemo}
      onPasswordChanged={() => setPasswordRecovery(false)}
      isPasswordRecovery={passwordRecovery}
    />;
  }

  return (
    <Workspace
      user={user}
      session={session}
      onSignedOut={() => {
        setSession(null);
        setUser(null);
      }}
    />
  );
}

function ConfigurationScreen({ onStartDemo }: { onStartDemo: () => void }) {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-mark">H</div>
        <p className="eyebrow">HAVEN · UGANDA</p>
        <h1>Connect your Supabase project</h1>
        <p>Add the Vite environment variables to a <code>.env</code> file in the project root, then restart the development server.</p>
        <pre>{`VITE_SUPABASE_URL=https://your-project-id.supabase.co\nVITE_SUPABASE_ANON_KEY=your-publishable-key`}</pre>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Open Supabase dashboard <ArrowUpRight size={15} /></a>
        <div className="setup-demo">
          <div><strong>Just looking around?</strong><p>Explore a read-only preview using fictional sample data. No account or Supabase connection is needed.</p></div>
          <button className="primary-button compact" onClick={onStartDemo} type="button">Explore demo <ArrowUpRight size={15} /></button>
        </div>
      </div>
    </main>
  );
}

function AuthScreen({ message, onMessage, onStartDemo, onPasswordChanged, isPasswordRecovery }: {
  message: string;
  onMessage: (value: string) => void;
  onStartDemo: () => void;
  onPasswordChanged: () => void;
  isPasswordRecovery: boolean;
}) {
  const [mode, setMode] = useState<"signin" | "forgot" | "password">(
    isPasswordRecovery || new URLSearchParams(window.location.search).get("view") === "reset" ? "password" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (isPasswordRecovery) setMode("password");
  }, [isPasswordRecovery]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (mode === "password" && password !== confirmPassword) {
      onMessage("The passwords don't match.");
      return;
    }

    setPending(true);
    setNotice("");
    onMessage("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onPasswordChanged();
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/?view=reset`,
        });
        if (error) throw error;
        setNotice("If an account matches that email, password reset instructions will be sent.");
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setNotice("Your password has been updated. You can continue to your workspace.");
        window.history.replaceState({}, "", window.location.pathname);
        onPasswordChanged();
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (error) {
      if (mode === "signin") {
        onMessage("Unable to sign in. Check your details or ask your administrator for an invitation.");
      } else if (mode === "forgot") {
        onMessage("We couldn't send reset instructions. Check your connection, wait a few minutes, and try again.");
      } else {
        onMessage(passwordRecoveryErrorMessage(error));
      }
    } finally {
      setPending(false);
    }
  }

  const title = mode === "forgot" ? "Reset your password" : mode === "password" ? "Choose a new password" : "Welcome back";

  return (
    <main className="auth-page">
      <div className="auth-decoration" aria-hidden="true">
        <div className="decor-orbit orbit-one" />
        <div className="decor-orbit orbit-two" />
        <div className="decor-home"><Building2 size={92} strokeWidth={0.8} /></div>
        <div className="decor-caption">A better way to manage<br />the places we call home.</div>
      </div>
      <section className="auth-panel">
        <div className="auth-inner">
          <div className="brand-lockup">
            <span className="brand-mark">H</span>
            <span>haven<span className="brand-period">.</span></span>
          </div>
          <div className="auth-heading">
            <p className="eyebrow">PROPERTY MANAGEMENT · UGANDA</p>
            <h1>{title}</h1>
            <p>{mode === "signin" ? "Sign in to your secure property workspace." : "Use the email address linked to your account."}</p>
          </div>
          {notice && <div className="success-message" role="status"><Check size={17} />{notice}</div>}
          {mode === "signin" && new URLSearchParams(window.location.search).has("invitation_id") && (
            <div className="info-banner"><ShieldCheck size={17} />Invitation detected. Sign in using the invited email address to accept access.</div>
          )}
          <form onSubmit={submit} className="auth-form">
            {mode !== "password" && (
              <label className="field-label">
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label className="field-label">
                {mode === "password" ? "New password" : "Password"}
                <input
                  type="password"
                  name="password"
                  autoComplete={mode === "password" ? "new-password" : "current-password"}
                  minLength={10}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "password" ? "At least 10 characters" : "Enter your password"}
                />
              </label>
            )}
            {mode === "password" && (
              <label className="field-label">
                {mode === "password" ? "Confirm new password" : "Confirm password"}
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                />
              </label>
            )}
            {message && <p className="form-error" role="alert">{message}</p>}
            <button type="submit" className="primary-button wide" disabled={pending}>
              {pending ? "Please wait…" : mode === "signin" ? "Sign in securely" : mode === "forgot" ? "Send reset instructions" : "Update password"}
              {!pending && <ArrowUpRight size={17} />}
            </button>
          </form>
          <div className="auth-links">
            {mode === "signin" && (
              <>
                <button type="button" className="text-button" onClick={() => { setMode("forgot"); onMessage(""); setNotice(""); }}>Forgot password?</button>
                
              </>
            )}
            {mode !== "signin" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setMode("signin");
                  setPassword("");
                  setConfirmPassword("");
                  onMessage("");
                  setNotice("");
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
          <div className="auth-footer"><ShieldCheck size={15} />Protected access · Invitation or administrator approval required</div>
        </div>
      </section>
    </main>
  );
}

function Workspace({
  user,
  session,
  onSignedOut,
}: {
  user: User;
  session: Session;
  onSignedOut: () => void;
}) {
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<Role>("tenant");
  const [page, setPage] = useState<Page>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const isPrivileged = isAdminRole(role);
  const [aal, setAal] = useState<string>("aal1");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (active && data) setAal(data.currentLevel ?? "aal1");
    });
    return () => { active = false; };
  }, [session.access_token]);

  useEffect(() => {
    let active = true;
    async function loadMemberships() {
      if (!supabase) return;
      setLoading(true);
      const { data, error: resultError } = await supabase
        .from("organization_members")
        .select("organization_id,role,organizations(id,name,require_second_approval)")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (!active) return;
      if (resultError) {
        setError("Workspace access could not be loaded. Please try again or contact your administrator.");
        setLoading(false);
        return;
      }

      const available = (data ?? []).flatMap((row) => {
        const linked = row.organizations;
        if (!linked || Array.isArray(linked)) return [];
        return [{
          organization_id: row.organization_id,
          role: row.role as Role,
          organization: linked as Organization,
        }];
      });
      setMemberships(available);
      if (available.length > 0) {
        setOrganization(available[0].organization);
        setRole(available[0].role);
      }
      setLoading(false);
    }
    void loadMemberships();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    const invitationId = new URLSearchParams(window.location.search).get("invitation_id");
    if (!invitationId || !supabase) return;
    let active = true;
    void supabase.rpc("accept_org_invitation", { p_invitation_id: invitationId }).then(({ error: inviteError }) => {
      if (!active) return;
      if (inviteError) {
        setError("The invitation could not be accepted. Confirm you signed in with the invited email, or contact the inviter.");
        return;
      }
      window.history.replaceState({}, "", window.location.pathname);
      window.location.reload();
    });
    return () => { active = false; };
  }, [user.id]);

  const changeOrganization = (membership: Membership) => {
    setOrganization(membership.organization);
    setRole(membership.role);
    setPage("Overview");
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) {
      setError("We couldn't revoke your sessions. Please retry and contact an administrator if this continues.");
      return;
    }
    onSignedOut();
  };

  const visibleNavigation = useMemo(
    () => navigation.filter((item) => {
      if (item.name === "Audit") return isPrivileged;
      if (item.name === "Team") return isPrivileged || role === "property_manager";
      if (item.name === "Approvals") return role !== "tenant" && role !== "employee";
      if (item.name === "Properties" && role === "tenant") return false;
      if (item.name === "Tenancies" && role === "tenant") return false;
      return true;
    }),
    [isPrivileged, role],
  );

  if (loading) return <div className="loading-screen" role="status">Preparing your workspace…</div>;
  if (error && !organization) {
    return <AccessMessage message={error} onSignOut={signOut} />;
  }
  if (!organization) {
    return <AccessMessage message="Your account is signed in, but it does not yet have access to an organization. Ask the organization owner for an invitation." onSignOut={signOut} />;
  }

  if (isPrivileged && aal !== "aal2") {
    return <MfaGate onComplete={() => window.location.reload()} onSignOut={signOut} />;
  }

  const pageSubtitle: Record<Page, string> = {
    Overview: "Your portfolio at a glance.",
    Properties: "Buildings, units, and assigned locations.",
    Tenancies: "Lease terms and active occupancy.",
    Payments: "Rent activity, securely scoped to your role.",
    Maintenance: "Requests and work that need attention.",
    Documents: "Private tenancy and property files.",
    Notices: "Updates for residents and your team.",
    Approvals: "Review sensitive actions before they are carried out.",
    Team: "People and access for this organization.",
    Audit: "A read-only record of important activity.",
    Security: "Manage account verification and session access.",
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">H</span>
          <span className="brand-name">haven<span className="brand-period">.</span></span>
          <span className="country-pill">UG</span>
        </div>
        <div className="org-switcher-wrap">
          <button className="org-switcher" type="button" onClick={() => setOrgMenuOpen((value) => !value)}>
            <span className="org-avatar">{organization.name.slice(0, 1).toUpperCase()}</span>
            <span className="org-switcher-text"><strong>{organization.name}</strong><small>{roleLabels[role]}</small></span>
            <ChevronDown size={16} />
          </button>
          {orgMenuOpen && memberships.length > 1 && (
            <div className="org-menu">
              {memberships.map((membership) => (
                <button key={membership.organization_id} onClick={() => { changeOrganization(membership); setOrgMenuOpen(false); }} type="button">
                  {membership.organization.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <span className="nav-group-label">WORKSPACE</span>
          {visibleNavigation.filter((item) => item.group === "Workspace").map((item) => (
            <NavItem key={item.name} item={item} active={page === item.name} onClick={() => { setPage(item.name); setMobileNavOpen(false); }} />
          ))}
          <span className="nav-group-label management-label">MANAGEMENT</span>
          {visibleNavigation.filter((item) => item.group === "Management").map((item) => (
            <NavItem key={item.name} item={item} active={page === item.name} onClick={() => { setPage(item.name); setMobileNavOpen(false); }} />
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card"><span className="support-icon"><CircleHelp size={17} /></span><span><strong>Need a hand?</strong><small>View setup &amp; security notes</small></span><ArrowUpRight size={14} /></div>
          <button className="profile-button" type="button" onClick={() => setProfileMenuOpen((value) => !value)}>
            <span className="profile-avatar">{(user.email?.slice(0, 1) ?? "U").toUpperCase()}</span>
            <span className="profile-meta"><strong>{user.email?.split("@")[0] ?? "Account"}</strong><small>{user.email}</small></span>
            <MoreHorizontal size={18} />
          </button>
          {profileMenuOpen && <div className="profile-menu"><button onClick={() => { setPage("Security"); setProfileMenuOpen(false); }} type="button"><ShieldCheck size={15} /> Account security</button><button onClick={() => void signOut()} type="button"><LogOut size={15} /> Sign out everywhere</button></div>}
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={16} />
              <input aria-label="Search current page" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" type="button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <span className="topbar-divider" />
            <button className="help-button" type="button" title="Security help"><CircleHelp size={18} /></button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><p className="eyebrow">{organization.name.toUpperCase()}</p><h1>{page}</h1><p className="page-subtitle">{pageSubtitle[page]}</p></div>
            <div className="page-heading-actions">
              <span className="date-chip"><CalendarDays size={15} />{new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date())}</span>
              {page === "Maintenance" && <button className="primary-button compact" onClick={() => document.getElementById("maintenance-title")?.focus()} type="button"><Plus size={16} /> New request</button>}
            </div>
          </div>
          {error && <div className="inline-error" role="alert"><ShieldCheck size={17} />{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
          {page === "Overview" && <Dashboard organizationId={organization.id} role={role} onNavigate={setPage} setError={setError} />}
          {pageConfig[page] && (
            <DataPage
              page={page}
              organization={organization}
              role={role}
              user={user}
              search={search}
              setError={setError}
            />
          )}
          {page === "Approvals" && <ApprovalsPage organization={organization} role={role} userId={user.id} setError={setError} />}
          {page === "Team" && <InvitationComposer organization={organization} user={user} role={role} setError={setError} />}
          {page === "Audit" && <p className="privacy-note"><ShieldCheck size={15} />Audit events contain record references only, not passwords, access tokens, or payment credentials.</p>}
          {page === "Security" && <AccountSecurity user={user} session={session} role={role} onSignOut={signOut} setError={setError} />}
          <footer className="app-footer"><span>Haven for Uganda</span><span>Secure by design, never “hack proof.”</span><span>All amounts in UGX</span></footer>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof navigation)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={onClick} type="button" aria-current={active ? "page" : undefined}><Icon size={18} strokeWidth={active ? 2 : 1.8} /><span>{item.name}</span>{item.name === "Approvals" && <span className="nav-dot" />}</button>;
}

function Dashboard({ organizationId, role, onNavigate, setError }: { organizationId: string; role: Role; onNavigate: (page: Page) => void; setError: (message: string) => void }) {
  const [stats, setStats] = useState<{ properties: number | null; tenancies: number | null; pending: number | null; maintenance: number | null }>({ properties: null, tenancies: null, pending: null, maintenance: null });
  const [payments, setPayments] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) return;
      const [properties, tenancies, pending, maintenance, paymentRows, maintenanceRows] = await Promise.all([
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        supabase.from("tenancies").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "active"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
        supabase.from("maintenance_requests").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["open", "in_progress"]),
        supabase.from("payments").select("id,tenancy_id,status,payment_method,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(5),
        supabase.from("maintenance_requests").select("id,title,priority,status,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(4),
      ]);
      if (!active) return;
      if (properties.error || tenancies.error || pending.error || maintenance.error || paymentRows.error || maintenanceRows.error) {
        setError("Some portfolio records could not be loaded. Counts may be incomplete; check your access and retry.");
      }
      setStats({
        properties: properties.error ? null : properties.count ?? 0,
        tenancies: tenancies.error ? null : tenancies.count ?? 0,
        pending: pending.error ? null : pending.count ?? 0,
        maintenance: maintenance.error ? null : maintenance.count ?? 0,
      });
      setPayments(paymentRows.error ? [] : (paymentRows.data ?? []) as Row[]);
      setRequests(maintenanceRows.error ? [] : (maintenanceRows.data ?? []) as Row[]);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [organizationId, setError]);

  return (
    <>
      <section className="welcome-strip">
        <div><span className="welcome-spark">✦</span><div><h2>Good day</h2><p>Your portfolio is up to date. Here’s what’s happening today.</p></div></div>
        <div className="welcome-art" aria-hidden="true"><div className="art-sun" /><Building2 size={58} strokeWidth={1} /><Home size={42} strokeWidth={1} /></div>
      </section>
      <section className="stats-grid" aria-label="Portfolio summary">
        <StatCard label="Properties" value={loading || stats.properties === null ? "—" : stats.properties.toString()} meta="In your portfolio" icon={<Building2 size={18} />} trend="In this workspace" tone="green" />
        <StatCard label="Active tenancies" value={loading || stats.tenancies === null ? "—" : stats.tenancies.toString()} meta="Current residents" icon={<KeyRound size={18} />} trend="Lease occupancy" tone="blue" />
        <StatCard label="Payments pending" value={loading || stats.pending === null ? "—" : stats.pending.toString()} meta="Awaiting verification" icon={<Wallet size={18} />} trend={stats.pending === null ? "—" : stats.pending ? "Needs review" : "All clear"} tone="amber" />
        <StatCard label="Open maintenance" value={loading || stats.maintenance === null ? "—" : stats.maintenance.toString()} meta="Requests in progress" icon={<Wrench size={18} />} trend={stats.maintenance === null ? "—" : stats.maintenance ? "View requests" : "All clear"} tone="purple" />
      </section>
      <div className="dashboard-grid">
        <section className="surface-card payments-card">
          <div className="card-heading"><div><p className="eyebrow">COLLECTIONS</p><h2>Recent payment activity</h2></div><button className="subtle-link" onClick={() => onNavigate("Payments")} type="button">View all <ArrowUpRight size={14} /></button></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Reference</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {payments.length ? payments.map((payment) => (
                  <tr key={String(payment.id)}>
                    <td><span className="payment-ref"><span className="payment-icon"><ArrowDownLeft size={15} /></span>#{String(payment.id).slice(0, 8).toUpperCase()}</span></td>
                    <td className="muted-cell">{String(payment.payment_method ?? "—").replaceAll("_", " ")}</td>
                    <td className="muted-cell">{formatDate(payment.created_at)}</td>
                    <td><StatusBadge value={payment.status} /></td>
                  </tr>
                )) : <EmptyTable colSpan={4} text={loading ? "Loading recent payments…" : "No payment activity yet"} />}
              </tbody>
            </table>
          </div>
          <div className="table-footnote"><ShieldCheck size={14} />Payment amounts are shown only to authorized roles.</div>
        </section>
        <section className="surface-card tasks-card">
          <div className="card-heading"><div><p className="eyebrow">TO DO</p><h2>Maintenance requests</h2></div><button className="round-plus" onClick={() => onNavigate("Maintenance")} type="button" aria-label="Create maintenance request"><Plus size={17} /></button></div>
          <div className="task-list">
            {requests.length ? requests.map((request) => (
              <div className="task-row" key={String(request.id)}>
                <span className="task-status"><Wrench size={15} /></span>
                <span className="task-copy"><strong>{String(request.title)}</strong><small>{formatDate(request.created_at)}</small></span>
                <StatusBadge value={request.status} />
              </div>
            )) : <div className="empty-state compact-empty">{loading ? "Loading requests…" : "No open requests."}</div>}
          </div>
          <div className="task-summary"><span><span className="summary-dot amber-dot" />Priority review</span><strong>{stats.maintenance} open</strong></div>
        </section>
      </div>
      <section className="surface-card quick-actions">
        <div><p className="eyebrow">SHORTCUTS</p><h2>Keep things moving</h2><p className="quick-copy">Common actions for your property team.</p></div>
        <div className="quick-action-list">
          {isAdminRole(role) && <QuickAction icon={<Building2 size={18} />} label="Add property" hint="Start a property record" onClick={() => onNavigate("Properties")} />}
          {(isAdminRole(role) || role === "property_manager") && <QuickAction icon={<Users size={18} />} label="Invite a teammate" hint="Access is approved first" onClick={() => onNavigate("Team")} />}
          {(isAdminRole(role) || role === "property_manager") && <QuickAction icon={<FileText size={18} />} label="Share a notice" hint="Keep residents informed" onClick={() => onNavigate("Notices")} />}
          {(role === "tenant" || role === "employee") && <QuickAction icon={<Wrench size={18} />} label="Report an issue" hint="Request maintenance" onClick={() => onNavigate("Maintenance")} />}
        </div>
      </section>
      <div className="privacy-note dashboard-note"><ShieldCheck size={15} />Secure organization-level access is enforced by Supabase RLS on every request.</div>
    </>
  );
}

function StatCard({ label, value, meta, icon, trend, tone }: { label: string; value: string; meta: string; icon: ReactNode; trend: string; tone: string }) {
  return <article className={`stat-card stat-${tone}`}><div className="stat-top"><span className="stat-icon">{icon}</span><button aria-label={`${label} options`} type="button" className="stat-menu"><MoreHorizontal size={18} /></button></div><p className="stat-label">{label}</p><strong className="stat-value">{value}</strong><div className="stat-bottom"><span>{meta}</span><span className="stat-trend">{trend}</span></div></article>;
}

function QuickAction({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick} type="button"><span className="quick-icon">{icon}</span><span><strong>{label}</strong><small>{hint}</small></span><ArrowUpRight size={16} /></button>;
}

function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? "unknown").replaceAll("_", " ");
  const tone = /confirmed|resolved|approved|active|clean/i.test(label)
    ? "badge-green"
    : /pending|in.progress|open|normal/i.test(label)
      ? "badge-amber"
      : /rejected|failed|urgent|overdue/i.test(label)
        ? "badge-red"
        : "badge-neutral";
  return <span className={`status-badge ${tone}`}><i />{label}</span>;
}

function EmptyTable({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td className="empty-cell" colSpan={colSpan}>{text}</td></tr>;
}

function DataPage({
  page,
  organization,
  role,
  user,
  search,
  setError,
}: {
  page: Page;
  organization: Organization;
  role: Role;
  user: User;
  search: string;
  setError: (message: string) => void;
}) {
  const config = pageConfig[page];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [openingId, setOpeningId] = useState("");
  const [signedLink, setSignedLink] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !config) return;
    setLoading(true);
    setAmounts({});
    const query = supabase.from(config.table).select(config.select);
    const result = await query.eq("organization_id", organization.id).order("created_at", { ascending: false }).limit(100);
    if (result.error) {
      setError(safeErrorMessage());
      setRows([]);
      setLoading(false);
      return;
    }
    let nextRows = (result.data ?? []) as unknown as Row[];
    if (page === "Team" && nextRows.length) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", nextRows.map((row) => String(row.user_id)));
      if (profileError) setError("Team records loaded, but member profile names could not be read.");
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
      nextRows = nextRows.map((row) => ({ ...row, display_name: names.get(String(row.user_id)) ?? "" }));
    }
    if (page === "Tenancies" && nextRows.length) {
      const [profiles, units] = await Promise.all([
        supabase.from("profiles").select("id,display_name").in("id", nextRows.map((row) => String(row.tenant_user_id)).filter(Boolean)),
        supabase.from("units").select("id,unit_number").in("id", nextRows.map((row) => String(row.unit_id))),
      ]);
      if (profiles.error || units.error) setError("Some tenancy details could not be displayed for your role.");
      const names = new Map((profiles.data ?? []).map((profile) => [profile.id, profile.display_name]));
      const unitNumbers = new Map((units.data ?? []).map((unit) => [unit.id, unit.unit_number]));
      nextRows = nextRows.map((row) => ({
        ...row,
        display_name: names.get(String(row.tenant_user_id)) ?? "",
        unit_number: unitNumbers.get(String(row.unit_id)) ?? "",
      }));
    }
    setRows(nextRows);
    if (page === "Payments" && nextRows.length && role !== "employee") {
      const { data, error } = await supabase.rpc("get_financial_amounts", {
        p_kind: "payment",
        p_ids: nextRows.map((row) => String(row.id)),
      });
      if (error) {
        setError("Payment records loaded, but amounts could not be retrieved for this role.");
      } else {
        setAmounts(Object.fromEntries((data ?? []).map((item: { record_id: string; amount_ugx: string | number }) => [item.record_id, String(item.amount_ugx)])));
      }
    }
    setLoading(false);
  }, [config, organization.id, page, role, setError]);

  useEffect(() => { void load(); }, [load]);

  const filteredRows = rows.filter((row) => config?.columns.some(([key]) => String(row[key] ?? "").toLowerCase().includes(search.toLowerCase())) ?? true);

  async function openDocument(row: Row) {
    if (!supabase) return;
    const id = String(row.id);
    setOpeningId(id);
    const { data, error } = await supabase.storage
      .from("tenant-documents")
      .createSignedUrl(String(row.storage_path), 60);
    setOpeningId("");
    if (error || !data?.signedUrl) {
      setError("This file is unavailable or your access has expired. Ask the document owner for help.");
      return;
    }
    setSignedLink({ id, url: data.signedUrl });
  }

  if (!config) return null;
  return (
    <>
      <section className="surface-card records-card">
        <div className="card-heading records-heading"><div><p className="eyebrow">ORGANIZATION RECORDS</p><h2>{page} directory</h2></div><span className="record-count">{filteredRows.length} records</span></div>
        <div className="table-scroll">
          <table className="data-table records-table">
            <thead><tr>{config.columns.map(([key, label]) => <th key={key}>{label}</th>)}{page === "Documents" && <th>File access</th>}</tr></thead>
            <tbody>
              {loading ? <EmptyTable colSpan={config.columns.length + (page === "Documents" ? 1 : 0)} text="Loading records…" /> : filteredRows.length ? filteredRows.map((row) => (
                <tr key={String(row.id)}>
                  {config.columns.map(([key]) => (
                    <td key={key} className={key === "status" || key === "scan_status" ? "status-cell" : ""}>
                      {key === "status" || key === "scan_status" || key === "priority" ? <StatusBadge value={row[key]} /> :
                        key === "amount_ugx" ? (role === "employee" ? "Status only" : formatUGX(amounts[String(row.id)])) :
                          key === "size_bytes" ? `${(Number(row[key] ?? 0) / 1024).toFixed(0)} KB` :
                            key.endsWith("_at") || key.endsWith("_start") || key.endsWith("_end") ? formatDate(row[key]) :
                              key === "user_id" || key === "tenant_user_id" ? String(row.display_name || `#${String(row[key] ?? "").slice(0, 8).toUpperCase()}`) :
                                key === "unit_id" ? String(row.unit_number || `#${String(row.unit_id ?? "").slice(0, 8).toUpperCase()}`) :
                                key === "role" ? roleLabels[String(row[key]) as Role] ?? String(row[key]) :
                                  key === "description" || key === "body" ? <span className="truncate-cell" title={String(row[key] ?? "")}>{String(row[key] ?? "—")}</span> :
                                    key === "id" || key.endsWith("_id") ? <span className="reference-cell">#{String(row[key] ?? "").slice(0, 8).toUpperCase()}</span> : String(row[key] ?? "—")}
                    </td>
                  ))}
                  {page === "Documents" && <td>{signedLink?.id === String(row.id) ? <a className="text-button file-button" href={signedLink.url} target="_blank" rel="noopener noreferrer">Open secure link</a> : <button className="text-button file-button" disabled={openingId === String(row.id) || row.scan_status !== "clean"} onClick={() => void openDocument(row)} type="button">{openingId === String(row.id) ? "Preparing…" : row.scan_status === "clean" ? "Create 60-sec link" : "Scan pending"}</button>}</td>}
                </tr>
              )) : <EmptyTable colSpan={config.columns.length + (page === "Documents" ? 1 : 0)} text={search ? "No records match your search." : "No records yet."} />}
            </tbody>
          </table>
        </div>
        {page === "Payments" && <p className="table-footnote"><ShieldCheck size={14} />Confirmations and refunds are server-verified. This screen cannot mark a payment as successful.</p>}
      </section>
      {page === "Properties" && isAdminRole(role) && <PropertyComposer organization={organization} user={user} setError={setError} onCreated={load} />}
      {page === "Payments" && role !== "employee" && <PaymentComposer organization={organization} user={user} role={role} setError={setError} onCreated={load} />}
      {page === "Documents" && <DocumentUploader organization={organization} user={user} role={role} setError={setError} onUploaded={load} />}
      {page === "Notices" && (isAdminRole(role) || role === "property_manager") && <NoticeComposer organization={organization} user={user} setError={setError} onCreated={load} />}
      {page === "Maintenance" && <MaintenanceComposer organization={organization} user={user} role={role} setError={setError} onSubmitted={load} />}
    </>
  );
}

function PropertyComposer({ organization, user, setError, onCreated }: { organization: Organization; user: User; setError: (message: string) => void; onCreated: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setNotice("");
    const { error } = await supabase.from("properties").insert({
      organization_id: organization.id,
      created_by: user.id,
      name: String(form.get("name") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      district: String(form.get("district") ?? "").trim() || null,
      city: String(form.get("city") ?? "").trim() || null,
    });
    setPending(false);
    if (error) {
      setError("The property couldn't be created. Confirm your organization role and try again.");
      return;
    }
    formElement.reset();
    setNotice("Property record created.");
    await onCreated();
  }

  return (
    <section className="surface-card composer-card">
      <div className="card-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Add a property</h2></div><span className="composer-icon"><Building2 size={19} /></span></div>
      <form className="inline-form two-column" onSubmit={(event) => void submit(event)}>
        <label className="field-label">Property name<input name="name" required maxLength={120} placeholder="e.g. Acacia Court" /></label>
        <label className="field-label">Street address<input name="address" required maxLength={300} placeholder="Plot, street, and area" /></label>
        <label className="field-label">District<input name="district" maxLength={100} placeholder="e.g. Nakawa" /></label>
        <label className="field-label">City<input name="city" maxLength={100} defaultValue="Kampala" /></label>
        {notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}
        <button className="primary-button compact" disabled={pending} type="submit">{pending ? "Saving…" : "Create property"}<ArrowUpRight size={15} /></button>
      </form>
    </section>
  );
}

function PaymentComposer({ organization, user, role, setError, onCreated }: { organization: Organization; user: User; role: Role; setError: (message: string) => void; onCreated: () => Promise<void> }) {
  const [tenancies, setTenancies] = useState<{ id: string; unit_id: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.from("tenancies").select("id,unit_id")
      .eq("organization_id", organization.id).eq("status", "active")
      .then(({ data, error }) => {
        if (error) {
          setError("Payment submission is unavailable because tenancy access could not be loaded.");
          return;
        }
        setTenancies(data ?? []);
      });
  }, [organization.id, setError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = String(form.get("amount") ?? "").trim();
    const amountMatch = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount);
    const amountCents = amountMatch
      ? BigInt(amountMatch[1]) * 100n + BigInt((amountMatch[2] ?? "").padEnd(2, "0") || "0")
      : 0n;
    if (amountCents <= 0n) {
      setError("Enter a positive UGX amount with up to two decimal places.");
      return;
    }
    setPending(true);
    setNotice("");
    const { error } = await supabase.from("payments").insert({
      organization_id: organization.id,
      tenancy_id: String(form.get("tenancy_id") ?? ""),
      amount_ugx: amount,
      payment_method: String(form.get("payment_method") ?? "manual"),
      status: "pending",
      created_by: user.id,
    });
    setPending(false);
    if (error) {
      setError("The payment record couldn't be submitted. It remains unconfirmed until a trusted verification process completes.");
      return;
    }
    formElement.reset();
    setNotice("Payment record submitted as pending; it has not been marked successful.");
    await onCreated();
  }

  return (
    <section className="surface-card composer-card">
      <div className="card-heading"><div><p className="eyebrow">UNCONFIRMED ENTRY</p><h2>{role === "tenant" ? "Report a rent payment" : "Record a pending payment"}</h2></div><span className="composer-icon"><Wallet size={19} /></span></div>
      <form className="inline-form two-column" onSubmit={(event) => void submit(event)}>
        <label className="field-label">Tenancy<select name="tenancy_id" required defaultValue=""><option value="" disabled>Select tenancy</option>{tenancies.map((tenancy) => <option value={tenancy.id} key={tenancy.id}>Unit #{tenancy.unit_id.slice(0, 8).toUpperCase()}</option>)}</select></label>
        <label className="field-label">Amount (UGX)<input name="amount" type="text" inputMode="decimal" pattern="[0-9]{1,12}([.][0-9]{1,2})?" required placeholder="650000" /></label>
        <label className="field-label">Payment method<select name="payment_method" defaultValue="mobile_money"><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="manual">Other / manual</option></select></label>
        {notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}
        <button className="primary-button compact" disabled={pending || !tenancies.length} type="submit">{pending ? "Submitting…" : "Submit as pending"}<ArrowUpRight size={15} /></button>
      </form>
      <p className="table-footnote"><ShieldCheck size={14} />No payment is confirmed from this form. Provider verification and approval are separate trusted-server operations.</p>
    </section>
  );
}

function DocumentUploader({ organization, user, role, setError, onUploaded }: { organization: Organization; user: User; role: Role; setError: (message: string) => void; onUploaded: () => Promise<void> }) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [tenancyId, setTenancyId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    if (role === "tenant") {
      void supabase.from("tenancies").select("id,property_id")
        .eq("organization_id", organization.id).eq("tenant_user_id", user.id).eq("status", "active").limit(1)
        .then(({ data, error }) => {
          if (error) {
            setError("Document access could not be loaded.");
            return;
          }
          if (data?.[0]) setTenancyId(data[0].id);
        });
      return;
    }
    void supabase.from("properties").select("id,name").eq("organization_id", organization.id)
      .then(({ data, error }) => {
        if (error) {
          setError("Document access could not be loaded.");
          return;
        }
        setProperties(data ?? []);
        if (data?.[0]) setPropertyId(data[0].id);
      });
  }, [organization.id, role, setError, user.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Choose a non-empty PDF, JPEG, PNG, or WebP file no larger than 10 MiB.");
      return;
    }

    const scopedId = role === "tenant" ? tenancyId : String(form.get("property_id") ?? "");
    if (!scopedId) {
      setError("Select an authorized property or tenancy first.");
      return;
    }
    const safeName = file.name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100) || "document";
    const documentId = crypto.randomUUID();
    const path = `${organization.id}/${role === "tenant" ? "tenancy" : "property"}/${scopedId}/${documentId}-${safeName}`;
    setPending(true);
    setNotice("");
    const { error: metadataError } = await supabase.from("documents").insert({
      organization_id: organization.id,
      property_id: role === "tenant" ? null : scopedId,
      tenancy_id: role === "tenant" ? scopedId : null,
      storage_path: path,
      display_name: file.name.slice(0, 180),
      content_type: file.type,
      size_bytes: file.size,
      scan_status: "pending",
      uploaded_by: user.id,
    });
    if (metadataError) {
      setPending(false);
      setError("Document metadata could not be registered for your authorized scope.");
      return;
    }
    const { error: uploadError } = await supabase.storage.from("tenant-documents").upload(path, file, {
      contentType: file.type,
      cacheControl: "60",
      upsert: false,
    });
    setPending(false);
    if (uploadError) {
      setError("The file upload failed. Its metadata remains quarantined; contact an administrator to clean up the pending record.");
      await onUploaded();
      return;
    }
    formElement.reset();
    setNotice("Uploaded to private storage. The file stays unavailable until a trusted malware scanner clears it.");
    await onUploaded();
  }

  return (
    <section className="surface-card composer-card">
      <div className="card-heading"><div><p className="eyebrow">PRIVATE STORAGE</p><h2>Upload a document</h2></div><span className="composer-icon"><FileText size={19} /></span></div>
      <form className="inline-form two-column" onSubmit={(event) => void submit(event)}>
        {role === "tenant" ? <p className="form-hint"><ShieldCheck size={15} />This file will be attached to your active tenancy.</p> :
          <label className="field-label">Property<select name="property_id" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required><option value="" disabled>Select assigned property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>}
        <label className="field-label">PDF or image file<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required /></label>
        {notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}
        <button className="primary-button compact" disabled={pending || (role === "tenant" ? !tenancyId : !properties.length)} type="submit">{pending ? "Uploading…" : "Upload securely"}<ArrowUpRight size={15} /></button>
      </form>
      <p className="table-footnote"><ShieldCheck size={14} />Private bucket · 10 MiB max · PDF/JPEG/PNG/WebP · malware scanning is required before download.</p>
    </section>
  );
}

function NoticeComposer({ organization, user, setError, onCreated }: { organization: Organization; user: User; setError: (message: string) => void; onCreated: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    setNotice("");
    const { error } = await supabase.from("notices").insert({
      organization_id: organization.id,
      created_by: user.id,
      title: String(form.get("title") ?? "").trim(),
      body: String(form.get("body") ?? "").trim(),
    });
    setPending(false);
    if (error) {
      setError("The notice couldn't be published. Confirm your role and try again.");
      return;
    }
    formElement.reset();
    setNotice("Organization notice published.");
    await onCreated();
  }

  return (
    <section className="surface-card composer-card">
      <div className="card-heading"><div><p className="eyebrow">COMMUNICATIONS</p><h2>Publish an organization notice</h2></div><span className="composer-icon"><Bell size={19} /></span></div>
      <form className="inline-form" onSubmit={(event) => void submit(event)}>
        <label className="field-label">Title<input name="title" minLength={3} maxLength={160} required placeholder="e.g. Water service notice" /></label>
        <label className="field-label">Message<textarea name="body" minLength={1} maxLength={8000} rows={4} required placeholder="Write a clear update for residents and team members." /></label>
        {notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}
        <button className="primary-button compact" disabled={pending} type="submit">{pending ? "Publishing…" : "Publish notice"}<ArrowUpRight size={15} /></button>
      </form>
    </section>
  );
}

function MaintenanceComposer({ organization, user, role, setError, onSubmitted }: { organization: Organization; user: User; role: Role; setError: (message: string) => void; onSubmitted: () => Promise<void> }) {
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [tenancyId, setTenancyId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!supabase) return;
    void supabase.from("properties").select("id,name").eq("organization_id", organization.id).then(({ data, error }) => {
      if (error) {
        setError("Assigned properties could not be loaded.");
        return;
      }
      const choices = data ?? [];
      setProperties(choices);
      if (choices[0]) setPropertyId(choices[0].id);
    });
    if (role === "tenant") {
      void supabase.from("tenancies").select("id,property_id").eq("organization_id", organization.id).eq("tenant_user_id", user.id).eq("status", "active").limit(1).then(({ data, error }) => {
        if (error) {
          setError("Your tenancy could not be loaded.");
          return;
        }
        const tenancy = data?.[0];
        if (tenancy) {
          setTenancyId(tenancy.id);
          setPropertyId(tenancy.property_id);
        }
      });
    }
  }, [organization.id, role, setError, user.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setSuccess("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedProperty = role === "tenant" ? propertyId : String(form.get("property_id") ?? "");
    const { error } = await supabase.from("maintenance_requests").insert({
      organization_id: organization.id,
      property_id: selectedProperty,
      tenancy_id: role === "tenant" ? tenancyId : null,
      created_by: user.id,
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      priority: String(form.get("priority") ?? "normal"),
    });
    setPending(false);
    if (error) {
      setError("The request couldn't be submitted. Confirm your property assignment and try again.");
      return;
    }
    formElement.reset();
    setSuccess("Maintenance request submitted.");
    await onSubmitted();
  }

  return (
    <section className="surface-card composer-card">
      <div className="card-heading"><div><p className="eyebrow">NEW REQUEST</p><h2>Report a maintenance issue</h2></div><span className="composer-icon"><Wrench size={19} /></span></div>
      <form className="inline-form" onSubmit={(event) => void submit(event)}>
        {role !== "tenant" && <label className="field-label">Property<select name="property_id" value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required><option value="" disabled>Select an assigned property</option>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>}
        <label className="field-label">Request title<input id="maintenance-title" name="title" minLength={3} maxLength={160} placeholder="e.g. Kitchen tap repair" required /></label>
        <label className="field-label">Description<textarea name="description" rows={3} maxLength={5000} placeholder="Describe the issue and where it is located." /></label>
        <label className="field-label">Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        {success && <p className="success-message" role="status"><Check size={16} />{success}</p>}
        <button className="primary-button compact" disabled={pending || !properties.length} type="submit">{pending ? "Submitting…" : "Submit request"}<ArrowUpRight size={15} /></button>
      </form>
    </section>
  );
}

function ApprovalsPage({ organization, role, userId, setError }: { organization: Organization; role: Role; userId: string; setError: (message: string) => void }) {
  const [requests, setRequests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("approval_requests")
      .select("id,action_type,payload,reason,requested_by,status,expires_at,created_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }).limit(50);
    if (error) setError("Approval requests could not be loaded.");
    setRequests((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [organization.id, setError]);

  useEffect(() => { void load(); }, [load]);

  async function decide(request: Row, decision: "approved" | "rejected") {
    if (!supabase) return;
    const id = String(request.id);
    const reason = reasonById[id]?.trim() || (decision === "approved" ? "Reviewed and approved." : "Reviewed and rejected.");
    setWorkingId(id);
    const { error } = await supabase.rpc("resolve_approval_request", {
      p_request_id: id,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) {
      setError("This request could not be decided. It may have expired, or your role may not permit this action.");
      setWorkingId("");
      return;
    }
    if (decision === "approved" && request.action_type === "staff_invitation") {
      const payload = objectValue(request.payload);
      const { error: inviteError } = await supabase.functions.invoke("invite-member", {
        body: {
          organization_id: organization.id,
          email: payload.email,
          role: payload.role,
          approval_request_id: id,
        },
      });
      if (inviteError) setError("Approval was recorded, but invitation delivery failed. An administrator can retry from Team.");
    }
    setWorkingId("");
    await load();
  }

  const approvalStatus = (request: Row) => {
    if (request.status === "pending" && typeof request.expires_at === "string" && Date.parse(request.expires_at) <= Date.now()) {
      return "expired";
    }
    return String(request.status);
  };

  return (
    <section className="surface-card records-card">
      <div className="card-heading records-heading"><div><p className="eyebrow">CONTROLLED ACTIONS</p><h2>Approval queue</h2></div><span className="record-count">{requests.filter((request) => approvalStatus(request) === "pending").length} pending</span></div>
      {loading ? <div className="empty-state">Loading approval requests…</div> : requests.length ? (
        <div className="approval-list">
          {requests.map((request) => {
            const id = String(request.id);
            const payload = objectValue(request.payload);
            const ownRequest = String(request.requested_by) === userId;
            const currentStatus = approvalStatus(request);
            const canDecide = isAdminRole(role) && currentStatus === "pending" && !ownRequest;
            return (
              <article className="approval-item" key={id}>
                <div className="approval-icon"><ClipboardCheck size={19} /></div>
                <div className="approval-content">
                  <div className="approval-title-line"><h3>{String(request.action_type).replaceAll("_", " ")}</h3><StatusBadge value={currentStatus} /></div>
                  <p>{String(request.reason)}</p>
                  {request.action_type === "staff_invitation" && <small className="approval-detail">{String(payload.email ?? "Email unavailable")} · {String(payload.role ?? "")}</small>}
                  <small className="approval-meta">Requested {formatDate(request.created_at)} · Expires {formatDate(request.expires_at)}</small>
                  {currentStatus === "pending" && <label className="field-label approval-reason">Decision reason<input value={reasonById[id] ?? ""} onChange={(event) => setReasonById((current) => ({ ...current, [id]: event.target.value }))} placeholder="Optional reason" maxLength={1000} /></label>}
                  {currentStatus === "pending" && <div className="approval-actions">
                    <button className="secondary-button" disabled={!canDecide || workingId === id} onClick={() => void decide(request, "rejected")} type="button"><X size={15} /> Reject</button>
                    <button className="primary-button compact" disabled={!canDecide || workingId === id} onClick={() => void decide(request, "approved")} type="button"><CheckCheck size={15} />{workingId === id ? "Saving…" : "Approve"}</button>
                  </div>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state"><ClipboardCheck size={25} /><strong>No approval requests</strong><span>New sensitive actions will appear here.</span></div>}
    </section>
  );
}

function InvitationComposer({ organization, user, role, setError }: { organization: Organization; user: User; role: Role; setError: (message: string) => void }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const memberRole = String(form.get("role") ?? "employee") as Exclude<Role, "owner">;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      setError("Enter a valid email address.");
      setPending(false);
      return;
    }

    if (organization.require_second_approval) {
      const { error } = await supabase.from("approval_requests").insert({
        organization_id: organization.id,
        action_type: "staff_invitation",
        payload: { email, role: memberRole },
        reason: `Invitation requested for ${email} as ${roleLabels[memberRole]}.`,
        requested_by: user.id,
      });
      if (error) {
        setError("The invitation request couldn't be created. Confirm your role and try again.");
      } else {
        setNotice("Request sent for independent approval. An invitation will be sent after approval.");
        formElement.reset();
      }
    } else {
      const { error } = await supabase.functions.invoke("invite-member", {
        body: { organization_id: organization.id, email, role: memberRole },
      });
      if (error) {
        setError("The invitation couldn't be sent. Confirm organization settings and try again.");
      } else {
        setNotice("Invitation sent. The recipient must use the invited email to accept access.");
        formElement.reset();
      }
    }
    setPending(false);
  }

  const canInvite = role === "owner";

  return (
    <div className="team-workflow">
      <section className="surface-card composer-card">
        <div className="card-heading"><div><p className="eyebrow">INVITE WITH LEAST PRIVILEGE</p><h2>Invite a teammate</h2></div><span className="composer-icon"><Users size={19} /></span></div>
        {canInvite ? <form className="inline-form two-column" onSubmit={(event) => void submit(event)}>
          <label className="field-label">Work email<input type="email" name="email" required maxLength={320} placeholder="colleague@example.com" /></label>
          <label className="field-label">Organization role<select name="role" defaultValue="tenant"><option value="tenant">Customer / Tenant</option><option value="employee">Employee</option><option value="property_manager">Property manager</option>{role === "owner" && <option value="administrator">Administrator</option>}</select></label>
          <p className="form-hint"><ShieldCheck size={15} />{organization.require_second_approval ? "A second authorized administrator must approve this request." : "This organization permits direct invitations."}</p>
          {notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}
          <button className="primary-button compact" type="submit" disabled={pending}>{pending ? "Submitting…" : organization.require_second_approval ? "Request approval" : "Send invitation"}<ArrowUpRight size={15} /></button>
        </form> : <div className="empty-state">Your current role cannot invite organization members.</div>}
      </section>
      <section className="surface-card team-note">
        <div className="team-note-icon"><ShieldCheck size={20} /></div><div><h3>Access is invitation-only</h3><p>Only the organization owner can invite members. New invitations default to Customer / Tenant, and only the owner can grant administrator access. Invitations expire after seven days and are bound to the invited email address.</p></div>
      </section>
    </div>
  );
}

function normalizePhone(value: string) {
  const compact = value.trim().replace(/[\s().-]/g, "");
  const international = compact.startsWith("00") ? `+${compact.slice(2)}` :
    compact.startsWith("+") ? compact :
      compact.startsWith("256") ? `+${compact}` :
        compact.startsWith("0") && /^\d{10}$/.test(compact) ? `+256${compact.slice(1)}` :
          `+${compact}`;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

function AccountSecurity({ user, session, role, onSignOut, setError }: { user: User; session: Session; role: Role; onSignOut: () => Promise<void>; setError: (message: string) => void }) {
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [pending, setPending] = useState(false);
  const [phoneNotice, setPhoneNotice] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [aal, setAal] = useState("aal1");

  const loadSecurity = useCallback(async () => {
    if (!supabase) return;
    const [{ data: profile, error: profileError }, { data: factors, error: factorError }, { data: assurance }] = await Promise.all([
      supabase.from("profiles").select("phone,display_name").eq("id", user.id).maybeSingle(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (profileError || factorError) {
      setError("Account security details could not be loaded.");
      return;
    }
    setDisplayName(profile?.display_name ?? "");
    setPhone(profile?.phone ?? user.phone ?? "");
    setPhoneVerified(Boolean(user.phone_confirmed_at));
    setMfaEnabled(factors.totp.some((factor) => factor.status === "verified"));
    setAal(assurance?.currentLevel ?? "aal1");
  }, [setError, user.id, user.phone, user.phone_confirmed_at]);

  useEffect(() => { void loadSecurity(); }, [loadSecurity]);

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setPending(true);
    setProfileNotice("");
    const { error } = await supabase.from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("id", user.id);
    setPending(false);
    if (error) {
      setError("Your profile name could not be saved.");
      return;
    }
    setProfileNotice("Profile name saved.");
  }

  async function sendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("Enter a valid Uganda or international phone number, such as +256 7XX XXX XXX.");
      return;
    }
    setPending(true);
    setPhoneNotice("");
    const { error } = await supabase.auth.updateUser({ phone: normalized });
    setPending(false);
    if (error) {
      setError("Phone verification could not be started. Confirm the SMS provider is configured and try again.");
      return;
    }
    setPendingPhone(normalized);
    setPhone(normalized);
    setPhoneNotice("A verification code was requested. Enter it below to confirm this number.");
  }

  async function verifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !pendingPhone) return;
    setPending(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: pendingPhone,
      token: code,
      type: "phone_change",
    });
    if (verifyError) {
      setPending(false);
      setError("That phone verification code was not accepted. Request a new code and try again.");
      return;
    }
    const { error: profileError } = await supabase.from("profiles").update({ phone: pendingPhone }).eq("id", user.id);
    setPending(false);
    if (profileError) {
      setError("The phone was verified, but your profile could not be updated. Contact an administrator.");
      return;
    }
    setPendingPhone("");
    setCode("");
    setPhoneVerified(true);
    setPhoneNotice("Phone number verified and saved.");
  }

  if (showMfaSetup) {
    return <MfaGate optional onComplete={() => window.location.reload()} onCancel={() => setShowMfaSetup(false)} onSignOut={onSignOut} />;
  }

  return (
    <div className="security-grid">
      <section className="surface-card security-card">
        <div className="card-heading"><div><p className="eyebrow">YOUR PROFILE</p><h2>Directory name</h2></div><span className="composer-icon"><Users size={18} /></span></div>
        <div className="security-content">
          <form className="phone-form" onSubmit={(event) => void saveDisplayName(event)}>
            <label className="field-label">Name shown to your organization<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} /></label>
            <button className="secondary-button security-action" disabled={pending} type="submit">{pending ? "Saving…" : "Save name"}<Check size={15} /></button>
          </form>
          {profileNotice && <p className="success-message" role="status"><Check size={15} />{profileNotice}</p>}
        </div>
      </section>
      <section className="surface-card security-card">
        <div className="card-heading"><div><p className="eyebrow">AUTHENTICATOR</p><h2>Multi-factor authentication</h2></div><span className="composer-icon"><ShieldCheck size={19} /></span></div>
        <div className="security-content">
          <div className="security-status"><span className={`security-status-icon ${mfaEnabled ? "is-secure" : ""}`}><ShieldCheck size={18} /></span><span><strong>{mfaEnabled ? "Authenticator enabled" : "No authenticator configured"}</strong><small>{isAdminRole(role) ? "Privileged accounts require MFA at assurance level AAL2." : "An authenticator adds a second step to sign-in."}</small></span></div>
          {!mfaEnabled && <button className="secondary-button security-action" onClick={() => setShowMfaSetup(true)} type="button">Set up authenticator <ArrowUpRight size={15} /></button>}
          <div className="security-metadata"><span>Current assurance level</span><strong>{aal.toUpperCase()}</strong></div>
        </div>
      </section>
      <section className="surface-card security-card">
        <div className="card-heading"><div><p className="eyebrow">VERIFICATION</p><h2>Phone number</h2></div><span className="composer-icon"><CircleHelp size={18} /></span></div>
        <div className="security-content">
          <form className="phone-form" onSubmit={(event) => void sendPhoneCode(event)}>
            <label className="field-label">Uganda or international number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+256 7XX XXX XXX" /></label>
            <button className="secondary-button security-action" disabled={pending || !phone} type="submit">{phoneVerified ? "Change number" : "Send verification code"}<ArrowUpRight size={15} /></button>
          </form>
          {pendingPhone && <form className="phone-form verify-form" onSubmit={(event) => void verifyPhone(event)}>
            <label className="field-label">SMS verification code<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
            <button className="primary-button compact" disabled={pending || code.length !== 6} type="submit">{pending ? "Verifying…" : "Verify phone"}<Check size={15} /></button>
          </form>}
          {phoneNotice && <p className="success-message" role="status"><Check size={15} />{phoneNotice}</p>}
          <small className="security-help">SMS delivery requires a configured Supabase phone provider. The number is saved to your profile only after verification.</small>
        </div>
      </section>
      <section className="surface-card security-card session-card">
        <div className="card-heading"><div><p className="eyebrow">CURRENT SESSION</p><h2>Session access</h2></div><span className="composer-icon"><KeyRound size={18} /></span></div>
        <div className="security-content">
          <div className="session-details"><span><strong>{user.email}</strong><small>Signed in as this account</small></span><StatusBadge value="active" /></div>
          <div className="security-metadata"><span>This session expires</span><strong>{session.expires_at ? formatDate(new Date(session.expires_at * 1000).toISOString()) : "Managed by Supabase Auth"}</strong></div>
          <p className="security-help">For privacy, this browser shows only its current session. “Sign out everywhere” revokes sessions supported by Supabase Auth.</p>
          <button className="secondary-button security-action revoke-action" onClick={() => void onSignOut()} type="button"><LogOut size={15} />Sign out everywhere</button>
        </div>
      </section>
    </div>
  );
}

function MfaGate({ onComplete, onSignOut, onCancel, optional = false }: { onComplete: () => void; onSignOut: () => Promise<void>; onCancel?: () => void; optional?: boolean }) {
  const [factorId, setFactorId] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [setupKeyMissing, setSetupKeyMissing] = useState(false);
  const [message, setMessage] = useState("");
  const factorSetup = useRef<Promise<{ factorId: string; secret: string; setupKeyMissing: boolean }> | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    if (!factorSetup.current) {
      factorSetup.current = (async () => {
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) throw error;
        const verified = data.totp.find((factor) => factor.status === "verified");
        if (verified) return { factorId: verified.id, secret: "", setupKeyMissing: false };
        const unverified = data.all.find((factor) => factor.factor_type === "totp" && factor.status === "unverified");
        if (unverified) return { factorId: unverified.id, secret: "", setupKeyMissing: true };
        const { data: enrollment, error: enrollmentError } = await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Haven authenticator",
        });
        if (enrollmentError) throw enrollmentError;
        return { factorId: enrollment.id, secret: enrollment.totp.secret, setupKeyMissing: false };
      })();
    }
    void factorSetup.current.then((setup) => {
      if (!active) return;
      setFactorId(setup.factorId);
      setSecret(setup.secret);
      setSetupKeyMissing(setup.setupKeyMissing);
      if (setup.setupKeyMissing) {
        setMessage("An authenticator setup is already pending. Use the key you previously saved, or restart setup if you no longer have it.");
      }
    }).catch(() => {
      if (active) setMessage("Multi-factor setup is unavailable. Try again or contact your organization administrator.");
    });
    return () => { active = false; };
  }, []);

  async function restartSetup() {
    if (!supabase) return;
    setRestarting(true);
    setMessage("");
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMessage("Could not check the pending authenticator setup. Try again.");
      setRestarting(false);
      return;
    }
    for (const factor of data.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (unenrollError) {
        setMessage("Could not remove the pending setup. Try again or contact your organization administrator.");
        setRestarting(false);
        return;
      }
    }
    const { data: enrollment, error: enrollmentError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Haven authenticator",
    });
    if (enrollmentError) {
      setMessage("Could not restart authenticator setup. Try again or contact your organization administrator.");
      setRestarting(false);
      return;
    }
    factorSetup.current = Promise.resolve({ factorId: enrollment.id, secret: enrollment.totp.secret, setupKeyMissing: false });
    setFactorId(enrollment.id);
    setSecret(enrollment.totp.secret);
    setSetupKeyMissing(false);
    setCode("");
    setRestarting(false);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId) return;
    setPending(true);
    setMessage("");
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setMessage("The verification challenge couldn't be started. Try again.");
      setPending(false);
      return;
    }
    const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
    if (error) {
      setMessage("That verification code wasn't accepted. Check your authenticator and try again.");
      setPending(false);
      return;
    }
    onComplete();
  }

  return (
    <main className="mfa-page">
      <section className="mfa-card">
        <span className="mfa-shield"><ShieldCheck size={26} /></span>
        <p className="eyebrow">PRIVILEGED ACCOUNT SECURITY</p>
        <h1>Protect your account</h1>
        <p>{optional ? "Use an authenticator app to add a second step to your sign-in." : "Owner and administrator actions require a second factor. Use an authenticator app to verify your sign-in."}</p>
        {secret && <div className="secret-panel"><strong>Authenticator setup key</strong><code>{secret}</code><small>Manually enter this key in your authenticator app; this screen does not provide a QR code. Keep it private; Haven will not store or log it.</small></div>}
        {setupKeyMissing && <p className="security-help" role="status">The pending key cannot be shown again. Restart setup to create a new key.</p>}
        <form onSubmit={(event) => void verify(event)} className="auth-form">
          <label className="field-label">6-digit authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          {message && <p className="form-error" role="alert">{message}</p>}
          <button className="primary-button wide" disabled={pending || !factorId} type="submit">{pending ? "Verifying…" : secret ? "Verify and enable MFA" : "Verify sign-in"}<ArrowUpRight size={16} /></button>
        </form>
        {setupKeyMissing && <button className="text-button mfa-signout" disabled={restarting || pending} onClick={() => void restartSetup()} type="button">{restarting ? "Restarting setup…" : "Restart authenticator setup"}</button>}
        {optional ? <button className="text-button mfa-signout" onClick={onCancel} type="button">Not now</button> : <button className="text-button mfa-signout" onClick={() => void onSignOut()} type="button">Sign out</button>}
      </section>
    </main>
  );
}

function AccessMessage({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return <main className="mfa-page"><section className="mfa-card"><span className="mfa-shield"><ShieldCheck size={26} /></span><p className="eyebrow">ACCESS CONTROL</p><h1>Workspace access required</h1><p>{message}</p><button className="primary-button wide" type="button" onClick={onSignOut}>Sign out securely <LogOut size={16} /></button></section></main>;
}





