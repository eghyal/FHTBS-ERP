import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Eye,
  EyeOff,
  Factory,
  FileText,
  Filter,
  FolderKanban,
  Key,
  Landmark,
  Layers,
  Mail,
  MessageSquare,
  Monitor,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sliders,
  Sparkles,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth, Role } from "@/contexts/AuthContext";
import { useMobileMonitoring } from "@/contexts/MonitoringContext";
import { useToast } from "@/contexts/ToastContext";
import {
  Action,
  getRoleMonitoringProfile,
  hasDesktopPermission,
  hasGodMode,
} from "@/utils/pbac";
import { safeFetchJson, apiFetch } from "@/utils/api";
import { getDailyAuthKey } from "@/utils/auth";
import { cn, formatIDR } from "@/lib/utils";
import type {
  HubCategory,
  ApprovalDocFilter,
  InspectorItemType,
  MobileMonitorHubProps,
} from "./monitorTypes";
import { MobileHomeDashboard } from "./hub/MobileHomeDashboard";
import { MobileRoleActionHub } from "./hub/MobileRoleActionHub";
import { MobileInspectorSheet } from "./hub/MobileInspectorSheet";

export type { HubCategory };

export const MobileMonitorHub: React.FC<MobileMonitorHubProps> = ({
  defaultTab,
  initialCategory,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { openDesktopNotice } = useMobileMonitoring();

  const tabParam = searchParams.get("tab");
  const catParam = searchParams.get("cat") as HubCategory | null;
  const activeMode: "HOME" | "ROLE_HUB" =
    defaultTab || (tabParam === "hub" || catParam ? "ROLE_HUB" : "HOME");

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [financeAnalytics, setFinanceAnalytics] = useState<any>(null);
  const [productionHub, setProductionHub] = useState<any>(null);
  const [designRequests, setDesignRequests] = useState<any[]>([]);

  // Hub Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HubCategory | null>(
    initialCategory || catParam || null,
  );
  const [subFilter, setSubFilter] = useState<ApprovalDocFilter>("ALL");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const setActiveMode = useCallback(
    (mode: "HOME" | "ROLE_HUB", category?: HubCategory) => {
      if (mode === "ROLE_HUB") {
        const nextParams: Record<string, string> = { tab: "hub" };
        if (category) {
          nextParams.cat = category;
        } else if (selectedCategory) {
          nextParams.cat = selectedCategory;
        }
        setSearchParams(nextParams);
      } else {
        setSearchParams({});
      }
    },
    [selectedCategory, setSearchParams],
  );

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
    } else if (catParam) {
      setSelectedCategory(catParam);
    }
  }, [initialCategory, catParam]);

  // Bottom Sheet Detail & PIN Authorization State
  const [selectedItem, setSelectedItem] = useState<{
    type: InspectorItemType;
    data: any;
  } | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [showPinHint, setShowPinHint] = useState(false);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);

  const role: Role = user?.role || "SALES";
  const isExecutive = hasGodMode(user);
  const isManager = user?.level === "MANAGER" || isExecutive;
  const profile = useMemo(() => getRoleMonitoringProfile(role), [role]);

  const openInspector = useCallback((type: InspectorItemType, data: any) => {
    setEnteredPin("");
    setShowPinHint(false);
    setRevisionNote("");
    setShowRevisionInput(false);
    setSelectedItem({ type, data });
  }, []);

  const fetchMonitorData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const requests: Promise<void>[] = [];

      requests.push(
        apiFetch("/api/inventory/summary", {}, user.username)
          .then((res) => setSummary(res?.data ?? res))
          .catch(() => {}),
      );
      requests.push(
        apiFetch("/api/projects", {}, user.username)
          .then((res) => {
            const d = res?.data ?? res;
            setProjects(Array.isArray(d) ? d : []);
          })
          .catch(() => {}),
      );

      // Quotations
      if (
        hasDesktopPermission(user, Action.VIEW_QUOTATIONS) ||
        isManager ||
        isExecutive
      ) {
        requests.push(
          apiFetch("/api/quotations", {}, user.username)
            .then((res) => {
              const d = res?.data ?? res;
              setQuotations(Array.isArray(d) ? d : []);
            })
            .catch(() => {}),
        );
      }

      // Purchase Requisitions (PRs) & Purchase Orders (POs)
      requests.push(
        apiFetch("/api/purchasing/prs", {}, user.username)
          .then((res) => {
            const d = res?.data ?? res;
            setPurchaseRequests(Array.isArray(d) ? d : []);
          })
          .catch(() => {}),
      );

      requests.push(
        apiFetch("/api/purchasing/pos", {}, user.username)
          .then((res) => {
            const d = res?.data ?? res;
            setPurchaseOrders(Array.isArray(d) ? d : []);
          })
          .catch(() => {}),
      );

      // Warehouse Inventory
      if (
        hasDesktopPermission(user, Action.VIEW_WAREHOUSE) ||
        isManager ||
        isExecutive
      ) {
        requests.push(
          apiFetch("/api/inventory", {}, user.username)
            .then((res) => {
              const d = res?.data ?? res;
              setInventory(Array.isArray(d) ? d : []);
            })
            .catch(() => {}),
        );
      }

      // Delivery Notes
      requests.push(
        apiFetch("/api/sales/deliveries", {}, user.username)
          .then((res) => {
            const d = res?.data ?? res;
            setDeliveries(Array.isArray(d) ? d : []);
          })
          .catch(() => {}),
      );

      if (hasDesktopPermission(user, Action.VIEW_CUSTOMERS) || isExecutive) {
        requests.push(
          apiFetch("/api/customers", {}, user.username)
            .then((res) => {
              const d = res?.data ?? res;
              setCustomers(Array.isArray(d) ? d : []);
            })
            .catch(() => {}),
        );
      }

      if (hasDesktopPermission(user, Action.VIEW_VENDORS) || isExecutive) {
        requests.push(
          apiFetch("/api/suppliers", {}, user.username)
            .then((res) => {
              const d = res?.data ?? res;
              setVendors(Array.isArray(d) ? d : []);
            })
            .catch(() => {}),
        );
      }

      if (hasDesktopPermission(user, Action.VIEW_FINANCE) || isExecutive) {
        requests.push(
          apiFetch("/api/finance/analytics", {}, user.username)
            .then((res) => setFinanceAnalytics(res?.data ?? res))
            .catch(() => {}),
        );
      }

      if (hasDesktopPermission(user, Action.VIEW_PRODUCTION) || isExecutive) {
        requests.push(
          apiFetch("/api/production/command-center", {}, user.username)
            .then((res) => setProductionHub(res?.data?.data ?? res?.data ?? res))
            .catch(() => {}),
        );
      }

      if (
        hasDesktopPermission(user, Action.VIEW_DESIGN_REQUESTS) ||
        isExecutive
      ) {
        requests.push(
          apiFetch("/api/purchasing/prs?scope=PROJECT", {}, user.username)
            .then((res) => {
              const d = res?.data ?? res;
              setDesignRequests(Array.isArray(d) ? d : []);
            })
            .catch(() => {}),
        );
      }

      await Promise.allSettled(requests);
    } finally {
      setIsLoading(false);
    }
  }, [user, isManager, isExecutive]);

  useEffect(() => {
    fetchMonitorData();
  }, [fetchMonitorData]);

  // Derived Collections
  const lowStockItems = useMemo(
    () =>
      inventory.filter(
        (item) =>
          item.type !== "FINISH_GOOD" &&
          Number(item.stock || 0) <= Number(item.min_stock || 0) &&
          Number(item.min_stock || 0) > 0,
      ),
    [inventory],
  );

  // Pending documents requiring Manager / Executive authorization
  const pendingPRs = useMemo(
    () =>
      purchaseRequests.filter(
        (pr) => pr.status === "DRAFTED" || pr.status === "PENDING",
      ),
    [purchaseRequests],
  );

  const unapprovedPOs = useMemo(
    () =>
      purchaseOrders.filter(
        (po) =>
          po.status === "DRAFTED" ||
          po.status === "PENDING" ||
          po.status === "DRAFT",
      ),
    [purchaseOrders],
  );

  const pendingQuotations = useMemo(
    () =>
      quotations.filter(
        (q) => q.status === "PENDING" || q.status === "DRAFT",
      ),
    [quotations],
  );

  const unapprovedDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.status === "DRAFT" ||
          d.status === "DRAFTED" ||
          d.status === "REVISION",
      ),
    [deliveries],
  );

  const totalPendingApprovalsCount =
    pendingPRs.length +
    unapprovedPOs.length +
    pendingQuotations.length +
    unapprovedDeliveries.length;

  const approvedQuotations = useMemo(
    () =>
      quotations.filter(
        (q) => q.status === "APPROVED" || q.status === "PROCESSED",
      ),
    [quotations],
  );

  const totalQuotationsValue = useMemo(
    () =>
      quotations.reduce(
        (acc, q) => acc + Number(q.grand_total || q.total_amount || q.amount || 0),
        0,
      ),
    [quotations],
  );

  const activePOs = useMemo(
    () =>
      purchaseOrders.filter(
        (po) =>
          po.status === "DRAFTED" ||
          po.status === "PENDING" ||
          po.status === "ISSUED" ||
          po.status === "PARTIAL",
      ),
    [purchaseOrders],
  );

  const pendingDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) => d.status !== "DELIVERED" && d.status !== "COMPLETED",
      ),
    [deliveries],
  );

  // Determine available Role Hub categories based on RBAC & PBAC (Wrapped 2-Row Bento Grid)
  const hubCategories = useMemo(() => {
    const cats: {
      id: HubCategory;
      label: string;
      count: number;
      icon: React.ReactNode;
    }[] = [];

    if (isManager) {
      cats.push({
        id: "APPROVALS",
        label: "Pending Approvals",
        count: totalPendingApprovalsCount,
        icon: <ShieldCheck className="w-3.5 h-3.5" />,
      });
    }

    if (role === "PRODUCTION" || role === "ENGINEERING" || isExecutive) {
      cats.push({
        id: "PROJECTS",
        label: "Active Projects",
        count: projects.length,
        icon: <FolderKanban className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_QUOTATIONS) ||
      role === "SALES" ||
      role === "FINANCE" ||
      isManager ||
      isExecutive
    ) {
      cats.push({
        id: "QUOTATIONS",
        label: "Quotations",
        count: quotations.length,
        icon: <FileText className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_PROCUREMENT) ||
      role === "PURCHASING" ||
      role === "ENGINEERING" ||
      isManager ||
      isExecutive
    ) {
      cats.push({
        id: "PROCUREMENT",
        label: "PR & PO Queue",
        count: purchaseRequests.length + purchaseOrders.length,
        icon: <ShoppingCart className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_WAREHOUSE) ||
      role === "WAREHOUSE" ||
      isExecutive
    ) {
      cats.push({
        id: "INVENTORY",
        label: "Warehouse Stock",
        count: inventory.length,
        icon: <Package className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_DELIVERIES) ||
      role === "WAREHOUSE" ||
      role === "SALES" ||
      isManager ||
      isExecutive
    ) {
      cats.push({
        id: "DELIVERIES",
        label: "Delivery Notes",
        count: deliveries.length,
        icon: <Truck className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_FINANCE) ||
      role === "FINANCE" ||
      isExecutive
    ) {
      cats.push({
        id: "FINANCE",
        label: "Finance",
        count: 4,
        icon: <Landmark className="w-3.5 h-3.5" />,
      });
    }

    if (
      hasDesktopPermission(user, Action.VIEW_CUSTOMERS) ||
      hasDesktopPermission(user, Action.VIEW_VENDORS) ||
      isExecutive
    ) {
      cats.push({
        id: "CONTACTS",
        label: role === "PURCHASING" ? "Suppliers" : "Contacts",
        count: customers.length + vendors.length,
        icon: <Users className="w-3.5 h-3.5" />,
      });
    }

    if (!cats.some((c) => c.id === "PROJECTS")) {
      cats.push({
        id: "PROJECTS",
        label: "Projects",
        count: projects.length,
        icon: <FolderKanban className="w-3.5 h-3.5" />,
      });
    }

    return cats;
  }, [
    isManager,
    totalPendingApprovalsCount,
    role,
    isExecutive,
    projects.length,
    user,
    quotations.length,
    purchaseRequests.length,
    purchaseOrders.length,
    inventory.length,
    deliveries.length,
    customers.length,
    vendors.length,
  ]);

  const activeCategory: HubCategory = useMemo(() => {
    if (
      selectedCategory &&
      hubCategories.some((c) => c.id === selectedCategory)
    ) {
      return selectedCategory;
    }
    return hubCategories[0]?.id || "PROJECTS";
  }, [selectedCategory, hubCategories]);

  // Validate manual 6-digit PIN before any approval
  const validateManualPin = (): string | null => {
    const clean = enteredPin.trim().toUpperCase();
    if (!clean || clean.length < 6) {
      showToast(
        "Please enter your 6-character Daily Authorization PIN first",
        "error",
      );
      return null;
    }
    return clean;
  };

  // =========================================================================
  // MANAGER & EXECUTIVE APPROVAL / REVISION HANDLERS (PR, PO, QUOTATION, DN)
  // =========================================================================

  const handleAuthorizePR = async (pr: any) => {
    if (!user) return;
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const digitalSignature = `Authorized via Mobile Hub by ${user.name || user.username} (${user.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: pr.id,
            authorized_doc: digitalSignature,
            pin,
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast(
          `PR ${pr.pr_number || pr.id} authorized successfully`,
          "success",
        );
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to authorize PR", "error");
      }
    } catch {
      showToast("Network error while authorizing PR", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRevisePR = async (pr: any) => {
    if (!user || !revisionNote.trim()) {
      showToast("Revision note is required", "error");
      return;
    }
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: pr.id,
            revision_note: revisionNote.trim(),
            pin,
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast("PR returned for revision", "success");
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to revise PR", "error");
      }
    } catch {
      showToast("Network error while revising PR", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleAuthorizePO = async (po: any) => {
    if (!user) return;
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const digitalSignature = `Authorized via Mobile Hub by ${user.name || user.username} (${user.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: po.id,
            auth_doc_name: digitalSignature,
            pin,
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast(
          `PO ${po.po_number || po.id} authorized and issued`,
          "success",
        );
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to authorize PO", "error");
      }
    } catch {
      showToast("Network error while authorizing PO", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleRevisePO = async (po: any) => {
    if (!user || !revisionNote.trim()) {
      showToast("Revision note is required", "error");
      return;
    }
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-po",
        {
          method: "POST",
          body: JSON.stringify({
            po_id: po.id,
            revision_note: revisionNote.trim(),
            pin,
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast("PO returned for revision", "success");
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to revise PO", "error");
      }
    } catch {
      showToast("Network error while revising PO", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleAuthorizeQuotation = async (quo: any) => {
    if (!user) return;
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${quo.id}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ pin }),
        },
        user.username,
      );
      if (res.ok) {
        showToast(
          `Quotation ${quo.quotation_number || quo.id} authorized`,
          "success",
        );
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to authorize quotation", "error");
      }
    } catch {
      showToast("Network error while authorizing quotation", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleReviseQuotation = async (quo: any) => {
    if (!user || !revisionNote.trim()) {
      showToast("Revision note is required", "error");
      return;
    }
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/quotations/${quo.id}/revise`,
        {
          method: "POST",
          body: JSON.stringify({
            pin,
            revision_note: revisionNote.trim(),
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast("Quotation returned for revision", "success");
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to submit revision note", "error");
      }
    } catch {
      showToast("Network error while revising quotation", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleAuthorizeDelivery = async (dn: any) => {
    if (!user) return;
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/deliveries/${dn.id}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({ pin }),
        },
        user.username,
      );
      if (res.ok) {
        showToast(
          `Delivery Note ${dn.dn_number || dn.id} authorized`,
          "success",
        );
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to authorize delivery note", "error");
      }
    } catch {
      showToast("Network error while authorizing delivery note", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleReviseDelivery = async (dn: any) => {
    if (!user || !revisionNote.trim()) {
      showToast("Revision note is required", "error");
      return;
    }
    const pin = validateManualPin();
    if (!pin) return;

    setIsActionSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/sales/deliveries/revise-dn",
        {
          method: "POST",
          body: JSON.stringify({
            dn_id: dn.id,
            revision_note: revisionNote.trim(),
            pin,
          }),
        },
        user.username,
      );
      if (res.ok) {
        showToast("Delivery Note returned for revision", "success");
        setSelectedItem(null);
        fetchMonitorData();
      } else {
        showToast(res.error || "Failed to revise delivery note", "error");
      }
    } catch {
      showToast("Network error while revising delivery note", "error");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Role-specific KPI cards builder (All English, Zero Desktop Table Leaks)
  const getRoleKpiCards = () => {
    const switchHub = (cat: HubCategory) => {
      setSelectedCategory(cat);
      setActiveMode("ROLE_HUB", cat);
    };

    if (isExecutive) {
      const rev =
        financeAnalytics?.summary?.total_revenue_realized ||
        Math.round(
          (financeAnalytics?.summary?.total_received || 0) * (100 / 112),
        );
      const ar = financeAnalytics?.summary?.total_receivable || 0;
      return [
        {
          label: "Net Revenue",
          value: formatIDR(rev),
          sub: "Booked Taxable Base",
          icon: <Landmark className="w-4 h-4 text-emerald-600" />,
          tone: "emerald",
          onClick: () => switchHub("FINANCE"),
        },
        {
          label: "Receivables (AR)",
          value: formatIDR(ar),
          sub: "Unpaid invoices",
          icon: <Wallet className="w-4 h-4 text-amber-600" />,
          tone: "amber",
          onClick: () => switchHub("FINANCE"),
        },
        {
          label: "Active Projects",
          value: String(projects.length),
          sub: `${productionHub?.kpi?.at_risk_projects_count || 0} at risk`,
          icon: <Factory className="w-4 h-4 text-stone-700" />,
          tone: "stone",
          onClick: () => switchHub("PROJECTS"),
        },
        {
          label: "Approvals",
          value: `${totalPendingApprovalsCount} Docs`,
          sub: `${pendingPRs.length} PR · ${unapprovedPOs.length} PO · ${pendingQuotations.length} QTN`,
          icon: <ShieldCheck className="w-4 h-4 text-amber-600" />,
          tone: totalPendingApprovalsCount > 0 ? "amber" : "stone",
          onClick: () => switchHub("APPROVALS"),
        },
      ];
    }

    switch (role) {
      case "SALES":
        return [
          {
            label: "Pipeline Value",
            value: formatIDR(totalQuotationsValue),
            sub: `${quotations.length} quotations`,
            icon: <TrendingUp className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => switchHub("QUOTATIONS"),
          },
          {
            label: "Pending Quotes",
            value: String(pendingQuotations.length),
            sub: `${approvedQuotations.length} approved`,
            icon: <FileText className="w-4 h-4 text-amber-600" />,
            tone: pendingQuotations.length > 0 ? "amber" : "stone",
            onClick: () => switchHub(isManager ? "APPROVALS" : "QUOTATIONS"),
          },
          {
            label: "Deliveries",
            value: String(pendingDeliveries.length),
            sub: `${unapprovedDeliveries.length} pending auth`,
            icon: <Truck className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("DELIVERIES"),
          },
          {
            label: "Clients",
            value: String(customers.length),
            sub: "Call & email",
            icon: <Building2 className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("CONTACTS"),
          },
        ];

      case "PRODUCTION": {
        const kpi = productionHub?.kpi || {};
        return [
          {
            label: "Active Projects",
            value: String(kpi.total_active_projects_count ?? projects.length),
            sub: `${kpi.in_progress_projects_count ?? 0} in progress`,
            icon: <Factory className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => switchHub("PROJECTS"),
          },
          {
            label: "Approvals",
            value: `${totalPendingApprovalsCount} Docs`,
            sub: `${pendingPRs.length} PRs pending`,
            icon: <ShieldCheck className="w-4 h-4 text-amber-600" />,
            tone: totalPendingApprovalsCount > 0 ? "amber" : "stone",
            onClick: () => switchHub(isManager ? "APPROVALS" : "PROCUREMENT"),
          },
          {
            label: "Deadline Risks",
            value: String(kpi.at_risk_projects_count ?? 0),
            sub: `${kpi.material_bottleneck_count ?? 0} bottlenecks`,
            icon: <Calendar className="w-4 h-4 text-rose-600" />,
            tone: (kpi.at_risk_projects_count || 0) > 0 ? "rose" : "stone",
            onClick: () => switchHub("PROJECTS"),
          },
          {
            label: "Active WIP",
            value: String(kpi.total_active_wip_units ?? 0),
            sub: "Shopfloor units",
            icon: <Layers className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("PROJECTS"),
          },
        ];
      }

      case "WAREHOUSE":
        return [
          {
            label: "Master SKUs",
            value: String(inventory.length),
            sub: "Stock lookup",
            icon: <Package className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("INVENTORY"),
          },
          {
            label: "Low Stock",
            value: String(summary?.low_stock ?? lowStockItems.length),
            sub: "Below minimum",
            icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
            tone:
              (summary?.low_stock ?? lowStockItems.length) > 0
                ? "rose"
                : "emerald",
            onClick: () => switchHub("INVENTORY"),
          },
          {
            label: "Inbound POs",
            value: String(summary?.pending_grns ?? activePOs.length),
            sub: "Expected deliveries",
            icon: <ClipboardList className="w-4 h-4 text-amber-600" />,
            tone: (summary?.pending_grns || 0) > 0 ? "amber" : "stone",
            onClick: () => switchHub("PROCUREMENT"),
          },
          {
            label: "Deliveries",
            value: String(pendingDeliveries.length),
            sub: "Outbound queue",
            icon: <Truck className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => switchHub("DELIVERIES"),
          },
        ];

      case "PURCHASING":
        return [
          {
            label: "Pending POs",
            value: String(unapprovedPOs.length),
            sub: `${purchaseOrders.length} total POs`,
            icon: <ShoppingCart className="w-4 h-4 text-amber-600" />,
            tone: unapprovedPOs.length > 0 ? "amber" : "stone",
            onClick: () => switchHub(isManager ? "APPROVALS" : "PROCUREMENT"),
          },
          {
            label: "Low Stock",
            value: String(summary?.low_stock ?? lowStockItems.length),
            sub: "Restock needed",
            icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
            tone:
              (summary?.low_stock ?? lowStockItems.length) > 0
                ? "rose"
                : "stone",
            onClick: () => switchHub("INVENTORY"),
          },
          {
            label: "Suppliers",
            value: String(vendors.length),
            sub: "Call & email",
            icon: <Users className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => switchHub("CONTACTS"),
          },
          {
            label: "Price Matrix",
            value: "Desktop",
            sub: "PC required",
            icon: <Monitor className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => navigate("/pricing"),
          },
        ];

      case "ENGINEERING":
        return [
          {
            label: "Pending PRs",
            value: String(pendingPRs.length),
            sub: `${purchaseRequests.length} total PRs`,
            icon: <ShieldCheck className="w-4 h-4 text-amber-600" />,
            tone: pendingPRs.length > 0 ? "amber" : "stone",
            onClick: () => switchHub(isManager ? "APPROVALS" : "PROCUREMENT"),
          },
          {
            label: "Active Projects",
            value: String(projects.length),
            sub: `${designRequests.length} design reqs`,
            icon: <ClipboardList className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("PROJECTS"),
          },
          {
            label: "Low Stock",
            value: `${summary?.low_stock ?? lowStockItems.length} SKUs`,
            sub: "Material alerts",
            icon: <AlertTriangle className="w-4 h-4 text-rose-600" />,
            tone: (summary?.low_stock || 0) > 0 ? "rose" : "stone",
            onClick: () => switchHub("INVENTORY"),
          },
          {
            label: "BOM Studio",
            value: "Desktop",
            sub: "PC required",
            icon: <Monitor className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => navigate("/engineering"),
          },
        ];

      case "FINANCE": {
        const rev =
          financeAnalytics?.summary?.total_revenue_realized ||
          Math.round(
            (financeAnalytics?.summary?.total_received || 0) * (100 / 112),
          );
        const ar = financeAnalytics?.summary?.total_receivable || 0;
        const cogs =
          financeAnalytics?.summary?.total_material_cogs ||
          financeAnalytics?.summary?.total_cogs ||
          0;
        return [
          {
            label: "Net Revenue",
            value: formatIDR(rev),
            sub: "Booked Taxable Base",
            icon: <Activity className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => switchHub("FINANCE"),
          },
          {
            label: "Receivables (AR)",
            value: formatIDR(ar),
            sub: "Unpaid invoices",
            icon: <Wallet className="w-4 h-4 text-amber-600" />,
            tone: ar > 0 ? "amber" : "stone",
            onClick: () => switchHub("FINANCE"),
          },
          {
            label: "Material COGS",
            value: formatIDR(cogs),
            sub: "Direct cost",
            icon: <DollarSign className="w-4 h-4 text-rose-600" />,
            tone: "stone",
            onClick: () => switchHub("FINANCE"),
          },
          {
            label: "Active POs (AP)",
            value: String(activePOs.length),
            sub: "Vendor POs",
            icon: <ShoppingCart className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("PROCUREMENT"),
          },
        ];
      }

      default:
        return [
          {
            label: "Active Projects",
            value: String(projects.length),
            sub: "Operations",
            icon: <FolderKanban className="w-4 h-4 text-stone-700" />,
            tone: "stone",
            onClick: () => switchHub("PROJECTS"),
          },
          {
            label: "HR Portal",
            value: "Active",
            sub: "Clock-In & Leave",
            icon: <UserCheck className="w-4 h-4 text-emerald-600" />,
            tone: "emerald",
            onClick: () => navigate("/ess"),
          },
        ];
    }
  };

  const kpiCards = getRoleKpiCards();

  // Filtered items for ROLE_HUB view
  const hubItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    switch (activeCategory) {
      case "APPROVALS": {
        const prItems = pendingPRs.map((item) => ({
          id: `pr-${item.id}`,
          type: "PR" as const,
          docTypeLabel: "PR",
          title: item.pr_number || `PR #${item.id}`,
          subtitle: `${item.project_name || item.project_id || "General"} · Req by ${item.requested_by || "Staff"}`,
          meta: `${item.item_count || 1} Items`,
          status: item.status || "DRAFTED",
          tone: "amber" as const,
          raw: item,
        }));

        const poItems = unapprovedPOs.map((item) => ({
          id: `po-${item.id}`,
          type: "PO" as const,
          docTypeLabel: "PO",
          title: item.po_number || `PO #${item.id}`,
          subtitle: item.supplier_name || "Supplier Vendor",
          meta: formatIDR(Number(item.grand_total || item.dpp || 0)),
          status: item.status || "DRAFTED",
          tone: "amber" as const,
          raw: item,
        }));

        const quoItems = pendingQuotations.map((item) => ({
          id: `quo-${item.id}`,
          type: "QUOTATION" as const,
          docTypeLabel: "QTN",
          title: item.quotation_number || `QTN #${item.id}`,
          subtitle:
            item.customer_name ||
            item.customer_name_manual ||
            item.title ||
            "Client",
          meta: formatIDR(
            Number(item.grand_total || item.total_amount || item.amount || 0),
          ),
          status: item.status || "PENDING",
          tone: "amber" as const,
          raw: item,
        }));

        const dnItems = unapprovedDeliveries.map((item) => ({
          id: `dn-${item.id}`,
          type: "DELIVERY" as const,
          docTypeLabel: "DN",
          title: item.dn_number || item.delivery_number || `DN #${item.id}`,
          subtitle:
            item.customer_name || item.project_name || "Outbound Delivery",
          meta: item.delivery_date || "Pending Auth",
          status: item.status || "DRAFT",
          tone: "amber" as const,
          raw: item,
        }));

        let combined = [...prItems, ...poItems, ...quoItems, ...dnItems];
        if (subFilter !== "ALL") {
          combined = combined.filter((i) => i.type === subFilter);
        }
        if (!q) return combined;
        return combined.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.subtitle.toLowerCase().includes(q),
        );
      }

      case "QUOTATIONS":
        return quotations
          .filter(
            (item) =>
              !q ||
              (item.quotation_number || "").toLowerCase().includes(q) ||
              (item.customer_name || "").toLowerCase().includes(q) ||
              (item.title || "").toLowerCase().includes(q),
          )
          .slice(0, 30)
          .map((item) => ({
            id: `quo-${item.id}`,
            type: "QUOTATION" as const,
            docTypeLabel: "QTN",
            title: item.quotation_number || `QTN #${item.id}`,
            subtitle:
              item.customer_name ||
              item.customer_name_manual ||
              item.title ||
              "Client",
            meta: formatIDR(
              Number(item.grand_total || item.total_amount || item.amount || 0),
            ),
            status: item.status || "DRAFT",
            tone:
              item.status === "APPROVED" || item.status === "PROCESSED"
                ? ("emerald" as const)
                : ("amber" as const),
            raw: item,
          }));

      case "PROCUREMENT": {
        const prList = purchaseRequests.map((item) => ({
          id: `pr-${item.id}`,
          type: "PR" as const,
          docTypeLabel: "PR",
          title: item.pr_number || `PR #${item.id}`,
          subtitle: `${item.project_name || item.project_id || "General"} · ${item.requested_by || "Engineering"}`,
          meta: `${item.item_count || 1} Items`,
          status: item.status || "DRAFTED",
          tone:
            item.status === "AUTHORIZED" || item.status === "ORDERED"
              ? ("emerald" as const)
              : ("amber" as const),
          raw: item,
        }));

        const poList = purchaseOrders.map((item) => ({
          id: `po-${item.id}`,
          type: "PO" as const,
          docTypeLabel: "PO",
          title: item.po_number || `PO #${item.id}`,
          subtitle: item.supplier_name || "Vendor",
          meta: formatIDR(Number(item.grand_total || item.dpp || 0)),
          status: item.status || "PENDING",
          tone:
            item.status === "ISSUED" || item.status === "FINISHED"
              ? ("emerald" as const)
              : ("amber" as const),
          raw: item,
        }));

        let combined = [...prList, ...poList];
        if (subFilter === "PR" || subFilter === "PO") {
          combined = combined.filter((i) => i.type === subFilter);
        }
        return combined
          .filter(
            (i) =>
              !q ||
              i.title.toLowerCase().includes(q) ||
              i.subtitle.toLowerCase().includes(q),
          )
          .slice(0, 40);
      }

      case "INVENTORY":
        return inventory
          .filter(
            (item) =>
              !q ||
              (item.name || "").toLowerCase().includes(q) ||
              (item.code || item.item_code || "").toLowerCase().includes(q) ||
              (item.id || "").toLowerCase().includes(q),
          )
          .slice(0, 40)
          .map((item) => {
            const isLow =
              item.type !== "FINISH_GOOD" &&
              Number(item.stock || 0) <= Number(item.min_stock || 0) &&
              Number(item.min_stock || 0) > 0;
            return {
              id: `sku-${item.id}`,
              type: "SKU" as const,
              docTypeLabel: "SKU",
              title: item.name,
              subtitle: `${item.item_code || item.code || item.id} · ${item.type || "MATERIAL"}`,
              meta: `${item.stock ?? 0} ${item.uom || item.unit || "Unit"}`,
              status: isLow ? "LOW STOCK" : "READY",
              tone: isLow ? ("rose" as const) : ("emerald" as const),
              raw: item,
            };
          });

      case "DELIVERIES":
        return deliveries
          .filter(
            (item) =>
              !q ||
              (item.dn_number || item.delivery_number || "")
                .toLowerCase()
                .includes(q) ||
              (item.customer_name || "").toLowerCase().includes(q) ||
              (item.project_name || "").toLowerCase().includes(q),
          )
          .slice(0, 30)
          .map((item) => ({
            id: `del-${item.id}`,
            type: "DELIVERY" as const,
            docTypeLabel: "DN",
            title: item.dn_number || item.delivery_number || `DN #${item.id}`,
            subtitle:
              item.customer_name || item.project_name || "Outbound Shipment",
            meta: item.delivery_date || "Scheduled",
            status: item.status || "DRAFT",
            tone:
              item.status === "AUTHORIZED" ||
              item.status === "DELIVERED" ||
              item.status === "COMPLETED"
                ? ("emerald" as const)
                : ("amber" as const),
            raw: item,
          }));

      case "CONTACTS": {
        const list =
          role === "PURCHASING"
            ? vendors.map((v) => ({ ...v, contactType: "SUPPLIER" }))
            : [
                ...customers.map((c) => ({ ...c, contactType: "CUSTOMER" })),
                ...vendors.map((v) => ({ ...v, contactType: "SUPPLIER" })),
              ];
        return list
          .filter(
            (item) =>
              !q ||
              (item.name || "").toLowerCase().includes(q) ||
              (item.contact_person || "").toLowerCase().includes(q) ||
              (item.phone || "").toLowerCase().includes(q),
          )
          .slice(0, 40)
          .map((item) => ({
            id: `cnt-${item.contactType}-${item.id}`,
            type: "CONTACT" as const,
            docTypeLabel: item.contactType === "SUPPLIER" ? "VEN" : "CUS",
            title: item.name,
            subtitle: `${item.contactType} · ${item.contact_person || item.email || "Official Contact"}`,
            meta: item.phone || "No Phone",
            status: item.contactType,
            tone: "slate" as const,
            raw: item,
          }));
      }

      case "FINANCE": {
        const rev =
          financeAnalytics?.summary?.total_revenue_realized ||
          Math.round(
            (financeAnalytics?.summary?.total_received || 0) * (100 / 112),
          );
        const ar = financeAnalytics?.summary?.total_receivable || 0;
        const cogs =
          financeAnalytics?.summary?.total_material_cogs ||
          financeAnalytics?.summary?.total_cogs ||
          0;
        const grossProfit = Math.max(0, rev - cogs);
        const finRows = [
          {
            id: "fin-rev",
            type: "FINANCE_METRIC" as const,
            docTypeLabel: "FIN",
            title: "Realized Net Revenue (DPP)",
            subtitle: "Verified client collections",
            meta: formatIDR(rev),
            status: "REALIZED",
            tone: "emerald" as const,
            raw: {
              name: "Realized Net Revenue (DPP)",
              category: "Revenue",
              amount: rev,
              note: "Net revenue excluding VAT from verified client payments.",
            },
          },
          {
            id: "fin-ar",
            type: "FINANCE_METRIC" as const,
            docTypeLabel: "AR",
            title: "Accounts Receivable (AR)",
            subtitle: "Outstanding client invoices",
            meta: formatIDR(ar),
            status: ar > 0 ? "OPEN" : "CLEAR",
            tone: ar > 0 ? ("amber" as const) : ("emerald" as const),
            raw: {
              name: "Accounts Receivable (AR)",
              category: "Receivables",
              amount: ar,
              note: "Total unpaid invoice balance across active customer accounts.",
            },
          },
          {
            id: "fin-cogs",
            type: "FINANCE_METRIC" as const,
            docTypeLabel: "COGS",
            title: "Direct Material COGS",
            subtitle: "Production material cost",
            meta: formatIDR(cogs),
            status: "BOOKED",
            tone: "slate" as const,
            raw: {
              name: "Direct Material COGS",
              category: "Cost of Goods",
              amount: cogs,
              note: "Accumulated raw material and procurement costs.",
            },
          },
          {
            id: "fin-gp",
            type: "FINANCE_METRIC" as const,
            docTypeLabel: "GP",
            title: "Estimated Gross Margin",
            subtitle: "Net Revenue minus Material COGS",
            meta: formatIDR(grossProfit),
            status: "MARGIN",
            tone: "emerald" as const,
            raw: {
              name: "Estimated Gross Margin",
              category: "Profitability",
              amount: grossProfit,
              note: "Operating margin before overhead and general expenses.",
            },
          },
        ];
        return finRows.filter(
          (r) =>
            !q ||
            r.title.toLowerCase().includes(q) ||
            r.subtitle.toLowerCase().includes(q),
        );
      }

      case "PROJECTS":
      default:
        return projects
          .filter(
            (item) =>
              !q ||
              (item.name || "").toLowerCase().includes(q) ||
              (item.id || "").toLowerCase().includes(q) ||
              (item.customer || "").toLowerCase().includes(q),
          )
          .map((item) => ({
            id: `proj-${item.id}`,
            type: "PROJECT" as const,
            docTypeLabel: "PRJ",
            title: item.name,
            subtitle: `${item.id} · ${item.customer || "Internal"}`,
            meta: item.due_date ? `Due ${item.due_date}` : "Active",
            status: item.urgency || item.status || "ACTIVE",
            tone:
              item.urgency === "CRITICAL" || item.urgency === "URGENT"
                ? ("rose" as const)
                : ("slate" as const),
            raw: item,
          }));
    }
  }, [
    activeCategory,
    searchQuery,
    subFilter,
    pendingPRs,
    unapprovedPOs,
    pendingQuotations,
    unapprovedDeliveries,
    quotations,
    purchaseRequests,
    purchaseOrders,
    inventory,
    deliveries,
    role,
    vendors,
    customers,
    financeAnalytics,
    projects,
  ]);

  return (
    <div className="space-y-4 pb-8">
      {/* Segmented Mode Switcher: Home Overview vs Role Action Hub */}
      <div className="bg-stone-200/80 p-1 rounded-2xl grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => setActiveMode("HOME")}
          className={cn(
            "min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
            activeMode === "HOME"
              ? "bg-white text-stone-900 shadow-xs"
              : "text-stone-600 hover:text-stone-900",
          )}
        >
          <Sparkles className="w-3.5 h-3.5 text-stone-700" />
          <span>Overview</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveMode("ROLE_HUB")}
          className={cn(
            "min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer",
            activeMode === "ROLE_HUB"
              ? "bg-white text-stone-900 shadow-xs"
              : "text-stone-600 hover:text-stone-900",
          )}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-600" />
          <span>{profile.hubLabelEn}</span>
          {isManager && totalPendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-mono font-extrabold leading-none">
              {totalPendingApprovalsCount}
            </span>
          )}
        </button>
      </div>

      {activeMode === "HOME" ? (
        <MobileHomeDashboard
          role={role}
          isExecutive={isExecutive}
          isManager={isManager}
          user={user}
          profile={profile}
          isLoading={isLoading}
          fetchMonitorData={fetchMonitorData}
          setActiveMode={setActiveMode}
          setSelectedCategory={setSelectedCategory}
          openDesktopNotice={openDesktopNotice}
          kpiCards={kpiCards}
          totalPendingApprovalsCount={totalPendingApprovalsCount}
          pendingPRs={pendingPRs}
          unapprovedPOs={unapprovedPOs}
          pendingQuotations={pendingQuotations}
          unapprovedDeliveries={unapprovedDeliveries}
          projects={projects}
          openInspector={openInspector}
        />
      ) : (
        <MobileRoleActionHub
          role={role}
          isExecutive={isExecutive}
          user={user}
          profile={profile}
          isLoading={isLoading}
          fetchMonitorData={fetchMonitorData}
          hubCategories={hubCategories}
          activeCategory={activeCategory}
          setSelectedCategory={setSelectedCategory}
          subFilter={subFilter}
          setSubFilter={setSubFilter}
          setSearchParams={setSearchParams}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          isFilterSheetOpen={isFilterSheetOpen}
          setIsFilterSheetOpen={setIsFilterSheetOpen}
          hubItems={hubItems}
          openInspector={openInspector}
          totalPendingApprovalsCount={totalPendingApprovalsCount}
          pendingPRsCount={pendingPRs.length}
          unapprovedPOsCount={unapprovedPOs.length}
          pendingQuotationsCount={pendingQuotations.length}
          unapprovedDeliveriesCount={unapprovedDeliveries.length}
          purchaseRequestsCount={purchaseRequests.length}
          purchaseOrdersCount={purchaseOrders.length}
        />
      )}

      <MobileInspectorSheet
        selectedItem={selectedItem}
        setSelectedItem={setSelectedItem}
        user={user}
        isManager={isManager}
        enteredPin={enteredPin}
        setEnteredPin={setEnteredPin}
        showPinHint={showPinHint}
        setShowPinHint={setShowPinHint}
        isActionSubmitting={isActionSubmitting}
        revisionNote={revisionNote}
        setRevisionNote={setRevisionNote}
        showRevisionInput={showRevisionInput}
        setShowRevisionInput={setShowRevisionInput}
        handleAuthorizePR={handleAuthorizePR}
        handleRevisePR={handleRevisePR}
        handleAuthorizePO={handleAuthorizePO}
        handleRevisePO={handleRevisePO}
        handleAuthorizeQuotation={handleAuthorizeQuotation}
        handleReviseQuotation={handleReviseQuotation}
        handleAuthorizeDelivery={handleAuthorizeDelivery}
        handleReviseDelivery={handleReviseDelivery}
        openDesktopNotice={openDesktopNotice}
        navigate={navigate}
      />
    </div>
  );
};

