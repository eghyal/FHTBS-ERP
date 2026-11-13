import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  QrCode,
  ScanBarcode,
  AlertTriangle,
  Package,
  CheckCircle2,
  Activity,
  Layers,
  RefreshCw,
  Cpu,
  ShieldAlert,
  Send,
  Camera,
  Check,
  AlertOctagon,
  MapPin,
  WifiOff,
  Search,
  Wrench,
  Clock,
  FileText,
} from "lucide-react";
import {
  PageHeader,
  StatCard,
  Card,
  CardHeader,
  SegmentedTabs,
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  EmptyState,
} from "@/components/ui";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { WotGenealogyModal } from "@/components/erp/production/GenealogyModal";
import { ScannerModal } from "@/components/shared/ScannerModal";
import { useOfflineSyncStore } from "@/stores/offlineSyncStore";

type TerminalTabId = "SCAN" | "FR" | "NDP" | "DASHBOARD";

export function ShopFloorTerminal() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TerminalTabId>("SCAN");

  // SCAN TAB STATE
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scannedWot, setScannedWot] = useState<any>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [goodQty, setGoodQty] = useState<number>(0);
  const [rejectQty, setRejectQty] = useState<number>(0);
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmittingCompletion, setIsSubmittingCompletion] = useState(false);
  const [transferGateInfo, setTransferGateInfo] = useState<any>(null);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [terminalStationId, setTerminalStationId] = useState<string>("");
  const [stations, setStations] = useState<any[]>([]);
  const [showGenealogyModal, setShowGenealogyModal] = useState(false);

  // FLOOR REQUEST STATE
  const [frType, setFrType] = useState<string>("MATERIAL");
  const [frCategory, setFrCategory] = useState<string>("URGENT");
  const [frTitle, setFrTitle] = useState("");
  const [frDesc, setFrDesc] = useState("");
  const [frQty, setFrQty] = useState("");
  const [frUnit, setFrUnit] = useState("PCS");
  const [frMachineId, setFrMachineId] = useState("");
  const [frPhotoUrl, setFrPhotoUrl] = useState("");
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [isSubmittingFr, setIsSubmittingFr] = useState(false);
  const [closingFrId, setClosingFrId] = useState<string | null>(null);

  // NDP STATE
  const [ndpCategory, setNdpCategory] = useState("MACHINE_BREAKDOWN");
  const [ndpMachineId, setNdpMachineId] = useState("");
  const [ndpSeverity, setNdpSeverity] = useState("HIGH");
  const [ndpDesc, setNdpDesc] = useState("");
  const [isSubmittingNdp, setIsSubmittingNdp] = useState(false);
  const [activeNdps, setActiveNdps] = useState<any[]>([]);

  // DASHBOARD / FLEET STATE
  const [machines, setMachines] = useState<any[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [fleetSearch, setFleetSearch] = useState("");
  const [fleetStatusFilter, setFleetStatusFilter] = useState<string>("ALL");

  // OFFLINE SYNC STORE
  const {
    isOffline,
    syncQueue,
    isSyncing,
    setOfflineStatus,
    loadQueue,
    queueRequest,
    syncPendingRequests,
  } = useOfflineSyncStore();

  useEffect(() => {
    loadQueue();
    const handleOnline = () => {
      setOfflineStatus(false);
      showToast("Online: Syncing pending shop floor logs...", "success");
    };
    const handleOffline = () => {
      setOfflineStatus(true);
      showToast("Offline Mode Active. Operator logs will be queued.", "error");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOfflineStatus, showToast, loadQueue]);

  // Load Floor Requests, Active NDPs, Machine Fleet, and Stations
  const loadTerminalData = useCallback(async () => {
    if (isOffline) return;
    const toArray = (val: any, fallbackKey?: string): any[] => {
      if (Array.isArray(val)) return val;
      if (Array.isArray(val?.data)) return val.data;
      if (fallbackKey && Array.isArray(val?.[fallbackKey])) return val[fallbackKey];
      if (fallbackKey && Array.isArray(val?.data?.[fallbackKey])) return val.data[fallbackKey];
      if (Array.isArray(val?.data?.data)) return val.data.data;
      return [];
    };
    try {
      setLoadingDashboard(true);
      const [frRes, ndpRes, machRes, stationRes]: any = await Promise.all([
        apiFetch("/api/floor-requests?limit=20"),
        apiFetch("/api/production/ndp/active"),
        apiFetch("/api/setup-master/machines/availability"),
        apiFetch("/api/production/stations/list"),
      ]);
      if (frRes?.ok) setMyRequests(toArray(frRes, "requests"));
      if (ndpRes?.ok) setActiveNdps(toArray(ndpRes, "ndps"));
      if (machRes?.ok) setMachines(toArray(machRes, "machines"));
      if (stationRes?.ok) setStations(toArray(stationRes, "stations"));
    } catch (e) {
      console.error("Error loading terminal data", e);
    } finally {
      setLoadingDashboard(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadTerminalData();
  }, [loadTerminalData]);

  // Execute WOT Scan
  const executeScan = async (codeToScan: string) => {
    if (!codeToScan.trim()) return;

    if (isOffline) {
      showToast("Offline Mode: Validating WOT scan locally...", "success");
      setScannedWot({
        id: "offline-" + Date.now(),
        lot_number: codeToScan.trim(),
        qty: 1,
        process_name: "Offline Process",
        machine_code: "N/A",
      });
      setGoodQty(1);
      setRejectQty(0);
      setScanError(null);
      return;
    }

    try {
      setIsScanning(true);
      setTransferGateInfo(null);
      setScanError(null);

      const res: any = await apiFetch("/api/wots/scan", {
        method: "POST",
        body: JSON.stringify({
          qr_payload: codeToScan.trim(),
          device_info: "ShopFloorTerminal Workspace",
          station_id: terminalStationId || undefined,
        }),
      });
      const bodyData = res?.data && typeof res.data === "object" ? res.data : res;
      const wotObj = bodyData?.wot || res?.wot;
      const isValid = bodyData?.is_valid ?? res?.is_valid;

      if (res.ok && isValid && wotObj) {
        setScannedWot(wotObj);
        setGoodQty(wotObj.qty || 1);
        setRejectQty(0);
        setScanError(null);
        showToast(
          bodyData?.message || res.message || `WOT [${wotObj.lot_number}] scanned & verified!`,
          "success",
        );
      } else if (wotObj && !isValid) {
        const blockReason =
          bodyData?.message ||
          res.message ||
          "WOT validation blocked by machine lockdown or station constraint.";
        setScanError(blockReason);
        setScannedWot(null);
        showToast(blockReason, "error");
      } else {
        const errorMsg =
          bodyData?.message ||
          bodyData?.error ||
          res.message ||
          res.error ||
          "WOT not found or invalid QR code format";
        setScanError(errorMsg);
        setScannedWot(null);
        showToast(errorMsg, "error");
      }
    } catch (err: any) {
      const msg = err.message || "Failed to scan QR code";
      setScanError(msg);
      showToast(msg, "error");
      setScannedWot(null);
    } finally {
      setIsScanning(false);
    }
  };

  const handleProcessScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    executeScan(scanInput);
  };

  const handleCameraScan = (code: string) => {
    setShowCameraScanner(false);
    setScanInput(code);
    executeScan(code);
  };

  // Confirm WOT Completion
  const handleConfirmCompletion = async () => {
    if (!scannedWot) return;
    try {
      setIsSubmittingCompletion(true);
      const payload = {
        wot_id: scannedWot.id,
        good_units: goodQty,
        reject_units: rejectQty,
        reject_reason: rejectReason,
        user_name: "Shop Floor Operator",
        device_info: "ShopFloorTerminal Workspace",
      };

      if (isOffline) {
        await queueRequest("/api/wots/confirm-completion", "POST", payload);
        showToast("Offline Mode: WOT Completion queued for sync.", "success");
        setScannedWot(null);
        setScanInput("");
        return;
      }

      const res: any = await apiFetch("/api/wots/confirm-completion", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const bodyData = res?.data && typeof res.data === "object" ? res.data : res;

      if (res.ok || bodyData?.success || res.success) {
        showToast("WOT Process marked as COMPLETED & Logged!", "success");
        setTransferGateInfo({
          success: true,
          next_station:
            bodyData?.wot?.station_name || res.wot?.station_name || "Next Workstation",
          gate_status: bodyData?.gate_status || res.gate_status || "TRANSFER_GATE_OPEN",
          completed_lot: scannedWot.lot_number,
        });
        setScannedWot(null);
        setScanInput("");
        loadTerminalData();
      } else {
        throw new Error(bodyData?.error || res.error || "Failed to complete process");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingCompletion(false);
    }
  };

  // Submit Floor Request
  const handleSubmitFloorRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!frTitle.trim()) {
      showToast("Please enter a title for the request", "error");
      return;
    }

    try {
      setIsSubmittingFr(true);
      const payload = {
        type: frType,
        category: frCategory,
        title: frTitle.trim(),
        description: frDesc.trim(),
        qty_required: frQty ? Number(frQty) : null,
        unit: frUnit,
        machine_id: frMachineId || undefined,
        photo_urls: frPhotoUrl.trim() ? [frPhotoUrl.trim()] : [],
        requested_by: "Operator Terminal",
        auto_pr: frType === "MATERIAL",
      };

      if (isOffline) {
        await queueRequest("/api/floor-requests", "POST", payload);
        showToast("Offline Mode: Floor Request queued for sync.", "success");
        setFrTitle("");
        setFrDesc("");
        setFrQty("");
        setFrPhotoUrl("");
        return;
      }

      const res: any = await apiFetch("/api/floor-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const bodyData = res?.data && typeof res.data === "object" ? res.data : res;

      if (res.ok || bodyData?.success || res.success) {
        const reqCode =
          bodyData?.request_code || bodyData?.data?.request_code || res.request_code || "FR";
        showToast(
          bodyData?.message || res.message || `Floor Request [${reqCode}] submitted!`,
          "success",
        );
        setFrTitle("");
        setFrDesc("");
        setFrQty("");
        setFrPhotoUrl("");
        loadTerminalData();
      } else {
        throw new Error(bodyData?.error || res.error || "Failed to submit request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingFr(false);
    }
  };

  // Close / Confirm Receipt of Floor Request
  const handleCloseFloorRequest = async (requestId: string) => {
    try {
      setClosingFrId(requestId);
      const payload = { closed_by: "Operator Terminal" };

      if (isOffline) {
        await queueRequest(`/api/floor-requests/${requestId}/close`, "POST", payload);
        showToast("Offline Mode: Floor Request closure queued for sync.", "success");
        return;
      }

      const res: any = await apiFetch(`/api/floor-requests/${requestId}/close`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const bodyData = res?.data && typeof res.data === "object" ? res.data : res;
      if (res.ok || bodyData?.success || res.success) {
        showToast(
          bodyData?.message || res.message || "Material receipt verified and request closed!",
          "success",
        );
        loadTerminalData();
      } else {
        throw new Error(bodyData?.error || res.error || "Failed to close request");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setClosingFrId(null);
    }
  };

  // Submit NDP / Incident
  const handleSubmitNDP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ndpDesc.trim()) {
      showToast("Please provide breakdown / incident details", "error");
      return;
    }

    try {
      setIsSubmittingNdp(true);
      const payload = {
        machine_id: ndpMachineId || undefined,
        reason_category: ndpCategory,
        reason_detail: ndpDesc,
        severity: ndpSeverity,
        reported_by: "Operator Terminal",
      };

      if (isOffline) {
        await queueRequest("/api/production/ndp", "POST", payload);
        showToast("Offline Mode: NDP Trigger queued for sync.", "success");
        setNdpDesc("");
        setNdpMachineId("");
        return;
      }

      const res: any = await apiFetch("/api/production/ndp", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const bodyData = res?.data && typeof res.data === "object" ? res.data : res;

      if (res.ok || bodyData?.success || res.success) {
        showToast("NDP Triggered! Asset & workstation locked down.", "success");
        setNdpDesc("");
        setNdpMachineId("");
        loadTerminalData();
      } else {
        throw new Error(bodyData?.error || res.error || "Failed to trigger NDP");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSubmittingNdp(false);
    }
  };

  // Normalized Arrays & Derived Metrics
  const safeStations = useMemo(() => (Array.isArray(stations) ? stations : []), [stations]);
  const safeMachines = useMemo(() => (Array.isArray(machines) ? machines : []), [machines]);
  const safeRequests = useMemo(() => (Array.isArray(myRequests) ? myRequests : []), [myRequests]);
  const safeNdps = useMemo(() => (Array.isArray(activeNdps) ? activeNdps : []), [activeNdps]);

  const activeStationObj = useMemo(
    () => safeStations.find((st) => String(st.id) === String(terminalStationId)),
    [safeStations, terminalStationId],
  );

  const fleetSummary = useMemo(() => {
    const total = safeMachines.length;
    const broken = safeMachines.filter((m) => m.operational_status === "BROKEN").length;
    const inUse = safeMachines.filter((m) => m.operational_status === "IN_USE").length;
    const available = Math.max(0, total - broken - inUse);
    return { total, available, inUse, broken };
  }, [safeMachines]);

  const openRequestsCount = useMemo(
    () => safeRequests.filter((r) => r.status !== "CLOSED").length,
    [safeRequests],
  );

  const filteredMachines = useMemo(() => {
    const q = fleetSearch.trim().toLowerCase();
    return safeMachines.filter((m) => {
      const status = m.operational_status || "AVAILABLE";
      if (fleetStatusFilter !== "ALL" && status !== fleetStatusFilter) return false;
      if (!q) return true;
      return (
        String(m.item_code || "").toLowerCase().includes(q) ||
        String(m.name || "").toLowerCase().includes(q) ||
        String(m.machine_category || "").toLowerCase().includes(q)
      );
    });
  }, [safeMachines, fleetSearch, fleetStatusFilter]);

  const stationOptions = useMemo(
    () => [
      { value: "", label: "All Stations (Global Floor Scope)" },
      ...safeStations.map((st) => ({
        value: String(st.id),
        label: `${st.station_code ? `[${st.station_code}] ` : ""}${st.station_name}${
          st.project_name ? ` · ${st.project_name}` : ""
        }`,
      })),
    ],
    [safeStations],
  );

  const machineOptions = useMemo(
    () => [
      { value: "", label: "General Station (No Specific Machine)" },
      ...safeMachines.map((m) => ({
        value: String(m.id),
        label: `[${m.item_code}] ${m.name} (${m.machine_category || "MACHINE"})`,
      })),
    ],
    [safeMachines],
  );

  const tabItems = useMemo(
    () => [
      {
        id: "SCAN" as const,
        label: "01. Scan WOT",
        icon: <QrCode />,
        badge: scannedWot ? "ACTIVE" : undefined,
      },
      {
        id: "FR" as const,
        label: "02. Floor Request",
        icon: <Package />,
        count: openRequestsCount > 0 ? openRequestsCount : undefined,
      },
      {
        id: "NDP" as const,
        label: "03. Report NDP",
        icon: <AlertTriangle />,
        count: safeNdps.length > 0 ? safeNdps.length : undefined,
      },
      {
        id: "DASHBOARD" as const,
        label: "04. Fleet Status",
        icon: <Activity />,
        count: safeMachines.length,
      },
    ],
    [scannedWot, openRequestsCount, safeNdps.length, safeMachines.length],
  );

  return (
    <div className="space-y-4 sm:space-y-5 pb-8">
      {/* Standard ERP PageHeader */}
      <PageHeader
        title="Shop Floor Terminal"
        subtitle="WOT barcode verification & station telemetry"
        icon={<ScanBarcode className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isOffline ? (
              <Badge variant="danger" size="md" icon={<WifiOff />}>
                Offline Queue ({syncQueue.length})
              </Badge>
            ) : syncQueue.length > 0 ? (
              <Button
                variant="warning_soft"
                size="sm"
                isLoading={isSyncing}
                leftIcon={<Send />}
                onClick={() => syncPendingRequests()}
              >
                Sync {syncQueue.length} Pending
              </Button>
            ) : (
              <Badge variant="success" size="md" icon={<CheckCircle2 />}>
                Live Synced
              </Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Camera />}
              onClick={() => {
                setActiveTab("SCAN");
                setShowCameraScanner(true);
              }}
            >
              Scan QR Camera
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLoading={loadingDashboard}
              leftIcon={<RefreshCw />}
              onClick={loadTerminalData}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* 4-Column ERP KPI StatCard Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Active Workstation Scope"
          value={
            activeStationObj
              ? activeStationObj.station_code || activeStationObj.station_name
              : "GLOBAL FLOOR"
          }
          subtitle={
            activeStationObj
              ? `${activeStationObj.station_name}${
                  activeStationObj.project_name ? ` · ${activeStationObj.project_name}` : ""
                }`
              : `${safeStations.length} registered workstations`
          }
          icon={<MapPin />}
          variant="emerald"
        />
        <StatCard
          label="Machine Fleet Ready"
          value={`${fleetSummary.available} / ${fleetSummary.total}`}
          subtitle={`${fleetSummary.inUse} in use · ${fleetSummary.broken} halted`}
          icon={<Wrench />}
          variant={fleetSummary.broken > 0 ? "warning" : "info"}
          isLoading={loadingDashboard}
        />
        <StatCard
          label="Open Floor Requests"
          value={openRequestsCount}
          subtitle={`${safeRequests.length} recent requests logged`}
          icon={<Package />}
          variant={openRequestsCount > 0 ? "amber" : "default"}
          isLoading={loadingDashboard}
        />
        <StatCard
          label="Active NDP Lockdowns"
          value={safeNdps.length}
          subtitle={
            safeNdps.length > 0
              ? "Immediate engineering attention required"
              : "Zero active station halts"
          }
          icon={<AlertOctagon />}
          variant={safeNdps.length > 0 ? "danger" : "emerald"}
          isLoading={loadingDashboard}
        />
      </div>

      {/* Unified Toolbar: SegmentedTabs + Workstation Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <SegmentedTabs
          items={tabItems}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TerminalTabId)}
          mobileColumns={2}
        />

        <div className="w-full lg:w-80">
          <Select
            leftIcon={<MapPin />}
            value={terminalStationId}
            onChange={(e) => setTerminalStationId(e.target.value)}
            options={stationOptions}
            aria-label="Filter Active Workstation"
          />
        </div>
      </div>

      {/* TAB 01: SCAN & EXECUTE WOT */}
      {activeTab === "SCAN" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Column: WOT Barcode Scanner & Execution Form */}
          <Card className="lg:col-span-7 space-y-4" padding="lg">
            <CardHeader
              title="Scan Work Order Ticket (WOT)"
              subtitle="Verify barcode/QR lot payload and record step completion yield"
              icon={<QrCode />}
              actions={
                scannedWot ? (
                  <Badge variant="primary" size="md">
                    Ticket Verified
                  </Badge>
                ) : (
                  <Badge variant="neutral" size="sm">
                    Awaiting Scan
                  </Badge>
                )
              }
            />

            <form onSubmit={handleProcessScan} className="flex flex-col sm:flex-row gap-2.5">
              <Input
                autoFocus
                leftIcon={<QrCode />}
                placeholder="Scan QR barcode or enter WOT Lot Number (e.g. WOT-PRJ-...)"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="font-mono tabular-nums"
                wrapperClassName="flex-1"
              />
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  leftIcon={<Camera />}
                  onClick={() => setShowCameraScanner(true)}
                >
                  Camera
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isScanning}
                  disabled={!scanInput.trim()}
                  leftIcon={<Check />}
                >
                  Verify Scan
                </Button>
              </div>
            </form>

            {/* Scan Error Alert Banner */}
            {scanError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                    Scan Verification Blocked
                  </p>
                  <p className="text-xs text-rose-700 leading-relaxed">{scanError}</p>
                </div>
              </div>
            )}

            {/* Transfer Gate Success Notification */}
            {transferGateInfo && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                    {transferGateInfo.gate_status === "FINAL_PRODUCT_READY"
                      ? "Final Product Assembled & Transferred"
                      : "Transfer Gate Unlocked"}
                  </p>
                  <p className="text-xs text-emerald-800">
                    Lot{" "}
                    <span className="font-mono tabular-nums font-bold text-emerald-950">
                      {transferGateInfo.completed_lot}
                    </span>{" "}
                    is cleared for{" "}
                    <span className="font-bold text-emerald-950">
                      {transferGateInfo.next_station}
                    </span>
                    .
                  </p>
                </div>
              </div>
            )}

            {/* Active Scanned WOT Execution Panel */}
            {scannedWot ? (
              <div className="p-4 bg-stone-50/80 border border-stone-200/90 rounded-xl space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-stone-200/80 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                      Active Work Order Ticket
                    </span>
                    <h4 className="text-base font-bold text-stone-900 font-mono tabular-nums">
                      {scannedWot.lot_number}
                    </h4>
                  </div>
                  <Badge variant="outline" size="md" className="font-mono tabular-nums">
                    Target Qty: {scannedWot.qty} {scannedWot.uom || "Unit"}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-stone-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                      Process Step
                    </span>
                    <span className="text-xs font-bold text-stone-900 mt-0.5 block">
                      {scannedWot.process_name || "Standard Step"}
                    </span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-stone-200/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                      Assigned Machine / Asset
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 mt-0.5 block">
                      {scannedWot.machine_code || scannedWot.effective_machine_id
                        ? `[${scannedWot.machine_code || "MCH"}] ${scannedWot.machine_name || ""}`
                        : "Manual Station Bench"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-stone-200/80 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block">
                    Yield & Quality Verification
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      label="Good Units (OK)"
                      type="number"
                      min={0}
                      max={scannedWot.qty}
                      value={goodQty}
                      onChange={(e) => setGoodQty(Number(e.target.value))}
                      className="font-mono tabular-nums font-bold text-emerald-800 bg-emerald-50/40 border-emerald-300"
                    />
                    <Input
                      label="Reject Units (NG)"
                      type="number"
                      min={0}
                      value={rejectQty}
                      onChange={(e) => setRejectQty(Number(e.target.value))}
                      className="font-mono tabular-nums font-bold text-rose-800 bg-rose-50/40 border-rose-300"
                    />
                  </div>
                  {rejectQty > 0 && (
                    <Input
                      label="Reject / Scrap Reason"
                      placeholder="Specify defect cause (e.g. dimensional out-of-tolerance, surface scratch)..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<Layers />}
                    onClick={() => setShowGenealogyModal(true)}
                  >
                    Travel Log
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setScannedWot(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    isLoading={isSubmittingCompletion}
                    leftIcon={<Check />}
                    onClick={handleConfirmCompletion}
                  >
                    Confirm & Release Gate
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<QrCode className="w-6 h-6" />}
                title="Ready for WOT Barcode Scan"
                description="Scan a Work Order Ticket barcode using a handheld scanner, webcam, or manual lot entry above to inspect step requirements and log production yield."
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Camera />}
                    onClick={() => setShowCameraScanner(true)}
                  >
                    Open Camera Scanner
                  </Button>
                }
              />
            )}
          </Card>

          {/* Right Column: Station Context & Active Alerts */}
          <div className="lg:col-span-5 space-y-4">
            <Card padding="lg" className="space-y-3">
              <CardHeader
                title="Workstation Interlock Protocol"
                subtitle="Standardized execution & quality gate rules"
                icon={<FileText />}
              />
              <div className="space-y-2.5 text-xs text-stone-600">
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-900">01. First Article Inspection (FAI)</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Step #1 WOT completion requires an approved FAI record in Process QC.
                    </p>
                  </div>
                  <Badge variant="primary" size="sm">
                    ENFORCED
                  </Badge>
                </div>
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-900">02. Machine NDP Lockdown Gate</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Scanning a WOT assigned to a BROKEN machine automatically blocks execution.
                    </p>
                  </div>
                  <Badge variant="primary" size="sm">
                    ENFORCED
                  </Badge>
                </div>
                <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-stone-900">03. Sequential Transfer Gate</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Completing a step unlocks the downstream workstation in the BOP route.
                    </p>
                  </div>
                  <Badge variant="primary" size="sm">
                    ENFORCED
                  </Badge>
                </div>
              </div>
            </Card>

            <Card padding="lg" className="space-y-3">
              <CardHeader
                title="Active NDP Halts"
                subtitle="Workstations or assets currently locked down"
                icon={<AlertOctagon />}
                actions={
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setActiveTab("NDP")}
                  >
                    Report NDP
                  </Button>
                }
              />
              {safeNdps.length === 0 ? (
                <p className="text-xs text-stone-500 py-4 text-center">
                  All workstations and machines are operating normally.
                </p>
              ) : (
                <div className="space-y-2">
                  {safeNdps.slice(0, 4).map((ndp, idx) => (
                    <div
                      key={ndp.id || idx}
                      className="p-3 rounded-xl bg-rose-50/70 border border-rose-200/80 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-rose-900 truncate">
                          {ndp.reason_category || "MACHINE_BREAKDOWN"}
                        </p>
                        <p className="text-[11px] text-rose-700 line-clamp-2 mt-0.5">
                          {ndp.reason_detail || ndp.description || "Asset lockdown active"}
                        </p>
                      </div>
                      <Badge variant="danger" size="sm">
                        {ndp.severity || "HIGH"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 02: FLOOR REQUEST (ANDON MATERIAL / TOOL / ASSISTANCE) */}
      {activeTab === "FR" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Create Floor Request Card */}
          <Card className="lg:col-span-5" padding="lg">
            <CardHeader
              title="Create Floor Request"
              subtitle="Request material replenishment, tooling, or QC support"
              icon={<Package />}
            />
            <form onSubmit={handleSubmitFloorRequest} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Request Type"
                  value={frType}
                  onChange={(e) => setFrType(e.target.value)}
                  options={[
                    { value: "MATERIAL", label: "Material Shortage (Auto-PR)" },
                    { value: "TOOL", label: "Tool / Fixture" },
                    { value: "MACHINE", label: "Machine Assistance" },
                    { value: "QC_CHECK", label: "QC Inspection" },
                    { value: "SAFETY", label: "Safety Equipment" },
                    { value: "MAINTENANCE", label: "Maintenance" },
                    { value: "DOCUMENT", label: "Drawing / Revision" },
                    { value: "OTHER", label: "Other Issue" },
                  ]}
                />
                <Select
                  label="Urgency Level"
                  value={frCategory}
                  onChange={(e) => setFrCategory(e.target.value)}
                  options={[
                    { value: "URGENT", label: "Urgent (Line Blocker)" },
                    { value: "NORMAL", label: "Normal Priority" },
                    { value: "LOW", label: "Low Priority" },
                  ]}
                />
              </div>

              <Input
                label="Request Title"
                placeholder="e.g. Need 20 pcs Steel Plate 5mm for Station 2"
                value={frTitle}
                onChange={(e) => setFrTitle(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Quantity Needed"
                  type="number"
                  placeholder="e.g. 20"
                  value={frQty}
                  onChange={(e) => setFrQty(e.target.value)}
                  className="font-mono tabular-nums"
                />
                <Input
                  label="Unit of Measure (UOM)"
                  placeholder="PCS / KG / MTR"
                  value={frUnit}
                  onChange={(e) => setFrUnit(e.target.value)}
                />
              </div>

              <Select
                label="Related Machine / Asset (Optional)"
                value={frMachineId}
                onChange={(e) => setFrMachineId(e.target.value)}
                options={machineOptions}
              />

              <Textarea
                label="Description & Operational Context"
                rows={3}
                placeholder="Provide lot number, station context, or specific part specifications..."
                value={frDesc}
                onChange={(e) => setFrDesc(e.target.value)}
              />

              <Input
                label="Photo Evidence URL (Optional)"
                placeholder="https://..."
                value={frPhotoUrl}
                onChange={(e) => setFrPhotoUrl(e.target.value)}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={isSubmittingFr}
                leftIcon={<Send />}
              >
                Submit Floor Request
              </Button>
            </form>
          </Card>

          {/* Floor Requests History Table */}
          <Card className="lg:col-span-7" padding="lg">
            <CardHeader
              title="Recent Floor Requests"
              subtitle="Live status of shop floor requests and operator receipt confirmation"
              icon={<Clock />}
              actions={
                <Button
                  variant="secondary"
                  size="xs"
                  leftIcon={<RefreshCw />}
                  isLoading={loadingDashboard}
                  onClick={loadTerminalData}
                >
                  Refresh
                </Button>
              }
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code & Type</TableHead>
                  <TableHead>Request Summary</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeRequests.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    message="No active floor requests logged."
                    icon={<Package />}
                  />
                ) : (
                  safeRequests.map((r) => {
                    const isFulfilled = r.status === "FULFILLED" || r.status === "RESOLVED";
                    const isClosed = r.status === "CLOSED";
                    const statusVariant = isClosed
                      ? "neutral"
                      : isFulfilled
                        ? "success"
                        : r.status === "IN_PROGRESS" || r.status === "ACKNOWLEDGED"
                          ? "info"
                          : "warning";

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-mono tabular-nums font-bold text-stone-900 block">
                            {r.request_code || "FR"}
                          </span>
                          <span className="text-[10px] text-stone-500 uppercase font-semibold">
                            {r.type || "MATERIAL"} · {r.category || "NORMAL"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-bold text-stone-900 text-xs">{r.title}</p>
                          {r.description && (
                            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                              {r.description}
                            </p>
                          )}
                          {(r.pr_number || r.auto_pr || r.pr_id) && (
                            <span className="inline-block mt-1 text-[10px] font-mono tabular-nums text-emerald-700 font-semibold">
                              Auto-PR: {r.pr_number || "PR-AUTO"}
                            </span>
                          )}
                          {r.fulfillment_notes && (
                            <p className="text-[10.5px] text-emerald-700 font-medium mt-0.5">
                              Fulfillment: {r.fulfillment_notes}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums whitespace-nowrap">
                          {r.qty_required ? `${r.qty_required} ${r.unit || "PCS"}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant} size="sm">
                            {r.status || "OPEN"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {isFulfilled && !isClosed ? (
                            <Button
                              variant="primary"
                              size="xs"
                              isLoading={closingFrId === r.id}
                              leftIcon={<CheckCircle2 />}
                              onClick={() => handleCloseFloorRequest(r.id)}
                            >
                              Confirm Receipt
                            </Button>
                          ) : (
                            <span className="text-[11px] text-stone-400 font-mono">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* TAB 03: REPORT NDP (NOTICE TO DOWN PROCESS) */}
      {activeTab === "NDP" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Card: Trigger NDP Form */}
          <Card className="lg:col-span-5" padding="lg">
            <CardHeader
              title="Notice to Down Process (NDP)"
              subtitle="Trigger immediate asset lockdown & workstation halt"
              icon={<AlertOctagon />}
            />
            <form onSubmit={handleSubmitNDP} className="space-y-4">
              <Select
                label="Incident Category"
                value={ndpCategory}
                onChange={(e) => setNdpCategory(e.target.value)}
                options={[
                  {
                    value: "MACHINE_BREAKDOWN",
                    label: "Machine Breakdown (Tool / Motor Failure)",
                  },
                  {
                    value: "MATERIAL_SHORTAGE",
                    label: "Critical Material Depletion",
                  },
                  {
                    value: "QUALITY_DEFECT",
                    label: "Major Quality Defect / Scrap Surge",
                  },
                  {
                    value: "POWER_OUTAGE",
                    label: "Power / Facility Interruption",
                  },
                ]}
              />

              <Select
                label="Affected Machine / Asset"
                value={ndpMachineId}
                onChange={(e) => setNdpMachineId(e.target.value)}
                options={machineOptions}
              />

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider select-none">
                  Severity Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["CRITICAL", "HIGH", "MEDIUM"] as const).map((lvl) => (
                    <Button
                      key={lvl}
                      type="button"
                      variant={ndpSeverity === lvl ? "danger" : "secondary"}
                      size="sm"
                      onClick={() => setNdpSeverity(lvl)}
                    >
                      {lvl}
                    </Button>
                  ))}
                </div>
              </div>

              <Textarea
                label="Failure Detail & Symptoms"
                rows={3}
                required
                placeholder="Describe failure symptoms (e.g. spindle overheating, abnormal vibration, hydraulic leak)..."
                value={ndpDesc}
                onChange={(e) => setNdpDesc(e.target.value)}
              />

              <Button
                type="submit"
                variant="danger"
                fullWidth
                isLoading={isSubmittingNdp}
                leftIcon={<AlertTriangle />}
              >
                Trigger NDP & Halt Line
              </Button>
            </form>
          </Card>

          {/* Right Card: Active NDP Lockdowns Table */}
          <Card className="lg:col-span-7" padding="lg">
            <CardHeader
              title="Active Shop Floor NDP Lockdowns"
              subtitle="Live registry of halted machines and process incidents"
              icon={<ShieldAlert />}
              actions={
                <Button
                  variant="secondary"
                  size="xs"
                  leftIcon={<RefreshCw />}
                  isLoading={loadingDashboard}
                  onClick={loadTerminalData}
                >
                  Refresh
                </Button>
              }
            />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Machine / Scope</TableHead>
                  <TableHead>Failure Details</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Reported By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeNdps.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    message="Zero active NDP lockdowns. All lines cleared for operation."
                    icon={<CheckCircle2 />}
                  />
                ) : (
                  safeNdps.map((ndp, idx) => (
                    <TableRow key={ndp.id || idx}>
                      <TableCell className="font-bold text-stone-900 whitespace-nowrap">
                        {ndp.reason_category || "MACHINE_BREAKDOWN"}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-xs whitespace-nowrap">
                        {ndp.machine_code || ndp.machine_name || "General Station"}
                      </TableCell>
                      <TableCell className="text-xs text-stone-600">
                        {ndp.reason_detail || ndp.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ndp.severity === "CRITICAL" ? "danger" : "warning"}
                          size="sm"
                        >
                          {ndp.severity || "HIGH"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-stone-500 whitespace-nowrap">
                        {ndp.reported_by || "Operator"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      {/* TAB 04: MACHINE FLEET & WORKSTATION MATRIX */}
      {activeTab === "DASHBOARD" && (
        <Card padding="lg" className="space-y-4">
          <CardHeader
            title="Machine Fleet & Workstation Matrix"
            subtitle="Real-time operational availability and lock status of shop floor equipment"
            icon={<Activity />}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  leftIcon={<Search />}
                  placeholder="Search code or machine..."
                  value={fleetSearch}
                  onChange={(e) => setFleetSearch(e.target.value)}
                  wrapperClassName="w-48 sm:w-60"
                />
                <Select
                  value={fleetStatusFilter}
                  onChange={(e) => setFleetStatusFilter(e.target.value)}
                  wrapperClassName="w-36 sm:w-44"
                  options={[
                    { value: "ALL", label: "All Statuses" },
                    { value: "AVAILABLE", label: "Available" },
                    { value: "IN_USE", label: "In Use" },
                    { value: "BROKEN", label: "Broken / Halted" },
                  ]}
                />
              </div>
            }
          />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Code</TableHead>
                <TableHead>Machine / Equipment Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Operational Status</TableHead>
                <TableHead className="text-right">Quick Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMachines.length === 0 ? (
                <TableEmpty
                  colSpan={5}
                  message="No machines match the current filter."
                  icon={<Cpu />}
                />
              ) : (
                filteredMachines.map((m) => {
                  const status = m.operational_status || "AVAILABLE";
                  const isBroken = status === "BROKEN";
                  const isInUse = status === "IN_USE";
                  const badgeVariant = isBroken
                    ? "danger"
                    : isInUse
                      ? "info"
                      : "success";

                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono tabular-nums font-bold text-stone-900 whitespace-nowrap">
                        {m.item_code || "MCH"}
                      </TableCell>
                      <TableCell className="font-bold text-stone-900">{m.name}</TableCell>
                      <TableCell className="text-xs text-stone-600 uppercase font-semibold">
                        {m.machine_category || "GENERAL"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant} size="sm" dot>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!isBroken ? (
                          <Button
                            variant="danger_soft"
                            size="xs"
                            leftIcon={<AlertTriangle />}
                            onClick={() => {
                              setNdpMachineId(String(m.id));
                              setActiveTab("NDP");
                            }}
                          >
                            Report Breakdown
                          </Button>
                        ) : (
                          <Badge variant="danger" size="sm">
                            Locked Down
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* WOT Genealogy Travel Log Modal */}
      {showGenealogyModal && scannedWot && (
        <WotGenealogyModal
          isOpen={showGenealogyModal}
          onClose={() => setShowGenealogyModal(false)}
          wot={scannedWot}
        />
      )}

      {/* Live Camera QR Scanner Modal */}
      {showCameraScanner && (
        <ScannerModal
          isOpen={showCameraScanner}
          onClose={() => setShowCameraScanner(false)}
          onScan={handleCameraScan}
        />
      )}
    </div>
  );
}

export default ShopFloorTerminal;
