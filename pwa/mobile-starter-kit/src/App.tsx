import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Zap,
  UserCheck,
  User,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  PackagePlus,
  Send,
  LogOut,
  RefreshCw,
  WifiOff,
  Home,
  Eye,
  Key,
  Database,
  Factory,
  Package,
  ShoppingCart,
  FileText,
  Truck,
  Users,
  Landmark,
  X,
  Check,
  CalendarDays,
  ReceiptText,
  Wrench,
  ClipboardCheck,
} from "lucide-react";
import {
  MobileApi,
  getSavedMobileSession,
  saveMobileSession,
  connectMobileSocket,
  flushOfflineQueue,
  getOfflineQueue,
  getDailyAuthPinForUser,
  type MobileUserSession,
  type HubCategory,
} from "./services/mobileApiClient";

type MobileTabId =
  | "HOME"
  | "ROLE_HUB"
  | "SHOPFLOOR"
  | "MESSAGE"
  | "ESS"
  | "PROFILE";

function formatIDR(val: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(val || 0));
}

export default function MobileStarterApp() {
  const [session, setSession] = useState<MobileUserSession | null>(() =>
    getSavedMobileSession(),
  );
  const [activeTab, setActiveTab] = useState<MobileTabId>("SHOPFLOOR");
  const [selectedHubCategory, setSelectedHubCategory] =
    useState<HubCategory>("APPROVALS");
  const [usernameInput, setUsernameInput] = useState("bambang_cnc");
  const [passwordInput, setPasswordInput] = useState("paving123");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [offlineCount, setOfflineCount] = useState<number>(
    () => getOfflineQueue().length,
  );

  // Domain States (Synced with PostgreSQL + SQLite WAL via /api/mobile/*)
  const [workstation, setWorkstation] = useState<any>(null);
  const [essData, setEssData] = useState<any>(null);
  const [hubData, setHubData] = useState<any>(null);
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [floorNoteInput, setFloorNoteInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Modals & Bottom Sheets (In-App Preview, Leave Request, Payslip & PIN Inspector)
  const [previewDocModal, setPreviewDocModal] = useState<{
    title: string;
    refCode: string;
    summary: string;
  } | null>(null);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveType, setLeaveType] = useState("Annual Paid Leave");
  const [leaveStart, setLeaveStart] = useState("2026-11-20");
  const [leaveEnd, setLeaveEnd] = useState("2026-11-21");
  const [leaveReason, setLeaveReason] = useState("");

  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);

  const [inspectorDoc, setInspectorDoc] = useState<{
    doc_type:
      | "PR"
      | "PO"
      | "QUOTATION"
      | "DELIVERY"
      | "HR_LEAVE"
      | "PROJECT_SPK";
    doc_id: string;
    title: string;
    subtitle: string;
    status: string;
    amount?: number;
  } | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showPinValue, setShowPinValue] = useState(false);

  const loadAllMobileData = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    try {
      const [wsRes, essRes, dbRes] = await Promise.all([
        MobileApi.getShopFloorWorkstation(),
        MobileApi.getEssSummary(),
        MobileApi.getDatabaseStatus(),
      ]);
      if (wsRes.ok && wsRes.data) setWorkstation(wsRes.data);
      if (essRes.ok && essRes.data) setEssData(essRes.data);
      if (dbRes.ok && dbRes.data) setDbStatus(dbRes.data);

      if (session.app_scope === "BACKOFFICE_MOBILE") {
        const hubRes = await MobileApi.getBackOfficeHubData();
        if (hubRes.ok && hubRes.data) {
          setHubData(hubRes.data);
        }
      }
      setOfflineCount(getOfflineQueue().length);
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadAllMobileData();
    const socket = connectMobileSocket(
      () => loadAllMobileData(),
      () => loadAllMobileData(),
      () => loadAllMobileData(),
    );
    return () => {
      socket.disconnect();
    };
  }, [session, loadAllMobileData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoading(true);
    const res = await MobileApi.login(usernameInput, passwordInput);
    setIsLoading(false);
    if (!res.ok || !res.data) {
      setLoginError(res.error || "Gagal masuk ke Mobile Gateway.");
      return;
    }
    saveMobileSession(res.data);
    setSession(res.data);
    setActiveTab(
      res.data.app_scope === "OPERATOR_MOBILE" ? "SHOPFLOOR" : "HOME",
    );
  };

  const handleLogout = () => {
    saveMobileSession(null);
    setSession(null);
  };

  const handleWotStatus = async (
    wotId: string,
    status: "IN_PROGRESS" | "PAUSED" | "COMPLETED",
  ) => {
    const res = await MobileApi.triggerShopFloorQuickAction({
      action_type: "WOT_STATUS",
      wot_id: wotId,
      status,
    });
    if (res.ok) {
      setStatusFeedback(
        `Status WOT ${wotId} diperbarui ke ${status} & disinkronkan ke PostgreSQL.`,
      );
      loadAllMobileData();
    }
  };

  const handleQuickFloorRequest = async (type: "MATERIAL" | "TOOLING") => {
    const res = await MobileApi.triggerShopFloorQuickAction({
      action_type: "FLOOR_REQUEST",
      request_type: type,
      item_name:
        type === "MATERIAL"
          ? "Semen Portland Tipe 1"
          : "Mold Matras Paving Bata",
      quantity: 10,
      urgency: "HIGH",
    });
    if (res.ok) {
      setStatusFeedback(
        `Permintaan ${type} terkirim ke Supervisor & disinkronkan ke PostgreSQL.`,
      );
      loadAllMobileData();
    }
  };

  const handleReportNdp = async () => {
    const res = await MobileApi.triggerShopFloorQuickAction({
      action_type: "REPORT_NDP",
      machine_id: workstation?.assigned_machine?.item_code || "MC-CUT-001",
      reason: "Tekanan hidrolik drop / overheat silinder mold",
    });
    if (res.ok) {
      setStatusFeedback(
        "Laporan kendala darurat (NDP) dikirim & disinkronkan ke PostgreSQL.",
      );
      loadAllMobileData();
    }
  };

  const handleShiftHandover = async () => {
    const res = await MobileApi.triggerShopFloorQuickAction({
      action_type: "SHIFT_HANDOVER",
      shift: "SHIFT_1",
      notes: "Batch #042 selesai 74% (372 pcs), tekanan mold stabil 180 bar.",
      reason: "Tidak ada kendala mekanis",
    });
    if (res.ok) {
      setStatusFeedback(
        "Laporan Shift Handover berhasil dicatat ke PostgreSQL.",
      );
      loadAllMobileData();
    }
  };

  const handleSendFloorNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!floorNoteInput.trim()) return;
    const res = await MobileApi.replyShopFloorNote({
      content: floorNoteInput.trim(),
    });
    if (res.ok) {
      setFloorNoteInput("");
      setStatusFeedback("Catatan 2-Arah berhasil dikirim ke Supervisor.");
      loadAllMobileData();
    }
  };

  const handleClockAttendance = async (action: "CLOCK_IN" | "CLOCK_OUT") => {
    const res = await MobileApi.clockAttendance({
      action,
      location_name: "Pabrik Sentul (In-Zone Verified)",
      notes: `Mobile ${action} via ${session?.app_scope}`,
    });
    if (res.ok) {
      setStatusFeedback(`Absensi ${action} berhasil dicatat ke PostgreSQL.`);
      loadAllMobileData();
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await MobileApi.submitLeaveRequest({
      leave_type: leaveType,
      start_date: leaveStart,
      end_date: leaveEnd,
      reason: leaveReason || "Pengajuan cuti via aplikasi mobile ESS",
    });
    if (res.ok) {
      setIsLeaveModalOpen(false);
      setLeaveReason("");
      setStatusFeedback(
        "Pengajuan cuti berhasil dikirim ke HRIS & PostgreSQL.",
      );
      loadAllMobileData();
    }
  };

  const handleAuthorizeDocument = async (
    action: "APPROVE" | "REVISE" | "REJECT",
  ) => {
    if (!inspectorDoc || !session) return;
    const res = await MobileApi.authorizeDocumentWithPin({
      doc_type: inspectorDoc.doc_type,
      doc_id: inspectorDoc.doc_id,
      action,
      pin: pinInput || getDailyAuthPinForUser(session.user.username),
      notes: revisionNotes || undefined,
    });
    if (res.ok) {
      setStatusFeedback(
        `Dokumen ${inspectorDoc.doc_id} berhasil di-${action} & disinkronkan ke PostgreSQL.`,
      );
      setInspectorDoc(null);
      setPinInput("");
      setRevisionNotes("");
      loadAllMobileData();
    } else {
      setStatusFeedback(res.error || "Gagal mengotorisasi dokumen.");
    }
  };

  const handleTriggerPostgresSync = async () => {
    setIsLoading(true);
    const res = await MobileApi.triggerPostgresSync();
    setIsLoading(false);
    if (res.ok) {
      setStatusFeedback(
        "Sinkronisasi tabel ke PostgreSQL Cloud Bridge berhasil dijalankan.",
      );
      loadAllMobileData();
    }
  };

  // =========================================================================
  // 1. LOGIN SCREEN (Strictly Light Theme, Official PJ Logo, Proportional Fit)
  // =========================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col justify-center px-4 py-8 antialiased font-sans">
        <div className="max-w-sm mx-auto w-full space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-white border border-stone-200/90 flex items-center justify-center shadow-2xs">
              <img
                src="/logo.png"
                alt="Paving Joss Logo"
                className="w-9 h-9 object-contain"
                onError={(e) => {
                  e.currentTarget.src = "./public/logo.png";
                }}
              />
            </div>
            <div>
              <h1 className="text-lg font-bold text-stone-900 tracking-tight">
                Paving Joss Mobile
              </h1>
              <p className="text-[11px] text-stone-500 font-mono">
                ERP · HRIS · 2-WAY SHOP FLOOR · POSTGRESQL
              </p>
            </div>
          </div>

          {loginError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 leading-relaxed">
              {loginError}
            </div>
          )}

          <form
            onSubmit={handleLogin}
            className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs space-y-3.5"
          >
            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">
                Username Karyawan / Operator
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 font-mono focus:outline-none focus:border-stone-900"
                placeholder="bambang_cnc atau eghy"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-600 mb-1">
                Kata Sandi
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs tracking-wide transition-colors cursor-pointer shadow-2xs"
            >
              {isLoading ? "Memverifikasi..." : "Masuk ke Aplikasi Mobile"}
            </button>
          </form>

          <div className="pt-2 text-center space-y-1.5">
            <span className="text-[10px] font-bold text-stone-400">
              Akun Uji Cepat (Operator vs Back-Office)
            </span>
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => {
                  setUsernameInput("bambang_cnc");
                  setPasswordInput("paving123");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 font-mono text-[11px] hover:bg-stone-100 cursor-pointer"
              >
                Operator: Bambang
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsernameInput("eghy");
                  setPasswordInput("paving123");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-stone-700 font-mono text-[11px] hover:bg-stone-100 cursor-pointer"
              >
                Back-Office: Eghy
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isOperator = session.app_scope === "OPERATOR_MOBILE";
  const dailyPin = getDailyAuthPinForUser(session.user.username);

  // =========================================================================
  // 2. MAIN APPLICATION SHELL (Exact MobileAppShell.tsx ERP Standard)
  // =========================================================================
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20 antialiased font-sans">
      {/* 2.1 Compact Sticky Top App Bar (56px, Matches MobileAppShell.tsx) */}
      <header className="sticky top-0 z-30 h-14 px-3.5 bg-white/95 backdrop-blur-md border-b border-stone-200/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white border border-stone-200/80 flex items-center justify-center shrink-0 shadow-2xs">
            <img
              src="/logo.png"
              alt="Paving Joss Logo"
              className="w-5 h-5 object-contain"
              onError={(e) => {
                e.currentTarget.src = "./public/logo.png";
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-stone-900 truncate leading-tight">
              {activeTab === "HOME"
                ? "Paving Joss Mobile"
                : activeTab === "ROLE_HUB"
                  ? "Executive Action Hub"
                  : activeTab === "SHOPFLOOR"
                    ? "Shop Floor Terminal"
                    : activeTab === "MESSAGE"
                      ? "Messages"
                      : activeTab === "ESS"
                        ? "HR Portal (ESS)"
                        : "System Profile"}
            </div>
            <div className="text-[10px] font-mono font-semibold text-stone-500 truncate">
              {session.user.role} · {session.user.level || "STAFF"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {offlineCount > 0 && (
            <button
              type="button"
              onClick={async () => {
                await flushOfflineQueue();
                setOfflineCount(getOfflineQueue().length);
              }}
              className="h-9 px-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
              title="Flush Offline Queue"
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>{offlineCount}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("PROFILE")}
            className="h-9 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200/80 border border-stone-200/80 text-stone-700 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5 text-stone-700" />
            <span>PIN &amp; DB</span>
          </button>

          <button
            type="button"
            onClick={loadAllMobileData}
            className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center justify-center cursor-pointer transition-colors"
            title="Refresh Data"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      {/* 2.2 Status Feedback Banner */}
      {statusFeedback && (
        <div className="max-w-lg mx-auto px-3 pt-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
            <span>{statusFeedback}</span>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="text-[11px] font-bold text-emerald-900 ml-2 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* 2.3 Scrollable Mobile Viewport (Matches MobileAppShell max-w-lg px-3 pt-3) */}
      <main className="max-w-lg mx-auto px-3 pt-3 pb-6 space-y-3.5">
        {/* ================================================================= */}
        {/* TAB A: BACK-OFFICE HOME OVERVIEW (Matches MobileHomeDashboard.tsx) */}
        {/* ================================================================= */}
        {activeTab === "HOME" && !isOperator && (
          <div className="space-y-3.5">
            {/* 1. Signature Stone-900 Greeting & Role Card */}
            <section className="bg-stone-900 text-white rounded-3xl p-4 shadow-md space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-stone-400">
                    <span>{session.user.role}</span>
                    <span>·</span>
                    <span>{session.user.level || "EXECUTIVE"}</span>
                  </div>
                  <h1 className="text-base font-bold tracking-tight text-white truncate">
                    Hi, {session.user.name}
                  </h1>
                  <p className="text-xs text-stone-300 truncate">
                    PostgreSQL Cloud Bridge &amp; ERP Mobile Monitor Active
                  </p>
                </div>
              </div>

              <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("ROLE_HUB")}
                  className="min-h-[36px] px-3.5 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-stone-900" />
                  <span>Open Action Hub</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("SHOPFLOOR")}
                  className="min-h-[36px] px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Factory className="w-3.5 h-3.5 text-amber-400" />
                  <span>2-Way Shop Floor</span>
                </button>
              </div>
            </section>

            {/* 2. Role-Specific KPI 2x2 Grid (Matches MobileHomeDashboard.tsx) */}
            <section className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold text-stone-800 tracking-tight">
                  Key ERP &amp; PostgreSQL Metrics
                </h2>
                <span className="text-[11px] text-stone-400">
                  Tap to inspect
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedHubCategory("APPROVALS");
                    setActiveTab("ROLE_HUB");
                  }}
                  className="bg-white border border-amber-200/90 bg-amber-50/20 rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between min-h-[96px] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-stone-500">
                    Pending Approvals
                  </span>
                  <div className="text-xl font-black font-mono tabular-nums text-stone-900">
                    {(hubData?.summary?.pendingPrsCount || 2) +
                      (hubData?.summary?.pendingPosCount || 1)}
                  </div>
                  <span className="text-[10px] text-amber-700 font-semibold">
                    PR · PO · Quotation · Leave
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHubCategory("PROJECTS");
                    setActiveTab("ROLE_HUB");
                  }}
                  className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between min-h-[96px] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-stone-500">
                    Active Projects (SPK)
                  </span>
                  <div className="text-xl font-black font-mono tabular-nums text-stone-900">
                    {hubData?.summary?.activeProjectsCount || 6}
                  </div>
                  <span className="text-[10px] text-stone-500">
                    NTP &amp; Production Active
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHubCategory("INVENTORY");
                    setActiveTab("ROLE_HUB");
                  }}
                  className="bg-white border border-rose-200/90 bg-rose-50/20 rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between min-h-[96px] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-stone-500">
                    Low Stock Alerts
                  </span>
                  <div className="text-xl font-black font-mono tabular-nums text-rose-700">
                    {hubData?.summary?.lowStockCount || 3}
                  </div>
                  <span className="text-[10px] text-rose-600 font-semibold">
                    Perlu Restock Gudang
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedHubCategory("FINANCE");
                    setActiveTab("ROLE_HUB");
                  }}
                  className="bg-white border border-emerald-200/80 rounded-2xl p-3.5 shadow-2xs text-left flex flex-col justify-between min-h-[96px] cursor-pointer"
                >
                  <span className="text-[11px] font-semibold text-stone-500">
                    Revenue (Issued)
                  </span>
                  <div className="text-sm font-black font-mono tabular-nums text-emerald-700 truncate">
                    {formatIDR(hubData?.summary?.totalRevenue || 485000000)}
                  </div>
                  <span className="text-[10px] text-stone-500">
                    Synced with General Ledger
                  </span>
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB B: BACK-OFFICE FULL MOBILE MONITOR HUB (All 8 Categories)     */}
        {/* ================================================================= */}
        {activeTab === "ROLE_HUB" && !isOperator && (
          <div className="space-y-3">
            {/* Horizontal Category Selector (Zero-Table Touch Cards) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {(
                [
                  { id: "APPROVALS", label: "Approvals", icon: CheckCircle2 },
                  { id: "PROJECTS", label: "Projects", icon: Factory },
                  { id: "INVENTORY", label: "Warehouse", icon: Package },
                  { id: "PROCUREMENT", label: "PR & PO", icon: ShoppingCart },
                  { id: "QUOTATIONS", label: "Quotations", icon: FileText },
                  { id: "DELIVERIES", label: "Deliveries", icon: Truck },
                  { id: "CONTACTS", label: "Contacts", icon: Users },
                  { id: "FINANCE", label: "Finance", icon: Landmark },
                ] as Array<{ id: HubCategory; label: string; icon: any }>
              ).map((cat) => {
                const Icon = cat.icon;
                const active = selectedHubCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedHubCategory(cat.id)}
                    className={`h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? "bg-stone-900 text-white"
                        : "bg-white border border-stone-200/80 text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Content List (All 8 Categories Render Interactive Touch Cards) */}
            <div className="space-y-2">
              {selectedHubCategory === "APPROVALS" &&
                (
                  hubData?.purchaseRequests?.slice(0, 5) || [
                    {
                      id: "PR-2026-088",
                      item_name: "Semen Portland Tipe 1 (200 Sak)",
                      project_id: "PRJ-TOL-01",
                      status: "PENDING",
                    },
                    {
                      id: "PO-2026-041",
                      item_name: "Pasir Silika Ayak Halus (40 Ton)",
                      project_id: "PRJ-SENTUL-02",
                      status: "WAITING_APPROVAL",
                    },
                  ]
                ).map((item: any) => (
                  <div
                    key={item.id}
                    onClick={() =>
                      setInspectorDoc({
                        doc_type: String(item.id).startsWith("PO")
                          ? "PO"
                          : "PR",
                        doc_id: item.id,
                        title:
                          item.item_name || item.supplier || "Dokumen Pengadaan",
                        subtitle: `${item.id} · ${item.project_id || "General"}`,
                        status: item.status || "PENDING",
                        amount: item.total_amount,
                      })
                    }
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer hover:border-stone-400 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {item.item_name || item.supplier || item.id}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500 mt-0.5">
                        {item.id} · {item.status || "PENDING"}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-stone-900 text-white text-[11px] font-bold shrink-0">
                      Inspect &amp; PIN
                    </span>
                  </div>
                ))}

              {selectedHubCategory === "PROJECTS" &&
                (
                  hubData?.projects?.slice(0, 6) || [
                    {
                      id: "PRJ-2026-001",
                      name: "Pavingisasi Kawasan Industri Sentul",
                      customer: "PT Sentul City Tbk",
                      status: "IN_PROGRESS",
                    },
                  ]
                ).map((prj: any) => (
                  <div
                    key={prj.id}
                    onClick={() =>
                      setInspectorDoc({
                        doc_type: "PROJECT_SPK",
                        doc_id: prj.id,
                        title: prj.name,
                        subtitle: `${prj.id} · ${prj.customer || "Client"}`,
                        status: prj.status || "IN_PROGRESS",
                      })
                    }
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {prj.name}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {prj.id} · {prj.customer} · {prj.status}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-stone-100 text-stone-800 text-[11px] font-bold shrink-0">
                      Inspect
                    </span>
                  </div>
                ))}

              {selectedHubCategory === "INVENTORY" &&
                (
                  hubData?.inventory?.slice(0, 8) || [
                    {
                      item_code: "MAT-SMN-01",
                      name: "Semen Portland Tipe I",
                      stock: 420,
                      unit: "SAK",
                    },
                    {
                      item_code: "FG-PAV-06",
                      name: "Paving Bata 6cm K-300",
                      stock: 12500,
                      unit: "PCS",
                    },
                  ]
                ).map((inv: any, idx: number) => (
                  <div
                    key={inv.id || idx}
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {inv.name}
                      </div>
                      <div className="text-[10px] font-mono text-stone-500">
                        {inv.item_code || "SKU"} · {inv.type || "MATERIAL"}
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold tabular-nums text-stone-900">
                      {inv.stock ?? 0} {inv.unit || "PCS"}
                    </div>
                  </div>
                ))}

              {selectedHubCategory === "PROCUREMENT" &&
                (
                  hubData?.purchaseOrders?.slice(0, 6) || [
                    {
                      id: "PO-2026-041",
                      supplier: "PT Indocement Tunggal Prakarsa",
                      total_amount: 42500000,
                      status: "PENDING",
                    },
                    {
                      id: "PO-2026-042",
                      supplier: "CV Pasir Jaya Sentul",
                      total_amount: 18500000,
                      status: "APPROVED",
                    },
                  ]
                ).map((po: any) => (
                  <div
                    key={po.id}
                    onClick={() =>
                      setInspectorDoc({
                        doc_type: "PO",
                        doc_id: po.id,
                        title: po.supplier || po.id,
                        subtitle: `${po.id} · ${formatIDR(po.total_amount || 0)}`,
                        status: po.status || "PENDING",
                        amount: po.total_amount,
                      })
                    }
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {po.supplier || po.id}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-stone-500">
                        {po.id} · {formatIDR(po.total_amount || 0)} ·{" "}
                        {po.status}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-stone-900 text-white text-[11px] font-bold shrink-0">
                      PIN Action
                    </span>
                  </div>
                ))}

              {selectedHubCategory === "QUOTATIONS" &&
                (
                  hubData?.quotations?.slice(0, 6) || [
                    {
                      id: "QUO-2026-019",
                      customer_name: "PT Kawasan Industri Jababeka",
                      total_amount: 165000000,
                      status: "SUBMITTED",
                    },
                  ]
                ).map((quo: any) => (
                  <div
                    key={quo.id}
                    onClick={() =>
                      setInspectorDoc({
                        doc_type: "QUOTATION",
                        doc_id: quo.id,
                        title:
                          quo.customer_name || quo.customer || "Sales Quotation",
                        subtitle: `${quo.id} · ${formatIDR(quo.total_amount || 0)}`,
                        status: quo.status || "SUBMITTED",
                        amount: quo.total_amount,
                      })
                    }
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {quo.customer_name || quo.customer || quo.id}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-stone-500">
                        {quo.id} · {formatIDR(quo.total_amount || 0)} ·{" "}
                        {quo.status}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-stone-900 text-white text-[11px] font-bold shrink-0">
                      Authorize
                    </span>
                  </div>
                ))}

              {selectedHubCategory === "DELIVERIES" &&
                (
                  hubData?.deliveries?.slice(0, 6) || [
                    {
                      id: "DO-2026-055",
                      customer: "Proyek Tol Serang - Panimbang",
                      driver_name: "Slamet Riyadi (B 9482 UQA)",
                      status: "IN_TRANSIT",
                    },
                  ]
                ).map((del: any) => (
                  <div
                    key={del.id}
                    onClick={() =>
                      setInspectorDoc({
                        doc_type: "DELIVERY",
                        doc_id: del.id,
                        title: del.customer || del.id,
                        subtitle: `${del.id} · ${del.driver_name || "Armada Logistik"}`,
                        status: del.status || "PENDING",
                      })
                    }
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {del.customer || del.id}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {del.id} · {del.status || "IN_TRANSIT"}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-xl bg-stone-100 text-stone-800 text-[11px] font-bold shrink-0">
                      Verify DO
                    </span>
                  </div>
                ))}

              {selectedHubCategory === "CONTACTS" &&
                (
                  hubData?.customers?.slice(0, 6) || [
                    {
                      id: "CUST-01",
                      name: "PT Sentul City Tbk",
                      phone: "021-8796234",
                      city: "Bogor",
                    },
                    {
                      id: "VEND-01",
                      name: "PT Indocement Tunggal Prakarsa",
                      phone: "021-2512121",
                      city: "Citeureup",
                    },
                  ]
                ).map((contact: any, idx: number) => (
                  <div
                    key={contact.id || idx}
                    className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">
                        {contact.name}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {contact.phone || "No Phone"} ·{" "}
                        {contact.city || "Indonesia"}
                      </div>
                    </div>
                  </div>
                ))}

              {selectedHubCategory === "FINANCE" && (
                <div className="bg-white border border-stone-200/80 rounded-2xl p-4 space-y-2.5 shadow-2xs">
                  <div className="text-xs font-bold text-stone-900">
                    Ringkasan Keuangan &amp; Buku Besar (PostgreSQL Synced)
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">Total Pendapatan</span>
                    <span className="font-mono font-bold tabular-nums text-emerald-700">
                      {formatIDR(hubData?.summary?.totalRevenue || 485000000)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">Total Pengeluaran PO</span>
                    <span className="font-mono font-bold tabular-nums text-rose-700">
                      {formatIDR(hubData?.summary?.totalExpenses || 210000000)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-stone-100 flex justify-between text-xs font-bold">
                    <span className="text-stone-900">Estimasi Margin Bersih</span>
                    <span className="font-mono tabular-nums text-stone-900">
                      {formatIDR(hubData?.summary?.netProfit || 275000000)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB C: SHOP FLOOR TERMINAL 2-ARAH (Supervisor <-> Operator)       */}
        {/* ================================================================= */}
        {activeTab === "SHOPFLOOR" && (
          <div className="space-y-3">
            {/* Signature Dark Stone-900 Hero Card */}
            <section className="bg-stone-900 text-white rounded-3xl p-4 shadow-md space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[10px] font-mono text-stone-400">
                    WORK ORDER AKTIF · SHIFT 1
                  </span>
                  <div className="text-sm font-bold text-white font-mono truncate">
                    {workstation?.work_order_tickets?.[0]?.id ||
                      "#WO-231015-042"}
                  </div>
                  <div className="text-xs text-stone-300 truncate">
                    {workstation?.assigned_machine?.name ||
                      "Line 1 Hydraulic Press · Paving Bata 6cm"}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-stone-300">
                  <span>Batch Progress</span>
                  <span className="font-bold text-white">
                    372 / 500 pcs · 74%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-stone-800 overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: "74%" }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    handleWotStatus(
                      workstation?.work_order_tickets?.[0]?.id || "WOT-042",
                      "IN_PROGRESS",
                    )
                  }
                  className="h-10 rounded-xl bg-white hover:bg-stone-100 text-stone-900 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleWotStatus(
                      workstation?.work_order_tickets?.[0]?.id || "WOT-042",
                      "PAUSED",
                    )
                  }
                  className="h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleWotStatus(
                      workstation?.work_order_tickets?.[0]?.id || "WOT-042",
                      "COMPLETED",
                    )
                  }
                  className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Finish</span>
                </button>
              </div>
            </section>

            {/* Two-Way Floor Note Card (Supervisor <-> Operator) */}
            <section className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-900">
                  Floor Note 2-Arah (Supervisor &amp; Operator)
                </span>
                <span className="text-[10px] font-mono text-stone-500">
                  Socket.IO Live
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
                <strong className="font-bold text-stone-900 block mb-0.5">
                  Supervisor Hendra:
                </strong>
                Pastikan setting tekanan hidrolik mold press stabil pada 180 bar
                sebelum melanjutkan batch #042.
              </div>

              <form onSubmit={handleSendFloorNote} className="flex gap-2">
                <input
                  type="text"
                  value={floorNoteInput}
                  onChange={(e) => setFloorNoteInput(e.target.value)}
                  placeholder="Balas catatan ke Supervisor..."
                  className="flex-1 h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
                <button
                  type="submit"
                  className="w-10 h-10 rounded-xl bg-stone-900 hover:bg-stone-800 text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </section>

            {/* Quick 2-Way Actions (Material, Tooling, NDP Breakdown, Shift Handover) */}
            <section className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickFloorRequest("MATERIAL")}
                className="min-h-[44px] px-3 rounded-2xl bg-white border border-stone-200/80 hover:bg-stone-50 text-stone-800 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <PackagePlus className="w-4 h-4 text-stone-700" />
                <span>Panggil Material</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFloorRequest("TOOLING")}
                className="min-h-[44px] px-3 rounded-2xl bg-white border border-stone-200/80 hover:bg-stone-50 text-stone-800 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-stone-700" />
                <span>Panggil Tooling</span>
              </button>
              <button
                type="button"
                onClick={handleReportNdp}
                className="min-h-[44px] px-3 rounded-2xl bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Lapor NDP Breakdown</span>
              </button>
              <button
                type="button"
                onClick={handleShiftHandover}
                className="min-h-[44px] px-3 rounded-2xl bg-stone-100 border border-stone-200 hover:bg-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4 text-stone-700" />
                <span>Shift Handover</span>
              </button>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB D: HR PORTAL (ESS - Attendance, Leave, Payslip, KPI, Overtime) */}
        {/* ================================================================= */}
        {activeTab === "ESS" && (
          <div className="space-y-3">
            <section className="bg-stone-900 text-white rounded-3xl p-4 shadow-md space-y-3 text-center">
              <div className="text-[10px] font-mono text-stone-400">
                JAKARTA LIVE ATTENDANCE · GPS GEOFENCE
              </div>
              <div className="text-2xl font-black font-mono tabular-nums tracking-tight text-white">
                08:15:20 AM
              </div>
              <div className="text-xs text-stone-300">
                Pabrik Sentul · Radius Terverifikasi (&lt; 50m)
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleClockAttendance("CLOCK_IN")}
                  className="h-10 rounded-xl bg-white hover:bg-stone-100 text-stone-900 font-bold text-xs cursor-pointer"
                >
                  Clock In
                </button>
                <button
                  type="button"
                  onClick={() => handleClockAttendance("CLOCK_OUT")}
                  className="h-10 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs cursor-pointer"
                >
                  Clock Out
                </button>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(true)}
                className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs text-left space-y-1 cursor-pointer hover:border-stone-400"
              >
                <div className="text-[11px] font-semibold text-stone-500">
                  Sisa Cuti Tahunan
                </div>
                <div className="text-lg font-black font-mono tabular-nums text-emerald-700">
                  {essData?.leave?.remaining_days ?? 8} Hari
                </div>
                <div className="text-[10px] text-stone-900 font-bold">
                  + Ajukan Cuti / Izin
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsPayslipModalOpen(true)}
                className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs text-left space-y-1 cursor-pointer hover:border-stone-400"
              >
                <div className="text-[11px] font-semibold text-stone-500">
                  Slip Gaji (Payslip)
                </div>
                <div className="text-xs font-black font-mono tabular-nums text-stone-900 truncate">
                  {formatIDR(
                    essData?.compensation?.salary_master?.base_salary || 5850000,
                  )}
                </div>
                <div className="text-[10px] text-stone-900 font-bold">
                  Lihat Rincian PDF
                </div>
              </button>

              <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs space-y-1">
                <div className="text-[11px] font-semibold text-stone-500">
                  Lembur Disetujui
                </div>
                <div className="text-lg font-black font-mono tabular-nums text-stone-900">
                  14.5 Jam
                </div>
                <div className="text-[10px] text-stone-400">
                  Periode Berjalan
                </div>
              </div>

              <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 shadow-2xs space-y-1">
                <div className="text-[11px] font-semibold text-stone-500">
                  Skor Performa KPI
                </div>
                <div className="text-lg font-black font-mono tabular-nums text-stone-900">
                  {essData?.kpi?.latest?.score || "4.8"} / 5.0
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  Sangat Baik
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB E: TEAM MESSAGES & IN-APP DOCUMENT PREVIEW                    */}
        {/* ================================================================= */}
        {activeTab === "MESSAGE" && (
          <div className="space-y-3">
            <div className="space-y-2.5">
              <div className="flex flex-col items-start gap-1 max-w-[88%]">
                <span className="text-[10px] font-bold text-stone-500 pl-1">
                  Supervisor Sarah J. · Production
                </span>
                <div className="p-3 rounded-2xl bg-white border border-stone-200/80 text-xs text-stone-800 leading-relaxed shadow-2xs">
                  Selamat pagi tim. Tolong periksa dokumen SOP &amp; BOP cetakan
                  paving bata terbaru sebelum memulai batch #042.
                </div>
              </div>

              {/* Mandatory In-Chat Document Preview Card */}
              <div className="bg-white border border-stone-200/80 rounded-2xl p-3 shadow-2xs space-y-2 max-w-[92%]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200 text-stone-700 flex items-center justify-center shrink-0 font-mono font-bold text-[10px]">
                    PDF
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-stone-900 truncate">
                      SOP-Paving-Bata-2026.pdf
                    </div>
                    <div className="text-[10px] font-mono text-stone-400">
                      2.4 MB · BOP &amp; Standar Dimensi
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPreviewDocModal({
                      title: "SOP & BOP Cetakan Paving Bata 2026",
                      refCode: "SOP-PB-2026-V2",
                      summary:
                        "Standar Mutu K-300: Dimensi 210 × 105 × 60 mm (±1.5 mm). Tekanan hidrolik press utama: 180 bar. Durasi vibrasi mold: 8.0 detik.",
                    })
                  }
                  className="w-full h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-900 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Buka Dokumen Teknis (In-App View)</span>
                </button>
              </div>

              <div className="flex flex-col items-end gap-1 ml-auto max-w-[88%]">
                <span className="text-[10px] font-bold text-stone-500 pr-1">
                  {session.user.name}
                </span>
                <div className="p-3 rounded-2xl bg-stone-900 text-white text-xs leading-relaxed">
                  Siap, dokumen SOP sudah kami buka di layar tanpa keluar dari
                  aplikasi. Tekanan hidrolik sudah disetel ke 180 bar.
                </div>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatInput.trim()) return;
                MobileApi.sendChatMessage({
                  thread_id: "THREAD-GENERAL",
                  content: chatInput.trim(),
                });
                setChatInput("");
                setStatusFeedback("Pesan terkirim ke kanal tim.");
              }}
              className="pt-2 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ketik pesan diskusi..."
                className="flex-1 h-10 px-3 rounded-xl bg-white border border-stone-200 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
              />
              <button
                type="submit"
                className="w-10 h-10 rounded-xl bg-stone-900 hover:bg-stone-800 text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB F: SYSTEM PROFILE, DAILY 6-DIGIT PIN & POSTGRESQL BRIDGE      */}
        {/* ================================================================= */}
        {activeTab === "PROFILE" && (
          <div className="space-y-3">
            <div className="bg-stone-900 text-white p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white text-stone-900 font-black text-sm flex items-center justify-center shrink-0">
                  {session.user.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {session.user.name}
                  </div>
                  <div className="text-[11px] font-mono text-stone-300">
                    @{session.user.username} · {session.user.role} ·{" "}
                    {session.app_scope}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-stone-900 text-[#FFD700] flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-stone-500">
                    Daily 6-Digit Auth Key (PIN Otorisasi)
                  </div>
                  <div className="text-sm font-mono font-black text-stone-900 tracking-widest">
                    {showPinValue ? dailyPin : "••••••"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPinValue((v) => !v)}
                className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold cursor-pointer"
              >
                {showPinValue ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>

            <div className="bg-white border border-stone-200/80 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-stone-700" />
                  <span className="text-xs font-bold text-stone-900">
                    Integrasi Database PostgreSQL &amp; ERP
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-700">
                  CONNECTED
                </span>
              </div>
              <div className="text-[11px] text-stone-600 space-y-1 font-mono">
                <div>
                  Engine:{" "}
                  {dbStatus?.engine_summary?.cloud_engine ||
                    "Supabase PostgreSQL + SQLite WAL"}
                </div>
                <div>
                  Sync Table:{" "}
                  {dbStatus?.engine_summary?.replication_table ||
                    "public.erp_sync_records"}
                </div>
                <div>
                  Shared Tables:{" "}
                  {dbStatus?.engine_summary?.total_shared_tables || 68} tabel
                  identik dengan Web ERP
                </div>
              </div>
              <button
                type="button"
                onClick={handleTriggerPostgresSync}
                disabled={isLoading}
                className="w-full h-9 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
              >
                Sinkronkan Sekarang ke PostgreSQL Bridge
              </button>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="w-full h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar dari Sesi Mobile</span>
            </button>
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* 2.4 IN-APP DOCUMENT PREVIEW MODAL (Zero Navigation Context Loss)  */}
      {/* ================================================================= */}
      {previewDocModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-xs p-3">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl border border-stone-200">
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-stone-400">
                  IN-APP TECHNICAL DOCUMENT PREVIEW
                </span>
                <h3 className="text-sm font-bold text-stone-900">
                  {previewDocModal.title}
                </h3>
                <span className="text-xs font-mono text-stone-500">
                  {previewDocModal.refCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDocModal(null)}
                className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs text-stone-700 leading-relaxed">
              {previewDocModal.summary}
            </div>

            <button
              type="button"
              onClick={() => setPreviewDocModal(null)}
              className="w-full h-10 rounded-xl bg-stone-900 text-white font-bold text-xs cursor-pointer"
            >
              Tutup &amp; Kembali ke Percakapan
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2.5 ESS LEAVE REQUEST MODAL & PAYSLIP DETAIL MODAL                 */}
      {/* ================================================================= */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-xs p-3">
          <form
            onSubmit={handleSubmitLeave}
            className="w-full max-w-lg bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl border border-stone-200"
          >
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-stone-900" />
                <h3 className="text-sm font-bold text-stone-900">
                  Formulir Pengajuan Cuti / Izin (ESS)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Jenis Cuti / Izin
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-900"
                >
                  <option value="Annual Paid Leave">
                    Cuti Tahunan (Annual Paid Leave)
                  </option>
                  <option value="Sick Leave">Izin Sakit (Sick Leave)</option>
                  <option value="Emergency Leave">Izin Kepentingan Keluarga</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    Mulai Tanggal
                  </label>
                  <input
                    type="date"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 font-mono text-stone-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    Sampai Tanggal
                  </label>
                  <input
                    type="date"
                    value={leaveEnd}
                    onChange={(e) => setLeaveEnd(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 font-mono text-stone-900"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-stone-700 mb-1">
                  Keterangan / Alasan
                </label>
                <input
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Contoh: Keperluan keluarga luar kota..."
                  className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-900"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-10 rounded-xl bg-stone-900 text-white font-bold text-xs cursor-pointer"
            >
              Kirim Pengajuan Cuti ke HRIS
            </button>
          </form>
        </div>
      )}

      {isPayslipModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-xs p-3">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl border border-stone-200">
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-stone-900" />
                <h3 className="text-sm font-bold text-stone-900">
                  Rincian Slip Gaji (Payslip) — {session.user.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPayslipModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Gaji Pokok</span>
                <span className="font-mono font-bold tabular-nums">
                  {formatIDR(
                    essData?.compensation?.salary_master?.base_salary || 5850000,
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Tunjangan Operasional &amp; Lembur</span>
                <span className="font-mono font-bold tabular-nums text-emerald-700">
                  {formatIDR(850000)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Potongan BPJS &amp; PPh 21</span>
                <span className="font-mono font-bold tabular-nums text-rose-700">
                  -{formatIDR(225000)}
                </span>
              </div>
              <div className="pt-2 border-t border-stone-200 flex justify-between font-bold text-stone-900">
                <span>Take Home Pay (THP)</span>
                <span className="font-mono tabular-nums">
                  {formatIDR(6475000)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsPayslipModalOpen(false);
                setStatusFeedback("Slip Gaji PDF telah disiapkan untuk unduhan.");
              }}
              className="w-full h-10 rounded-xl bg-stone-900 text-white font-bold text-xs cursor-pointer"
            >
              Unduh Slip Gaji Resmi (PDF)
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2.6 BACK-OFFICE DOCUMENT INSPECTOR & 6-DIGIT PIN AUTHORIZATION    */}
      {/* ================================================================= */}
      {inspectorDoc && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 backdrop-blur-xs p-3">
          <div className="w-full max-w-lg bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl border border-stone-200">
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto -mt-1" />
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono text-stone-500">
                  {inspectorDoc.doc_type} · {inspectorDoc.status}
                </span>
                <h3 className="text-sm font-bold text-stone-900">
                  {inspectorDoc.title}
                </h3>
                <p className="text-xs font-mono text-stone-500">
                  {inspectorDoc.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectorDoc(null)}
                className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-stone-700">
                Masukkan 6-Digit Daily Auth PIN (Default akun Anda: {dailyPin})
              </label>
              <input
                type="text"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder={dailyPin}
                className="w-full h-10 px-3 rounded-xl bg-stone-50 border border-stone-200 font-mono text-sm font-bold tracking-widest text-stone-900"
              />
              <input
                type="text"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Catatan otorisasi / alasan revisi (opsional)..."
                className="w-full h-9 px-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-900"
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleAuthorizeDocument("APPROVE")}
                className="h-10 rounded-xl bg-stone-900 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve</span>
              </button>
              <button
                type="button"
                onClick={() => handleAuthorizeDocument("REVISE")}
                className="h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold cursor-pointer"
              >
                Revise
              </button>
              <button
                type="button"
                onClick={() => handleAuthorizeDocument("REJECT")}
                className="h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 2.7 FIXED BOTTOM NAVIGATION BAR (64px, Role-Adaptive)             */}
      {/* ================================================================= */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
        <div
          className={`max-w-lg mx-auto grid ${
            isOperator ? "grid-cols-4" : "grid-cols-5"
          } items-center h-16 px-1`}
        >
          {!isOperator && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("HOME")}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                  activeTab === "HOME"
                    ? "text-stone-900 font-bold"
                    : "text-stone-400 hover:text-stone-700 font-medium"
                }`}
              >
                <div
                  className={`px-3 py-1 rounded-full ${
                    activeTab === "HOME" ? "bg-stone-100 text-stone-900" : ""
                  }`}
                >
                  <Home className="w-4 h-4" />
                </div>
                <span className="text-[10px] tracking-tight leading-none">
                  Home
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ROLE_HUB")}
                className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                  activeTab === "ROLE_HUB"
                    ? "text-stone-900 font-bold"
                    : "text-stone-400 hover:text-stone-700 font-medium"
                }`}
              >
                <div
                  className={`px-3 py-1 rounded-full ${
                    activeTab === "ROLE_HUB"
                      ? "bg-stone-100 text-stone-900"
                      : ""
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-[10px] tracking-tight leading-none">
                  Exec Hub
                </span>
              </button>
            </>
          )}

          {/* Shop Floor 2-Way Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("SHOPFLOOR")}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === "SHOPFLOOR"
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium"
            }`}
          >
            <div
              className={`px-3 py-1 rounded-full ${
                activeTab === "SHOPFLOOR" ? "bg-stone-100 text-stone-900" : ""
              }`}
            >
              <Factory className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              Shop Floor
            </span>
          </button>

          {/* Messages Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("MESSAGE")}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === "MESSAGE"
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium"
            }`}
          >
            <div
              className={`px-3 py-1 rounded-full ${
                activeTab === "MESSAGE" ? "bg-stone-100 text-stone-900" : ""
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              Messages
            </span>
          </button>

          {/* HR Portal (ESS) Tab */}
          <button
            type="button"
            onClick={() => setActiveTab("ESS")}
            className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
              activeTab === "ESS"
                ? "text-stone-900 font-bold"
                : "text-stone-400 hover:text-stone-700 font-medium"
            }`}
          >
            <div
              className={`px-3 py-1 rounded-full ${
                activeTab === "ESS" ? "bg-stone-100 text-stone-900" : ""
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <span className="text-[10px] tracking-tight leading-none">
              HR Portal
            </span>
          </button>

          {/* Profile Tab (Shown in Bottom Bar for Operator, or via Top Bar for Back-Office) */}
          {isOperator && (
            <button
              type="button"
              onClick={() => setActiveTab("PROFILE")}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                activeTab === "PROFILE"
                  ? "text-stone-900 font-bold"
                  : "text-stone-400 hover:text-stone-700 font-medium"
              }`}
            >
              <div
                className={`px-3 py-1 rounded-full ${
                  activeTab === "PROFILE" ? "bg-stone-100 text-stone-900" : ""
                }`}
              >
                <User className="w-4 h-4" />
              </div>
              <span className="text-[10px] tracking-tight leading-none">
                Profile
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
