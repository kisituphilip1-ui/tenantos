import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Home,
  KeyRound,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";

type DemoRole = "owner" | "administrator" | "property_manager" | "employee" | "tenant";
type DemoPage =
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
type DemoRow = Record<string, string>;
type DemoRecords = Partial<Record<DemoPage, DemoRow[]>>;
type DemoDataPage = Exclude<DemoPage, "Overview" | "Security">;

const demoDataPages: DemoDataPage[] = [
  "Properties",
  "Tenancies",
  "Payments",
  "Maintenance",
  "Documents",
  "Notices",
  "Approvals",
  "Team",
  "Audit",
];
const demoStorageKey = "haven-demo-records-v1";

const roleLabels: Record<DemoRole, string> = {
  owner: "Owner",
  administrator: "Administrator",
  property_manager: "Property manager",
  employee: "Employee",
  tenant: "Tenant",
};

const navigation: { name: DemoPage; icon: typeof Home; group: "Workspace" | "Management" }[] = [
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

const pageSubtitles: Record<DemoPage, string> = {
  Overview: "A sample view of a Kampala rental portfolio.",
  Properties: "Fictional buildings and occupancy.",
  Tenancies: "Sample lease terms and unit assignments.",
  Payments: "Fictional rent activity; no payment is processed.",
  Maintenance: "Sample requests for property teams.",
  Documents: "Example records only; no files are stored or shared.",
  Notices: "Sample updates for residents and the team.",
  Approvals: "Example approval queue; decisions are not recorded.",
  Team: "Sample organization members and scopes.",
  Audit: "Example audit events; no real user activity is recorded.",
  Security: "Authentication and account security are not connected in demo mode.",
};

const columns: Partial<Record<DemoPage, [string, string][]>> = {
  Properties: [["property", "Property"], ["location", "Location"], ["units", "Units"], ["occupancy", "Occupancy"]],
  Tenancies: [["tenant", "Tenant"], ["unit", "Unit"], ["property", "Property"], ["lease", "Lease ends"], ["status", "Status"]],
  Payments: [["reference", "Reference"], ["unit", "Unit"], ["amount", "Amount"], ["method", "Method"], ["status", "Status"]],
  Maintenance: [["request", "Request"], ["location", "Location"], ["priority", "Priority"], ["status", "Status"], ["updated", "Updated"]],
  Documents: [["document", "Document"], ["related", "Related to"], ["type", "Type"], ["access", "Access"]],
  Notices: [["notice", "Notice"], ["audience", "Audience"], ["published", "Published"], ["status", "Status"]],
  Approvals: [["request", "Request"], ["requestedBy", "Requested by"], ["status", "Status"], ["created", "Created"]],
  Team: [["member", "Team member"], ["role", "Role"], ["scope", "Scope"], ["status", "Status"]],
  Audit: [["event", "Event"], ["actor", "Actor"], ["record", "Record"], ["time", "Time"]],
};

const records: DemoRecords = {
  Properties: [
    { property: "Bukoto Garden Homes", location: "Bukoto, Kampala", units: "12", occupancy: "10 occupied" },
    { property: "Naalya Heights", location: "Naalya, Wakiso", units: "8", occupancy: "7 occupied" },
    { property: "Ntinda Court", location: "Ntinda, Kampala", units: "6", occupancy: "5 occupied" },
  ],
  Tenancies: [
    { tenant: "Tenant A", unit: "A-04", property: "Bukoto Garden Homes", lease: "31 Mar 2027", status: "Active" },
    { tenant: "Tenant B", unit: "B-02", property: "Naalya Heights", lease: "30 Jun 2027", status: "Active" },
    { tenant: "Tenant C", unit: "C-01", property: "Ntinda Court", lease: "31 Jan 2027", status: "Renewal due" },
  ],
  Payments: [
    { reference: "PAY-DEMO-001", unit: "A-04", amount: "UGX 750,000", method: "Mobile money", status: "Received (demo)" },
    { reference: "PAY-DEMO-002", unit: "B-02", amount: "UGX 620,000", method: "Bank transfer", status: "Pending review" },
    { reference: "PAY-DEMO-003", unit: "C-01", amount: "UGX 540,000", method: "Mobile money", status: "Received (demo)" },
  ],
  Maintenance: [
    { request: "Kitchen tap leak", location: "Bukoto · A-04", priority: "Normal", status: "In progress", updated: "Today" },
    { request: "Hallway light replacement", location: "Naalya · B-02", priority: "Low", status: "Open", updated: "Yesterday" },
    { request: "Water pressure check", location: "Ntinda · C-01", priority: "High", status: "Assigned", updated: "12 Nov 2026" },
  ],
  Documents: [
    { document: "Lease agreement · A-04", related: "Tenant A", type: "PDF · 1.2 MB", access: "Private (demo)" },
    { document: "Move-in checklist · B-02", related: "Tenant B", type: "PDF · 640 KB", access: "Private (demo)" },
    { document: "Inspection report · C-01", related: "Ntinda Court", type: "PDF · 820 KB", access: "Private (demo)" },
  ],
  Notices: [
    { notice: "Water tank maintenance", audience: "Bukoto residents", published: "10 Nov 2026", status: "Published" },
    { notice: "December rent reminder", audience: "All tenants", published: "08 Nov 2026", status: "Published" },
    { notice: "Office hours update", audience: "All residents", published: "01 Nov 2026", status: "Published" },
  ],
  Approvals: [
    { request: "Invite property assistant", requestedBy: "Demo Owner", status: "Pending", created: "Today" },
    { request: "Repair expense · UGX 180,000", requestedBy: "Demo Manager", status: "Approved", created: "11 Nov 2026" },
    { request: "Export tenancy register", requestedBy: "Demo Admin", status: "Rejected", created: "09 Nov 2026" },
  ],
  Team: [
    { member: "Demo Owner", role: "Owner", scope: "All properties", status: "Active" },
    { member: "Demo Manager", role: "Property manager", scope: "Bukoto, Naalya", status: "Active" },
    { member: "Demo Employee", role: "Employee", scope: "Bukoto", status: "Active" },
  ],
  Audit: [
    { event: "Maintenance request updated", actor: "Demo Employee", record: "Request · 042", time: "Today, 09:14" },
    { event: "Approval resolved", actor: "Demo Owner", record: "Approval · 018", time: "11 Nov, 16:32" },
    { event: "Notice published", actor: "Demo Manager", record: "Notice · 007", time: "10 Nov, 10:05" },
  ],
};

function withDemoIds(source: DemoRecords): DemoRecords {
  const result: DemoRecords = {};
  for (const page of demoDataPages) {
    const rows = source[page];
    if (rows) {
      result[page] = rows.map((row, index) => ({
        ...row,
        id: row.id || `${page.toLowerCase()}-${index + 1}`,
      }));
    }
  }
  return result;
}

const initialDemoRecords = withDemoIds(records);

function isDemoRow(value: unknown): value is DemoRow {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === "string");
}

function isDemoRecords(value: unknown): value is DemoRecords {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([page, rows]) =>
    demoDataPages.some((knownPage) => knownPage === page)
    && Array.isArray(rows)
    && rows.every(isDemoRow)
  );
}

function recordLabel(row: DemoRow, page: DemoPage) {
  return row.property
    || row.request
    || row.document
    || row.notice
    || row.reference
    || row.member
    || row.tenant
    || row.event
    || `${page} sample`;
}

function createAuditRecord(action: string, page: DemoPage, label: string, role: DemoRole): DemoRow {
  return {
    id: crypto.randomUUID(),
    event: `${action} ${page.toLowerCase()} record`,
    actor: `Demo ${roleLabels[role]}`,
    record: label,
    time: new Intl.DateTimeFormat("en-UG", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Kampala",
    }).format(new Date()),
  };
}

const pageCanBeSeen = (page: DemoPage, role: DemoRole) => {
  if (page === "Audit") return role === "owner" || role === "administrator";
  if (page === "Approvals") return role !== "tenant" && role !== "employee";
  if (page === "Team") return role === "owner" || role === "administrator" || role === "property_manager";
  if (page === "Tenancies") return role !== "tenant";
  return true;
};

function canAddDemoRecord(page: DemoPage, role: DemoRole) {
  const isAdmin = role === "owner" || role === "administrator";
  if (page === "Maintenance" || page === "Payments") return true;
  if (page === "Properties" || page === "Tenancies" || page === "Notices") return isAdmin || role === "property_manager";
  if (page === "Documents") return isAdmin || role === "property_manager" || role === "tenant";
  if (page === "Approvals") return isAdmin || role === "property_manager";
  if (page === "Team") return isAdmin;
  return false;
}

function canEditDemoRecord(page: DemoPage, role: DemoRole) {
  const isAdmin = role === "owner" || role === "administrator";
  if (page === "Properties" || page === "Payments" || page === "Notices" || page === "Approvals" || page === "Team") {
    return isAdmin || role === "property_manager" && page !== "Team";
  }
  if (page === "Tenancies") return isAdmin || role === "property_manager";
  if (page === "Maintenance") return true;
  if (page === "Documents") return isAdmin || role === "property_manager" || role === "tenant";
  return false;
}

function canDeleteDemoRecord(page: DemoPage, role: DemoRole) {
  return (role === "owner" || role === "administrator")
    && page !== "Audit"
    && page !== "Security"
    && page !== "Overview";
}

function visibleRows(page: DemoPage, role: DemoRole, source: DemoRecords): DemoRow[] {
  let rows = source[page] ?? [];
  if (role === "tenant") {
    const tenantRecordIndex: Partial<Record<DemoPage, number>> = {
      Properties: 0,
      Tenancies: 0,
      Payments: 0,
      Maintenance: 0,
      Documents: 0,
      Notices: 1,
    };
    const index = tenantRecordIndex[page];
    const seededRow = index === undefined ? undefined : rows[index];
    rows = [
      ...(seededRow ? [seededRow] : []),
      ...rows.filter((row) => row.createdByRole === "tenant"),
    ];
  }
  if (role === "employee" && page === "Payments") {
    return rows
      .filter((row) => row.unit === "A-04" || row.reference === "PAY-DEMO-001")
      .map(({ amount: _amount, ...row }) => row);
  }
  if (role === "employee" || role === "property_manager") {
    const allowedProperties = role === "employee"
      ? ["Bukoto Garden Homes"]
      : ["Bukoto Garden Homes", "Naalya Heights"];
    const allowedUnits = role === "employee" ? ["A-04"] : ["A-04", "B-02"];
    if (page === "Properties") return rows.filter((row) => allowedProperties.includes(row.property));
    if (page === "Tenancies") return rows.filter((row) => allowedUnits.includes(row.unit));
    if (page === "Payments") return rows.filter((row) => allowedUnits.includes(row.unit));
    if (page === "Maintenance") return rows.filter((row) => allowedUnits.some((unit) => row.location.includes(unit)) || role === "property_manager" && row.location.startsWith("Bukoto"));
    if (page === "Documents") {
      const visibleTenants = role === "employee" ? ["Tenant A"] : ["Tenant A", "Tenant B"];
      return rows.filter((row) => visibleTenants.includes(row.related));
    }
  }
  return rows;
}

function formatUGX(value: number) {
  return `UGX ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(value)}`;
}

export function DemoWorkspace({ onExit }: { onExit: () => void }) {
  const [role, setRole] = useState<DemoRole>("owner");
  const [page, setPage] = useState<DemoPage>("Overview");
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [demoRecords, setDemoRecords] = useState<DemoRecords>(initialDemoRecords);
  const [storageMessage, setStorageMessage] = useState("");
  const [interactionMessage, setInteractionMessage] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(demoStorageKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isDemoRecords(parsed)) {
          setDemoRecords(withDemoIds(parsed));
        } else {
          setStorageMessage("Saved demo data could not be read. The sample records have been restored.");
        }
      }
    } catch {
      setStorageMessage("Browser storage is unavailable. Demo changes may not persist after you leave.");
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(demoStorageKey, JSON.stringify(demoRecords));
    } catch {
      setStorageMessage("Demo changes could not be saved in this browser; they remain available for this session.");
    }
  }, [demoRecords, storageReady]);

  const visibleNavigation = useMemo(() => navigation.filter((item) => pageCanBeSeen(item.name, role)), [role]);
  const rows = visibleRows(page, role, demoRecords);
  const filteredRows = rows.filter((row) => Object.entries(row).some(([key, value]) =>
    key !== "id"
    && key !== "createdByRole"
    && value.toLowerCase().includes(search.toLowerCase())
  ));

  function changeRole(nextRole: DemoRole) {
    setRole(nextRole);
    if (!pageCanBeSeen(page, nextRole)) setPage("Overview");
  }

  function saveRecord(recordPage: DemoDataPage, draft: DemoRow, editingId?: string) {
    if (recordPage === "Audit") return;
    const id = editingId ?? crypto.randomUUID();
    const label = recordLabel(draft, recordPage);
    const auditRecord = createAuditRecord(editingId ? "Updated" : "Added", recordPage, label, role);
    setDemoRecords((current) => {
      const pageRecords = current[recordPage] ?? [];
      const existing = editingId ? pageRecords.find((row) => row.id === editingId) : undefined;
      const savedRecord: DemoRow = {
        ...(existing ?? {}),
        ...draft,
        id,
        createdByRole: existing?.createdByRole ?? role,
      };
      if (!editingId && recordPage === "Payments" && !savedRecord.status) savedRecord.status = "Pending review";
      if (recordPage === "Maintenance" && !savedRecord.status) savedRecord.status = "Open";
      if (recordPage === "Approvals" && !savedRecord.status) savedRecord.status = "Pending";
      if (recordPage === "Documents" && !savedRecord.access) savedRecord.access = "Private (demo)";
      const nextPageRecords = editingId
        ? pageRecords.map((row) => row.id === editingId ? savedRecord : row)
        : [savedRecord, ...pageRecords];
      return {
        ...current,
        [recordPage]: nextPageRecords,
        Audit: [auditRecord, ...(current.Audit ?? [])].slice(0, 25),
      };
    });
    setInteractionMessage("Demo change saved in this browser only.");
  }

  function deleteRecord(recordPage: DemoDataPage, row: DemoRow) {
    if (!canDeleteDemoRecord(recordPage, role) || recordPage === "Audit") return;
    const label = recordLabel(row, recordPage);
    if (!window.confirm(`Remove "${label}" from this browser's demo data?`)) return;
    const auditRecord = createAuditRecord("Deleted", recordPage, label, role);
    setDemoRecords((current) => ({
      ...current,
      [recordPage]: (current[recordPage] ?? []).filter((item) => item.id !== row.id),
      Audit: [auditRecord, ...(current.Audit ?? [])].slice(0, 25),
    }));
    setInteractionMessage("Demo record removed from this browser only.");
  }

  function resetDemoData() {
    if (!window.confirm("Restore the original fictional demo records in this browser?")) return;
    setDemoRecords(initialDemoRecords);
    setInteractionMessage("Original demo records restored.");
  }

  return (
    <div className="app-shell demo-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">H</span>
          <span className="brand-name">haven<span className="brand-period">.</span></span>
          <span className="country-pill">UG</span>
        </div>
        <div className="org-switcher-wrap">
          <div className="org-switcher">
            <span className="org-avatar">K</span>
            <span className="org-switcher-text"><strong>Kampala Central Estates</strong><small>{roleLabels[role]} · demo</small></span>
            <ChevronDown size={16} />
          </div>
        </div>
        <nav className="side-nav" aria-label="Demo navigation">
          <span className="nav-group-label">WORKSPACE</span>
          {visibleNavigation.filter((item) => item.group === "Workspace").map((item) => (
            <DemoNavItem key={item.name} item={item} active={page === item.name} onClick={() => { setPage(item.name); setMobileNavOpen(false); }} />
          ))}
          <span className="nav-group-label management-label">MANAGEMENT</span>
          {visibleNavigation.filter((item) => item.group === "Management").map((item) => (
            <DemoNavItem key={item.name} item={item} active={page === item.name} onClick={() => { setPage(item.name); setMobileNavOpen(false); }} />
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="support-card"><span className="support-icon"><CircleHelp size={17} /></span><span><strong>Demo workspace</strong><small>Fictional sample records</small></span><CheckCircle2 size={14} /></div>
          <div className="profile-button demo-profile">
            <span className="profile-avatar">D</span>
            <span className="profile-meta"><strong>Demo User</strong><small>No account connected</small></span>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu-button" type="button" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumbs"><span>Demo</span><span className="crumb-slash">/</span><strong>{page}</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={16} />
              <input aria-label="Search demo records" placeholder="Search..." value={search} onChange={(event) => setSearch(event.target.value)} />
              <kbd>⌘ K</kbd>
            </label>
            <span className="topbar-divider" />
            <span className="demo-mode-label">Interactive demo</span>
          </div>
        </header>

        <main className="main-content">
          <div className="demo-banner" role="note">
            <div className="demo-banner-copy"><span className="demo-badge">DEMO</span><span>Fictional sample data only. Changes stay in this browser; no live data, uploads, or payments are connected.</span></div>
            <label className="demo-role-select"><span>Preview role</span>
              <select aria-label="Choose a role to preview" value={role} onChange={(event) => changeRole(event.target.value as DemoRole)}>
                {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <button className="demo-exit-button" onClick={resetDemoData} type="button">Reset demo data</button>
            <button className="demo-exit-button" onClick={onExit} type="button">Exit demo</button>
          </div>
          {storageMessage && <p className="demo-storage-message" role="status">{storageMessage}</p>}
          {interactionMessage && <p className="demo-storage-message" role="status">{interactionMessage}</p>}

          <div className="page-heading">
            <div><p className="eyebrow">KAMPALA CENTRAL ESTATES · SAMPLE</p><h1>{page}</h1><p className="page-subtitle">{pageSubtitles[page]}</p></div>
            <div className="page-heading-actions">
              <span className="date-chip"><CalendarDays size={15} />13 Nov 2026</span>
            </div>
          </div>

          {page === "Overview" && <DemoOverview role={role} onNavigate={setPage} demoRecords={demoRecords} />}
          {page === "Security" && <DemoSecurity />}
          {page !== "Overview" && page !== "Security" && (
            <DemoDataPage
              page={page}
              role={role}
              rows={filteredRows}
              search={search}
              onSave={saveRecord}
              onDelete={deleteRecord}
            />
          )}

          <footer className="app-footer"><span>Haven for Uganda</span><span>Demo only · no real account or data</span><span>All sample amounts in UGX</span></footer>
        </main>
      </div>
    </div>
  );
}

function DemoNavItem({ item, active, onClick }: { item: (typeof navigation)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={onClick} type="button" aria-current={active ? "page" : undefined}><Icon size={18} strokeWidth={active ? 2 : 1.8} /><span>{item.name}</span></button>;
}

function DemoOverview({ role, onNavigate, demoRecords }: {
  role: DemoRole;
  onNavigate: (page: DemoPage) => void;
  demoRecords: DemoRecords;
}) {
  const metrics = role === "tenant"
    ? [
        { label: "My unit", value: "A-04", detail: "Bukoto Garden Homes", icon: KeyRound },
        { label: "Rent due", value: formatUGX(750000), detail: "Due 05 Dec · demo", icon: Wallet },
        { label: "Lease status", value: "Active", detail: "Ends 31 Mar 2027", icon: FileText },
        { label: "Open request", value: "1", detail: "Kitchen tap leak", icon: Wrench },
      ]
    : role === "employee"
      ? [
          { label: "Assigned properties", value: "1", detail: "Bukoto Garden Homes", icon: Building2 },
          { label: "Open work orders", value: "2", detail: "1 high priority", icon: Wrench },
          { label: "Requests today", value: "1", detail: "Needs triage", icon: ClipboardCheck },
          { label: "Due today", value: "1", detail: "Inspection follow-up", icon: CalendarDays },
        ]
      : role === "property_manager"
        ? [
            { label: "Assigned properties", value: "2", detail: "Bukoto and Naalya", icon: Building2 },
            { label: "Active tenancies", value: "17", detail: "Across assigned sites", icon: KeyRound },
            { label: "Open maintenance", value: "3", detail: "1 high priority", icon: Wrench },
            { label: "Pending approvals", value: "1", detail: "Awaiting second review", icon: ClipboardCheck },
          ]
        : [
            { label: "Properties", value: "3", detail: "26 total units", icon: Building2 },
            { label: "Active tenancies", value: "22", detail: "85% occupancy", icon: KeyRound },
            { label: "Rent to review", value: "4", detail: "Sample pending items", icon: Wallet },
            { label: "Open maintenance", value: "3", detail: "1 high priority", icon: Wrench },
          ];
  const paymentRows = visibleRows("Payments", role, demoRecords);
  const paymentColumns: [string, string][] = role === "employee"
    ? [["reference", "Reference"], ["unit", "Unit"], ["method", "Method"], ["status", "Status"]]
    : [["reference", "Reference"], ["unit", "Unit"], ["amount", "Amount"], ["status", "Status"]];
  const requestRows = visibleRows("Maintenance", role, demoRecords);
  return (
    <>
      <section className="welcome-strip demo-welcome">
        <div><span className="welcome-spark"><Home size={17} /></span><span><h2>{role === "tenant" ? "Welcome to your resident view" : "Good morning, Demo User"}</h2><p>{role === "tenant" ? "Your tenancy and service details, in one place." : "A quick look at the sample portfolio and what needs attention."}</p></span></div>
        <div className="demo-welcome-art" aria-hidden="true"><Building2 size={57} strokeWidth={1} /><Building2 size={78} strokeWidth={1} /></div>
      </section>
      <div className="stats-grid demo-stats">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return <article className={`stat-card ${index === 2 ? "stat-amber" : ""}`} key={metric.label}>
            <div className="stat-top"><span className="stat-icon"><Icon size={17} /></span><span className="demo-sample-dot">SAMPLE</span></div>
            <p className="stat-label">{metric.label}</p><strong className="stat-value demo-stat-value">{metric.value}</strong>
            <div className="stat-bottom"><span>{metric.detail}</span></div>
          </article>;
        })}
      </div>
      <div className="dashboard-grid">
        <DemoTableCard title={role === "tenant" ? "My rent activity" : "Recent rent activity"} eyebrow="PAYMENTS · SAMPLE" rows={paymentRows} columns={paymentColumns} onViewAll={() => onNavigate("Payments")} />
        <DemoTableCard title={role === "tenant" ? "My maintenance" : "Maintenance queue"} eyebrow="SERVICE · SAMPLE" rows={requestRows} columns={[["request", "Request"], ["status", "Status"]]} onViewAll={() => onNavigate("Maintenance")} />
      </div>
      <div className="demo-note"><ShieldCheck size={16} /><span>Every figure and record is fictional. You can try changes here; they are saved only in this browser and never reach a live account.</span></div>
    </>
  );
}

function DemoTableCard({ title, eyebrow, rows, columns, onViewAll }: { title: string; eyebrow: string; rows: DemoRow[]; columns: [string, string][]; onViewAll: () => void }) {
  return <section className="surface-card payments-card">
    <div className="card-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div><button className="subtle-link" onClick={onViewAll} type="button">View all <ArrowUpRight size={14} /></button></div>
    <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>
      {rows.map((row, index) => <tr key={row.id ?? `${row.reference ?? row.request}-${index}`}>{columns.map(([key]) => <td key={key}>{row[key] ?? "—"}</td>)}</tr>)}
    </tbody></table></div>
  </section>;
}

function DemoDataPage({ page, role, rows, search, onSave, onDelete }: {
  page: DemoDataPage;
  role: DemoRole;
  rows: DemoRow[];
  search: string;
  onSave: (page: DemoDataPage, row: DemoRow, editingId?: string) => void;
  onDelete: (page: DemoDataPage, row: DemoRow) => void;
}) {
  const pageColumns = columns[page] ?? [];
  const visibleColumns = role === "employee" && page === "Payments" ? pageColumns.filter(([key]) => key !== "amount") : pageColumns;
  const canAdd = canAddDemoRecord(page, role);
  const canEdit = canEditDemoRecord(page, role);
  const canDelete = canDeleteDemoRecord(page, role);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [draft, setDraft] = useState<DemoRow>({});
  const [formError, setFormError] = useState("");

  function startAdd() {
    const blankDraft: DemoRow = {};
    for (const [key] of visibleColumns) blankDraft[key] = "";
    setDraft(blankDraft);
    setEditingId(undefined);
    setFormError("");
    setFormOpen(true);
  }

  function startEdit(row: DemoRow) {
    const editDraft: DemoRow = {};
    for (const [key] of visibleColumns) editDraft[key] = row[key] ?? "";
    setDraft(editDraft);
    setEditingId(row.id);
    setFormError("");
    setFormOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const savedDraft: DemoRow = {};
    for (const [key] of visibleColumns) savedDraft[key] = (draft[key] ?? "").trim();
    const requiredField = visibleColumns[0]?.[0];
    if (!requiredField || !savedDraft[requiredField]) {
      setFormError(`Enter a value for ${visibleColumns[0]?.[1] ?? "the first field"}.`);
      return;
    }
    onSave(page, savedDraft, editingId);
    setFormOpen(false);
    setFormError("");
  }

  const footnote = page === "Payments"
    ? "Payment entries and statuses are simulated; no money moves."
    : page === "Documents"
      ? "Document entries are sample metadata only; no files are uploaded."
      : page === "Team"
        ? "Team changes stay in this browser; no invitations are sent."
        : page === "Audit"
          ? "This log contains only actions performed in the local demo."
          : "Changes are stored only in this browser. Reset demo data any time.";

  return <section className="surface-card demo-records-card">
    <div className="card-heading">
      <div><p className="eyebrow">SAMPLE RECORDS</p><h2>{page} · interactive demo</h2></div>
      <div className="demo-record-toolbar">
        <span className="demo-record-count">{rows.length} {rows.length === 1 ? "record" : "records"}</span>
        {canAdd && <button className="primary-button compact" onClick={startAdd} type="button"><Plus size={15} />Add sample</button>}
      </div>
    </div>
    {formOpen && <form className="demo-record-form" onSubmit={submit}>
      <div className="demo-record-form-grid">
        {visibleColumns.map(([key, label], index) => (
          <label className="field-label" key={key}>{label}
            <input
              maxLength={180}
              required={index === 0}
              value={draft[key] ?? ""}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      <div className="demo-form-actions">
        <button className="primary-button compact" type="submit">{editingId ? "Save changes" : "Add demo record"}</button>
        <button className="secondary-button" onClick={() => setFormOpen(false)} type="button"><X size={14} />Cancel</button>
      </div>
    </form>}
    <div className="table-scroll"><table className="data-table"><thead><tr>
      {visibleColumns.map(([key, label]) => <th key={key}>{label}</th>)}
      {(canEdit || canDelete) && <th>Actions</th>}
    </tr></thead><tbody>
      {rows.map((row, index) => <tr key={row.id ?? `${page}-${index}`}>
        {visibleColumns.map(([key]) => <td key={key}>{row[key] || "—"}</td>)}
        {(canEdit || canDelete) && <td className="demo-row-actions">
          {canEdit && <button className="demo-action-button" onClick={() => startEdit(row)} type="button" aria-label={`Edit ${recordLabel(row, page)}`}><Pencil size={13} />Edit</button>}
          {canDelete && <button className="demo-action-button is-danger" onClick={() => onDelete(page, row)} type="button" aria-label={`Delete ${recordLabel(row, page)}`}><Trash2 size={13} />Delete</button>}
        </td>}
      </tr>)}
      {!rows.length && <tr><td className="empty-cell" colSpan={Math.max(1, visibleColumns.length + Number(canEdit || canDelete))}>{search ? "No sample records match this search." : "No sample records are available for this role."}</td></tr>}
    </tbody></table></div>
    <div className="demo-table-footnote"><ShieldCheck size={15} />{footnote}</div>
  </section>;
}

function DemoSecurity() {
  return <section className="surface-card demo-security-card">
    <div className="card-heading"><div><p className="eyebrow">ACCOUNT SECURITY</p><h2>Preview only</h2></div><ShieldCheck size={19} /></div>
    <div className="demo-security-message"><span className="demo-security-icon"><ShieldCheck size={20} /></span><div><strong>No account is signed in</strong><p>Multi-factor authentication, phone verification, sessions, and password recovery require a connected Supabase project. This demo does not collect credentials.</p></div></div>
  </section>;
}
