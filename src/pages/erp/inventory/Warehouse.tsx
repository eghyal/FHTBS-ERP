import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  lazy,
  Suspense,
} from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/utils/api";
import {
  Package,
  Search,
  Filter,
  Plus,
  History,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ShieldCheck,
  Cpu,
  Boxes,
  Wrench,
  Check,
  Layers,
  FileText,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { MachineBopModal } from "@/components/erp/inventory/MachineBopModal";
import { cn, parseCurrency } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { WarehouseLabelModal } from "@/components/erp/inventory/LabelModal";
import { WarehouseIntakeLabelsModal } from "@/components/erp/inventory/IntakeLabelsModal";
import { WarehousePendingGrnTab } from "@/components/erp/inventory/PendingGrnTab";
import { WarehouseReservationsTab } from "@/components/erp/inventory/ReservationsTab";
import { WarehouseHistoryTab } from "@/components/erp/inventory/HistoryTab";
import { WarehouseTerminalTab } from "@/components/erp/inventory/TerminalTab";
import {
  WarehouseStockTable,
  type WarehouseInventoryItem,
} from "@/components/erp/inventory/StockTable";
import { isValidDailyAuthKey } from "@/utils/auth";
import { AuthorizeDocModal } from "@/components/erp/AuthorizeDocModal";
import { useInventoryLocal } from "@/hooks/useInventoryLocal";
import { AddItemModal } from "@/components/erp/inventory/AddItemModal";
import { EditItemModal } from "@/components/erp/inventory/EditItemModal";
import { StockAdjustModal } from "@/components/erp/inventory/StockAdjustModal";

const ScannerModal = lazy(() =>
  import("@/components/shared/ScannerModal").then((m) => ({
    default: m.ScannerModal,
  }))
);

const ASSET_FILTER_OPTIONS = [
  { id: "ALL", label: "All Items / SKUs", icon: Package },
  { id: "RAW", label: "Raw Materials", icon: Boxes },
  { id: "FINISH_GOOD", label: "Finished Goods", icon: ShieldCheck },
  { id: "MACHINE", label: "Machines", icon: Cpu },
  { id: "TOOL", label: "Tools", icon: Wrench },
  { id: "CONSUMABLE", label: "Consumables", icon: CheckCircle2 },
  { id: "SPAREPART", label: "Spareparts", icon: Settings2 },
];

export default function Warehouse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "STOCK" | "HISTORY" | "TERMINAL" | "PENDING" | "RESERVATIONS"
  >("STOCK");
  const [terminalMenu, setTerminalMenu] = useState<"CONSUMPTION" | "DISPATCH">(
    "CONSUMPTION"
  );
  const [draftDeliveries, setDraftDeliveries] = useState<any[]>([]);
  const [showUploadDnModal, setShowUploadDnModal] = useState(false);
  const [selectedDn, setSelectedDn] = useState<any>(null);

  const { user } = useAuth();
  const { showToast } = useToast();
  const isWarehouseFullAccess =
    user?.role === "WAREHOUSE" || hasGodMode(user);
  const isQaQcUser = user?.role === "QA_QC" && !hasGodMode(user);
  const isEngineeringRestricted =
    user?.role === "ENGINEERING" && !hasGodMode(user);
  const isSalesRestricted =
    user?.role === "SALES" && !hasGodMode(user);
  const isRestrictedStockOnly = !isWarehouseFullAccess && !isQaQcUser;

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "PENDING" &&
      (isWarehouseFullAccess || isQaQcUser)
    ) {
      setActiveTab("PENDING");
    } else if (isRestrictedStockOnly && activeTab !== "STOCK") {
      setActiveTab("STOCK");
    }
  }, [searchParams, isWarehouseFullAccess, isQaQcUser, isRestrictedStockOnly, activeTab]);

  const {
    inventory: localInventory,
    isLoading,
    refreshCloud,
  } = useInventoryLocal(user);
  const inventory = (localInventory || []) as unknown as WarehouseInventoryItem[];

  const [movements, setMovements] = useState<any[]>([]);
  const [movementPage, setMovementPage] = useState(0);
  const [totalMovements, setTotalMovements] = useState(0);
  const [pendingGrns, setPendingGrns] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reservations, setReservations] = useState<any[]>([]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] =
    useState<WarehouseInventoryItem | null>(null);
  const [itemToEdit, setItemToEdit] = useState<any>(null);

  // Confirm Modal States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    action: () => {},
  });

  // Consumption State
  const [consumeStep, setConsumeStep] = useState<
    "IDLE" | "SELECT_ITEM" | "CONSUME" | "SUCCESS"
  >("IDLE");
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [consumeQty, setConsumeQty] = useState("1");
  const [transactionDirection, setTransactionDirection] = useState<
    "WITHDRAW" | "RETURN"
  >("WITHDRAW");
  const [recordedBy, setRecordedBy] = useState("");
  const [activeProjectBOM, setActiveProjectBOM] = useState<any[]>([]);

  // Labels State
  const [showItemLabelsModal, setShowItemLabelsModal] = useState(false);
  const [manpowerRoster, setManpowerRoster] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({
    item_code: "FG - ",
    name: "",
    uom: "PCS",
    type: "FINISH_GOOD",
    dimension: "",
    spec: "",
    item_type: "MATERIAL",
    machine_category: "",
    assigned_operator: "",
    serial_number: "",
    manufacturer: "",
    bypass_multi_station: false,
  });

  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("STOCK_TAKE");
  const [adjustName, setAdjustName] = useState("");
  const [adjustUom, setAdjustUom] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedLabelItem, setSelectedLabelItem] = useState<any>(null);

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [showMachineBopModal, setShowMachineBopModal] = useState(false);
  const [selectedMachineForBop, setSelectedMachineForBop] = useState<any>(null);

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("ALL");
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Strict Tab Guard: Engineering & Sales roles without God Mode can only access Inventory Master & Balances (STOCK)
  useEffect(() => {
    if (isRestrictedStockOnly && activeTab !== "STOCK") {
      setActiveTab("STOCK");
    }
  }, [isRestrictedStockOnly, activeTab]);

  // Handle deep-link from Engineering BOM or Sales Quotation to open Register SKU modal
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    const openRegisterParam = searchParams.get("openRegister");
    const prefillNameParam = searchParams.get("prefillName");
    const prefillTypeParam = searchParams.get("prefillType");

    if (tabParam === "STOCK" && activeTab !== "STOCK") {
      setActiveTab("STOCK");
    }

    if (openRegisterParam === "1") {
      const targetType = isSalesRestricted
        ? "FINISH_GOOD"
        : prefillTypeParam
          ? prefillTypeParam
          : isEngineeringRestricted
            ? "RAW"
            : "FINISH_GOOD";

      setNewItem((prev) => ({
        ...prev,
        type: targetType,
        name: prefillNameParam ? prefillNameParam : prev.name,
      }));
      setShowAddModal(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("openRegister");
      nextParams.delete("prefillName");
      nextParams.delete("prefillType");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, activeTab, isSalesRestricted, isEngineeringRestricted]);

  const handleScanSuccess = useCallback(
    async (val: string) => {
      try {
        let parsed: any;
        try {
          parsed = JSON.parse(val);
        } catch {
          const found = inventory.find(
            (i) =>
              i.item_code === val.trim().toUpperCase() || i.id === val.trim()
          );
          if (found) {
            parsed = { id: found.id, code: found.item_code };
          } else {
            showToast(`Unknown code: ${val.trim()}`, "error");
            return;
          }
        }

        if (parsed && (parsed.id || parsed.code)) {
          const item = inventory.find(
            (i) => i.id === parsed.id || i.item_code === parsed.code
          );
          if (item) {
            setSelectedItem(item);
            setConsumeStep("CONSUME");
            setConsumeQty(parsed.qty ? parsed.qty.toString() : "1");
            setSearchQuery("");
            setIsScannerOpen(false);
            if (parsed.po) {
              try {
                const response = await apiFetch(
                  `/api/warehouse/item-allocation-info?po_number=${encodeURIComponent(
                    parsed.po
                  )}&item_id=${item.id}`,
                  {},
                  user?.username
                );
                const data = response.data;
                if (data?.projects?.length > 0)
                  setSelectedProject(data.projects[0]);
              } catch (err) {
                console.error(err);
              }
            }
          } else {
            showToast("Item not found in inventory.", "error");
          }
        }
      } catch {
        showToast("Scan error.", "error");
      }
    },
    [inventory, showToast, user?.username]
  );

  // Core badge & active tab data fetcher (on-demand per tab)
  const fetchInventory = useCallback(async () => {
    try {
      refreshCloud();

      const tasks: Promise<void>[] = [];

      if (!isRestrictedStockOnly) {
        tasks.push(
          apiFetch("/api/warehouse/pending-incoming", {}, user?.username).then(
            (pendingData) => {
              if (pendingData.ok) {
                setPendingGrns(
                  Array.isArray(pendingData.data) ? pendingData.data : []
                );
              }
            }
          ),
          apiFetch("/api/sales/deliveries", {}, user?.username).then(
            (draftDnData) => {
              if (draftDnData.ok) {
                const allDns = Array.isArray(draftDnData.data)
                  ? draftDnData.data
                  : [];
                setDraftDeliveries(
                  allDns.filter((d: any) => d.status === "AUTHORIZED")
                );
              }
            }
          )
        );
      }

      if (activeTab === "HISTORY" || activeTab === "TERMINAL") {
        tasks.push(
          apiFetch(
            `/api/inventory/movements?limit=100&offset=${movementPage * 100}`,
            {},
            user?.username
          ).then((movData) => {
            if (movData.ok) {
              if (movData.data?.movements) {
                setMovements(movData.data.movements);
                setTotalMovements(movData.data.total || 0);
              } else if (Array.isArray(movData.data)) {
                setMovements(movData.data);
                setTotalMovements(movData.data.length);
              }
            }
          })
        );
      }

      if (activeTab === "TERMINAL") {
        tasks.push(
          apiFetch("/api/projects", {}, user?.username).then((projData) => {
            if (projData.ok) {
              setProjects(Array.isArray(projData.data) ? projData.data : []);
            }
          })
        );
      }

      if (activeTab === "RESERVATIONS") {
        tasks.push(
          apiFetch("/api/inventory/reservations", {}, user?.username).then(
            (resvData) => {
              if (resvData.ok) {
                const list = Array.isArray(resvData.data)
                  ? resvData.data
                  : Array.isArray(resvData.data?.data)
                    ? resvData.data.data
                    : [];
                setReservations(list);
              }
            }
          )
        );
      }

      await Promise.all(tasks);
    } catch (err) {
      console.error(err);
    }
  }, [activeTab, movementPage, refreshCloud, user?.username]);

  // Lazy-fetch manpower roster only when Add/Edit item modal is opened
  useEffect(() => {
    if ((showAddModal || showEditModal) && manpowerRoster.length === 0) {
      apiFetch("/api/production/manpower", {}, user?.username).then(
        (mpData) => {
          if (mpData.ok) {
            const mpList = Array.isArray(mpData.data)
              ? mpData.data
              : Array.isArray((mpData.data as any)?.data)
                ? (mpData.data as any).data
                : [];
            setManpowerRoster(mpList);
          }
        }
      );
    }
  }, [showAddModal, showEditModal, manpowerRoster.length, user?.username]);

  useEffect(() => {
    if (selectedProject) {
      apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then(
        (res) => {
          if (res.ok) setActiveProjectBOM(res.data.bom || []);
        }
      );
    } else {
      setActiveProjectBOM([]);
    }
  }, [selectedProject, user?.username]);

  const [intakeLabels, setIntakeLabels] = useState<any[]>([]);
  const [intakePoNumber, setIntakePoNumber] = useState("");
  const [intakeSupplierName, setIntakeSupplierName] = useState("");
  const [intakeGrnId, setIntakeGrnId] = useState("");
  const [intakeReceivedDate, setIntakeReceivedDate] = useState("");

  const handleOpenPoLabelFromHistory = useCallback((mov: any) => {
    setIntakeLabels([
      {
        id: mov.id || `LBL-${Date.now().toString(36).toUpperCase()}`,
        item_id: mov.item_id,
        item_code: mov.item_code,
        name: mov.item_name,
        qty: Math.abs(mov.qty || 0),
        uom: mov.uom || "PCS",
        project_id: mov.project_id,
        po_number: mov.po_number,
        supplier_name: mov.supplier_name,
        grn_id: mov.reference_id,
      },
    ]);
    setIntakePoNumber(mov.po_number || "PO-REF");
    setIntakeSupplierName(mov.supplier_name || "Partner Supplier");
    setIntakeGrnId(mov.reference_id || "-");
    setIntakeReceivedDate(mov.created_at || new Date().toISOString());
    setShowItemLabelsModal(true);
  }, []);

  const handleReturnGrn = useCallback(
    async (grnId: string) => {
      setIsSubmitting(true);
      try {
        const res = await apiFetch(
          "/api/warehouse/return-grn",
          {
            method: "POST",
            body: JSON.stringify({
              grn_id: grnId,
              recorded_by: user?.username || "SYSTEM",
            }),
          },
          user?.username
        );
        if (res.ok) {
          showToast(
            "GRN items successfully marked as returned / rejected",
            "info"
          );
          fetchInventory();
        } else {
          showToast(res.error || "Failed to return GRN", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error returning GRN items", "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchInventory, showToast, user?.username]
  );

  const handleUpdateGrnQcStatus = useCallback(
    async (grnId: string, qcStatus: string) => {
      try {
        const res = await apiFetch(
          `/api/purchasing/grn/${grnId}/qc-inspect`,
          {
            method: "POST",
            body: JSON.stringify({ qc_status: qcStatus }),
          },
          user?.username
        );
        if (res.ok) {
          showToast(`GRN QC status updated to ${qcStatus}`, "success");
          fetchInventory();
        } else {
          showToast(res.error || "Failed to update GRN QC status", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Failed to update GRN QC status", "error");
      }
    },
    [fetchInventory, showToast, user?.username]
  );

  const handleIntakeGrn = useCallback(
    async (grnId: string) => {
      setIsSubmitting(true);
      try {
        const res = await apiFetch(
          "/api/warehouse/intake-grn",
          {
            method: "POST",
            body: JSON.stringify({
              grn_id: grnId,
              recorded_by: user?.username || "SYSTEM",
            }),
          },
          user?.username
        );
        if (res.ok) {
          const data = res.data;
          showToast("GRN items successfully intaken into inventory!", "success");
          fetchInventory();
          if (data.labels && data.labels.length > 0) {
            setIntakeLabels(data.labels);
            setIntakePoNumber(data.po_number || "");
            setIntakeSupplierName(data.supplier_name || "");
            setIntakeGrnId(data.grn_id || grnId);
            setIntakeReceivedDate(
              data.received_date || new Date().toISOString()
            );
            setShowItemLabelsModal(true);
          }
        } else {
          showToast(res.error || "Failed to intake GRN", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error processing intake", "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchInventory, showToast, user?.username]
  );

  const handleAllocateReservation = useCallback(
    async (reservationId: string) => {
      setIsSubmitting(true);
      try {
        const res = await apiFetch(
          `/api/warehouse/reservations/${reservationId}/allocate`,
          {
            method: "POST",
            body: JSON.stringify({
              recorded_by: user?.username || "WAREHOUSE_STAFF",
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(
            res.data.message || "Free stock allocated to project reservation!",
            "success"
          );
          fetchInventory();
        } else {
          showToast(
            res.error || res.data?.error || "Failed to allocate free stock",
            "error"
          );
        }
      } catch (err: any) {
        showToast(err.message || "Error allocating reservation", "error");
      } finally {
        setIsSubmitting(false);
      }
    },
    [fetchInventory, showToast, user?.username]
  );

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    if (user?.username) setRecordedBy(user.username);
  }, [user]);

  const [isUploadingDn, setIsUploadingDn] = useState(false);

  const handleUploadDispatch = async (submittedPin: string) => {
    if (!selectedDn) return showToast("Select a delivery note first", "error");
    if (!isValidDailyAuthKey(user?.username, submittedPin)) {
      showToast("Validation Failed: Invalid Authorization PIN.", "error");
      return;
    }
    setIsUploadingDn(true);
    try {
      const digitalSignature = `Digitally Authorized for Dispatch by ${
        user?.name || user?.username
      } (${user?.role}) on ${new Date().toISOString()}`;

      const res = await apiFetch(
        `/api/sales/deliveries/${selectedDn.id}/upload-dispatch`,
        {
          method: "POST",
          body: JSON.stringify({ file_url: digitalSignature }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          "Dispatch confirmed. Digital authorization complete.",
          "success"
        );
        setShowUploadDnModal(false);
        setSelectedDn(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed", "error");
      }
    } catch {
      showToast("Error processing digital authorization", "error");
    } finally {
      setIsUploadingDn(false);
    }
  };

  const handleConsume = async () => {
    if (!selectedItem || !consumeQty) return;
    setIsSubmitting(true);
    try {
      const endpoint =
        transactionDirection === "RETURN"
          ? "/api/inventory/return"
          : "/api/inventory/consume";
      const res = await apiFetch(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            item_id: selectedItem.id,
            qty: Number(consumeQty),
            project_id: selectedProject || null,
            recorded_by: recordedBy || user?.username || "WAREHOUSE_STAFF",
          }),
        },
        user?.username
      );
      if (res.ok) {
        setConsumeStep("SUCCESS");
        fetchInventory();
        if (selectedProject) {
          apiFetch(`/api/projects/${selectedProject}`, {}, user?.username).then(
            (projRes) => {
              if (projRes.ok) setActiveProjectBOM(projRes.data.bom || []);
            }
          );
        }
        showToast(
          `Item ${
            transactionDirection === "RETURN" ? "returned" : "consumed"
          } successfully`,
          "success"
        );
      } else {
        showToast(
          res.error ||
            `Failed to ${
              transactionDirection === "RETURN" ? "return" : "consume"
            } item. Check stock level.`,
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      showToast(
        `Error ${
          transactionDirection === "RETURN" ? "returning" : "consuming"
        } item`,
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && consumeStep === "SUCCESS") {
        setConsumeStep("IDLE");
        setSelectedItem(null);
        setConsumeQty("1");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [consumeStep]);

  const handleDeleteItem = useCallback(
    (id: string, itemCode: string) => {
      setConfirmModal({
        isOpen: true,
        title: `Delete SKU: ${itemCode}?`,
        message: `Are you sure you want to permanently delete item ${itemCode} from the master inventory? This action cannot be undone.`,
        action: async () => {
          try {
            const res = await apiFetch(
              `/api/items/${id}`,
              { method: "DELETE" },
              user?.username
            );
            if (res.ok) {
              showToast(`Item ${itemCode} deleted successfully`, "success");
              fetchInventory();
            } else {
              showToast(res.error || "Failed to delete item", "error");
            }
          } catch (err) {
            console.error(err);
            showToast("Error deleting item", "error");
          }
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        },
      });
    },
    [fetchInventory, showToast, user?.username]
  );

  const handleOpenEditItem = useCallback((item: WarehouseInventoryItem) => {
    setItemToEdit({
      ...item,
      bypass_multi_station:
        item.bypass_multi_station === 1 || item.bypass_multi_station === true,
    });
    setShowEditModal(true);
  }, []);

  const handleOpenBopModal = useCallback((item: WarehouseInventoryItem) => {
    setSelectedMachineForBop(item);
    setShowMachineBopModal(true);
  }, []);

  const handleOpenLabelModal = useCallback((item: WarehouseInventoryItem) => {
    setSelectedLabelItem(item);
    setShowLabelModal(true);
  }, []);

  const handleOpenAdjustModal = useCallback((item: WarehouseInventoryItem) => {
    setSelectedItem(item);
    setAdjustQty((item.free_stock ?? 0).toString());
    setAdjustName(item.name || "");
    setAdjustUom(item.uom || "");
    setAdjustReason("STOCK_TAKE");
    setShowAdjustModal(true);
  }, []);

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;
    setIsSubmitting(true);
    try {
      const price =
        typeof itemToEdit.unit_price === "string"
          ? parseCurrency(itemToEdit.unit_price)
          : itemToEdit.unit_price;

      const payload = {
        ...itemToEdit,
        unit_price: price || 0,
        bypass_multi_station: itemToEdit.bypass_multi_station ? 1 : 0,
      };

      const res = await apiFetch(
        `/api/items/${itemToEdit.id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        user?.username
      );

      if (res.ok) {
        showToast(
          `Item ${itemToEdit.item_code} updated successfully`,
          "success"
        );
        setShowEditModal(false);
        setItemToEdit(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed to update item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating item", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddItem = async (e?: React.FormEvent | any) => {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    const itemToSubmit =
      e && typeof e === "object" && e.item_code ? e : newItem;

    if (!itemToSubmit.item_code || !itemToSubmit.name || !itemToSubmit.uom) {
      showToast(
        "SKU Code, Item Name, and Unit of Measure (UOM) are required",
        "error"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const bypass_reason = itemToSubmit.bypass_reason;
      const defaultCategory =
        itemToSubmit.type === "FINISH_GOOD" || itemToSubmit.type === "FINISHED"
          ? "Paving & Precast"
          : "General";

      const payload = {
        ...itemToSubmit,
        unit_price: 0,
        selling_price: 0,
        category: defaultCategory,
      };
      delete payload.bypass_reason;

      const res = await apiFetch(
        "/api/items",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        user?.username
      );

      if (res.ok) {
        const assignedCode = (res.data as any)?.item_code || payload.item_code;
        showToast(`Item ${assignedCode} added successfully`, "success");
        setShowAddModal(false);
        setNewItem({
          item_code: "",
          name: "",
          uom: "PCS",
          type: "FINISH_GOOD",
          dimension: "",
          spec: "",
          item_type: "MATERIAL",
          machine_category: "",
          assigned_operator: "",
          serial_number: "",
          manufacturer: "",
          bypass_multi_station: false,
        });

        if (
          payload.type === "MACHINE" &&
          payload.bypass_multi_station &&
          bypass_reason
        ) {
          apiFetch("/api/production-logger/logs", {
            method: "POST",
            body: JSON.stringify({
              log_type: "BYPASS_AUDIT",
              machine_id: (res.data as any)?.id || (res as any).id,
              details: {
                action: "MACHINE_REGISTERED_WITH_BYPASS",
                reason: bypass_reason,
              },
              user_id: user?.username,
              user_role: "SUPERVISOR",
            }),
          });
        }

        fetchInventory();
      } else {
        showToast(res.error || "Failed to add item", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adding item", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/inventory/adjust-v2",
        {
          method: "POST",
          body: JSON.stringify({
            item_id: selectedItem.id,
            new_free_stock: Number(adjustQty),
            reason: adjustReason,
            username: user?.username || "Warehouse Staff",
            item_name: adjustName || undefined,
            uom: adjustUom || undefined,
          }),
        },
        user?.username
      );
      if (res.ok) {
        showToast("Stock & master data updated successfully", "success");
        setShowAdjustModal(false);
        setAdjustQty("");
        setAdjustReason("STOCK_TAKE");
        setAdjustName("");
        setAdjustUom("");
        setSelectedItem(null);
        fetchInventory();
      } else {
        showToast(res.error || "Failed to adjust stock", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adjusting stock", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Single-pass O(N) computation for all inventory category counts & stock alerts
  const inventoryStats = useMemo(() => {
    let fgCount = 0;
    let mcCount = 0;
    let rawCount = 0;
    let consumableCount = 0;
    let lowStockCount = 0;
    let zeroStockCount = 0;

    for (let idx = 0; idx < inventory.length; idx++) {
      const i = inventory[idx];
      const code = (i.item_code || "").toUpperCase();
      const cat = (i.category || "").toUpperCase();
      const isFg =
        i.type === "FINISH_GOOD" ||
        i.type === "FINISHED" ||
        code.startsWith("FG - ") ||
        code.startsWith("FG-");
      const isMc =
        i.type === "MACHINE" ||
        i.item_type === "MACHINE" ||
        Boolean(i.machine_category) ||
        code.startsWith("MC - ") ||
        code.startsWith("MC-") ||
        cat.includes("MACHIN");
      const isConsumable =
        i.type === "CONSUMABLE" ||
        cat === "CONSUMABLE" ||
        code.startsWith("CS - ") ||
        code.startsWith("CS-");
      const isRaw =
        !isFg &&
        !isMc &&
        !isConsumable &&
        (i.type === "RAW" ||
          cat === "RAW" ||
          code.startsWith("RW - ") ||
          code.startsWith("RW-") ||
          code.startsWith("RM - ") ||
          code.startsWith("RM-"));

      if (isFg) fgCount++;
      if (isMc) mcCount++;
      if (isRaw) rawCount++;
      if (isConsumable) consumableCount++;

      if (!isMc) {
        const free = i.free_stock ?? 0;
        if (free < 5) lowStockCount++;
        if (free === 0) zeroStockCount++;
      }
    }

    return {
      fgCount,
      mcCount,
      rawCount,
      consumableCount,
      lowStockCount,
      zeroStockCount,
    };
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return inventory.filter((item) => {
      const matchesQuery =
        !query ||
        (item.item_code && item.item_code.toLowerCase().includes(query)) ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.spec && item.spec.toLowerCase().includes(query)) ||
        (item.dimension && item.dimension.toLowerCase().includes(query)) ||
        (item.machine_category &&
          item.machine_category.toLowerCase().includes(query));

      if (!matchesQuery) return false;
      if (selectedTypeFilter === "ALL") return true;

      const code = (item.item_code || "").toUpperCase();
      const cat = (item.category || "").toUpperCase();
      if (selectedTypeFilter === "MACHINE") {
        return (
          item.type === "MACHINE" ||
          item.item_type === "MACHINE" ||
          Boolean(item.machine_category) ||
          code.startsWith("MC - ") ||
          code.startsWith("MC-") ||
          cat.includes("MACHIN")
        );
      }
      if (selectedTypeFilter === "FINISH_GOOD") {
        return (
          item.type === "FINISH_GOOD" ||
          item.type === "FINISHED" ||
          code.startsWith("FG - ") ||
          code.startsWith("FG-")
        );
      }
      if (selectedTypeFilter === "CONSUMABLE") {
        return (
          item.type === "CONSUMABLE" ||
          cat === "CONSUMABLE" ||
          code.startsWith("CS - ") ||
          code.startsWith("CS-")
        );
      }
      if (selectedTypeFilter === "SPAREPART") {
        return (
          item.type === "SPAREPART" ||
          cat === "SPAREPART" ||
          code.startsWith("SP - ") ||
          code.startsWith("SP-")
        );
      }
      if (selectedTypeFilter === "TOOL") {
        return (
          item.type === "TOOL" ||
          cat === "TOOL" ||
          code.startsWith("TL - ") ||
          code.startsWith("TL-")
        );
      }
      if (selectedTypeFilter === "RAW") {
        return (
          (item.type === "RAW" ||
            cat === "RAW" ||
            code.startsWith("RW - ") ||
            code.startsWith("RW-") ||
            code.startsWith("RM - ") ||
            code.startsWith("RM-")) &&
          !code.startsWith("CS") &&
          !code.startsWith("SP") &&
          !code.startsWith("TL")
        );
      }
      return item.type === selectedTypeFilter || cat === selectedTypeFilter;
    });
  }, [inventory, searchQuery, selectedTypeFilter]);

  return (
    <div className="space-y-5 pb-20 animate-in fade-in duration-300">
      <PageHeader
        title={
          isRestrictedStockOnly
            ? "Inventory Balances"
            : "Warehouse & Inventory"
        }
        subtitle="Stock balances & movement ledger"
        icon={<Package className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              disabled={!user}
              onClick={() => {
                if (isSalesRestricted) {
                  setNewItem((prev) => ({ ...prev, type: "FINISH_GOOD" }));
                } else if (isEngineeringRestricted) {
                  setNewItem((prev) => ({ ...prev, type: "RAW" }));
                }
                setShowAddModal(true);
              }}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Register SKU
            </Button>
          </div>
        }
      />

      {/* Search & Tabs */}
      <div className="card-elegant rounded-xl sm:rounded-2xl overflow-hidden">
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2 bg-white border-b border-stone-200/80">
          <div className="flex items-center flex-nowrap gap-1 bg-stone-100 p-1 rounded-lg sm:rounded-xl border border-stone-200/70 overflow-x-auto scrollbar-hide shrink-0">
            {[
              { id: "STOCK", label: "Inventory Master & Balances" },
              { id: "PENDING", label: "Material Intake" },
              { id: "TERMINAL", label: "Terminal OPS" },
              { id: "HISTORY", label: "Movement Logs" },
              { id: "RESERVATIONS", label: "Project Allocations" },
            ]
              .filter((tab) => {
                if (isWarehouseFullAccess) {
                  return true;
                }
                return tab.id === "STOCK";
              })
              .map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-2.5 xl:px-3 py-1.5 text-[11px] font-bold transition-all rounded-lg relative tracking-wide uppercase whitespace-nowrap shrink-0",
                    activeTab === tab.id
                      ? "bg-white shadow-2xs text-stone-900 border border-stone-200/80"
                      : "text-stone-500 hover:text-stone-900 border border-transparent"
                  )}
                >
                  {tab.label}
                  {tab.id === "PENDING" && pendingGrns.length > 0 && (
                    <span className="ml-1.5 bg-emerald-600 text-white rounded-md px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold">
                      {pendingGrns.length}
                    </span>
                  )}
                  {tab.id === "TERMINAL" && draftDeliveries.length > 0 && (
                    <span className="ml-1.5 bg-amber-600 text-white rounded-md px-1.5 py-0.5 text-[9px] font-mono tabular-nums font-bold">
                      {draftDeliveries.length}
                    </span>
                  )}
                </button>
              ))}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 relative shrink-0 justify-between sm:justify-end w-full lg:w-auto">
            {activeTab === "STOCK" && (
              <div className="relative shrink-0" ref={filterDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                  className={cn(
                    "h-9 flex items-center gap-1.5 bg-white px-2.5 py-1.5 border rounded-lg shrink-0 shadow-2xs transition-all text-[10px] sm:text-[11px] font-bold uppercase tracking-wide cursor-pointer active:scale-95 whitespace-nowrap",
                    isFilterDropdownOpen
                      ? "border-stone-900 text-stone-900 ring-2 ring-stone-900/5"
                      : "border-stone-200 hover:border-stone-300 text-stone-700"
                  )}
                >
                  <Filter className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="font-bold tracking-wide truncate max-w-[110px] sm:max-w-none">
                    {ASSET_FILTER_OPTIONS.find(
                      (o) => o.id === selectedTypeFilter
                    )?.label || "All Items"}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 text-stone-400 transition-transform duration-200 shrink-0",
                      isFilterDropdownOpen && "rotate-180 text-stone-900"
                    )}
                  />
                </button>

                {isFilterDropdownOpen && (
                  <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-52 bg-white border border-stone-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 mb-1">
                      Filter Category
                    </div>
                    {ASSET_FILTER_OPTIONS.map((opt) => {
                      const isSelected = selectedTypeFilter === opt.id;
                      const Icon = opt.icon;
                      const count =
                        opt.id === "ALL"
                          ? inventory.length
                          : opt.id === "FINISH_GOOD"
                            ? inventoryStats.fgCount
                            : opt.id === "MACHINE"
                              ? inventoryStats.mcCount
                              : opt.id === "RAW"
                                ? inventoryStats.rawCount
                                : opt.id === "CONSUMABLE"
                                  ? inventoryStats.consumableCount
                                  : opt.id === "SPAREPART"
                                    ? inventory.filter((i) => {
                                        const code = (i.item_code || "").toUpperCase();
                                        const cat = (i.category || "").toUpperCase();
                                        return i.type === "SPAREPART" || cat === "SPAREPART" || code.startsWith("SP - ") || code.startsWith("SP-");
                                      }).length
                                    : opt.id === "TOOL"
                                      ? inventory.filter((i) => {
                                          const code = (i.item_code || "").toUpperCase();
                                          const cat = (i.category || "").toUpperCase();
                                          return i.type === "TOOL" || cat === "TOOL" || code.startsWith("TL - ") || code.startsWith("TL-");
                                        }).length
                                      : inventory.filter((i) => i.type === opt.id)
                                          .length;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setSelectedTypeFilter(opt.id);
                            setIsFilterDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer",
                            isSelected
                              ? "bg-emerald-50 text-emerald-900 font-bold"
                              : "text-stone-700 hover:bg-stone-100 font-medium"
                          )}
                        >
                          <span className="flex items-center gap-2.5">
                            <Icon
                              className={cn(
                                "w-3.5 h-3.5",
                                isSelected ? "text-emerald-700" : "text-stone-400"
                              )}
                            />
                            <span>{opt.label}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums",
                                isSelected
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-stone-100 text-stone-600"
                              )}
                            >
                              {count}
                            </span>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 sm:flex-initial sm:w-44 xl:w-48 min-w-0">
              <Input
                type="text"
                placeholder="Search SKU, item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
                className="h-9 text-xs py-1.5"
              />
            </div>
            <Button
              variant="secondary"
              size="icon"
              onClick={fetchInventory}
              title="Refresh"
            >
              <History className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div>
          {activeTab === "STOCK" ? (
            <WarehouseStockTable
              isLoading={isLoading}
              items={filteredInventory}
              user={user}
              onOpenBopModal={handleOpenBopModal}
              onOpenLabelModal={handleOpenLabelModal}
              onOpenAdjustModal={handleOpenAdjustModal}
              onOpenEditModal={handleOpenEditItem}
              onDeleteItem={handleDeleteItem}
            />
          ) : activeTab === "HISTORY" ? (
            <WarehouseHistoryTab
              movements={movements}
              movementPage={movementPage}
              totalMovements={totalMovements}
              setMovementPage={setMovementPage}
              setSelectedLabelItem={setSelectedLabelItem}
              setShowLabelModal={setShowLabelModal}
              onOpenPoLabel={handleOpenPoLabelFromHistory}
            />
          ) : activeTab === "TERMINAL" ? (
            <WarehouseTerminalTab
              terminalMenu={terminalMenu}
              setTerminalMenu={setTerminalMenu}
              consumeStep={consumeStep}
              setConsumeStep={setConsumeStep}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleScanSuccess={handleScanSuccess}
              setIsScannerOpen={setIsScannerOpen}
              selectedItem={selectedItem}
              setSelectedItem={setSelectedItem}
              consumeQty={consumeQty}
              setConsumeQty={setConsumeQty}
              recordedBy={recordedBy}
              setRecordedBy={setRecordedBy}
              transactionDirection={transactionDirection}
              setTransactionDirection={setTransactionDirection}
              projects={projects}
              selectedProject={selectedProject}
              setSelectedProject={setSelectedProject}
              activeProjectBOM={activeProjectBOM}
              isSubmitting={isSubmitting}
              handleConsume={handleConsume}
              draftDeliveries={draftDeliveries}
              setSelectedDn={setSelectedDn}
              setShowUploadDnModal={setShowUploadDnModal}
              setConfirmModal={setConfirmModal}
              movements={movements}
              inventory={inventory}
            />
          ) : activeTab === "RESERVATIONS" ? (
            <WarehouseReservationsTab
              reservations={reservations}
              onAllocateReservation={handleAllocateReservation}
            />
          ) : activeTab === "PENDING" ? (
            <WarehousePendingGrnTab
              pendingGrns={pendingGrns}
              handleReturnGrn={handleReturnGrn}
              handleIntakeGrn={handleIntakeGrn}
              canInspectQc={
                hasGodMode(user) || hasPermission(user, Action.INSPECT_QC)
              }
              canCommitIntake={
                hasGodMode(user) ||
                hasPermission(user, Action.RECEIVE_PO) ||
                hasPermission(user, Action.WAREHOUSE_ACTION)
              }
              onUpdateQcStatus={handleUpdateGrnQcStatus}
            />
          ) : null}
        </div>
      </div>

      {/* PO Intake Labels Modal */}
      <WarehouseIntakeLabelsModal
        isOpen={showItemLabelsModal}
        onClose={() => setShowItemLabelsModal(false)}
        intakeLabels={intakeLabels}
        intakePoNumber={intakePoNumber}
        intakeSupplierName={intakeSupplierName}
        intakeGrnId={intakeGrnId}
        intakeReceivedDate={intakeReceivedDate}
      />

      {/* Register Item Modal */}
      <AddItemModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        newItem={newItem}
        setNewItem={setNewItem}
        onSubmit={handleAddItem}
        isSubmitting={isSubmitting}
        existingItems={inventory}
        manpowerRoster={manpowerRoster}
        user={user}
      />

      {/* Edit Item Modal */}
      <EditItemModal
        isOpen={showEditModal && !!itemToEdit}
        onClose={() => {
          setShowEditModal(false);
          setItemToEdit(null);
        }}
        editItem={itemToEdit}
        setEditItem={setItemToEdit}
        onSubmit={handleUpdateItem}
        isSubmitting={isSubmitting}
        existingItems={inventory}
        manpowerRoster={manpowerRoster}
        user={user}
      />

      {/* Stock Adjustment Modal */}
      <StockAdjustModal
        isOpen={showAdjustModal}
        onClose={() => {
          setShowAdjustModal(false);
          setSelectedItem(null);
        }}
        selectedItem={selectedItem}
        adjustName={adjustName}
        setAdjustName={setAdjustName}
        adjustUom={adjustUom}
        setAdjustUom={setAdjustUom}
        adjustQty={adjustQty}
        setAdjustQty={setAdjustQty}
        adjustReason={adjustReason}
        setAdjustReason={setAdjustReason}
        onSubmit={handleAdjustStock}
        isSubmitting={isSubmitting}
      />

      {/* Item QR Label Modal */}
      <WarehouseLabelModal
        isOpen={showLabelModal}
        onClose={() => setShowLabelModal(false)}
        selectedLabelItem={selectedLabelItem}
      />

      {/* Machine BOP Integration Modal */}
      <MachineBopModal
        isOpen={showMachineBopModal}
        onClose={() => setShowMachineBopModal(false)}
        machine={selectedMachineForBop}
        onSuccess={refreshCloud}
      />

      {/* Upload DN Modal */}
      <AuthorizeDocModal
        isOpen={showUploadDnModal && !!selectedDn}
        onClose={() => setShowUploadDnModal(false)}
        docType="Dispatch Logistics Note"
        subtitle="Terminal OPS Dispatch Validation"
        docNumber={selectedDn?.dn_number || ""}
        partnerName={selectedDn?.customer_name}
        projectName={selectedDn?.project_name || "Non-Project"}
        isSubmitting={isUploadingDn}
        onAuthorize={handleUploadDispatch}
      />

      {/* ConfirmModal rendering */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.action}
        onCancel={() =>
          setConfirmModal((prev) => ({ ...prev, isOpen: false }))
        }
      />

      {isScannerOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/50">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
          }
        >
          <ScannerModal
            isOpen={isScannerOpen}
            onScan={handleScanSuccess}
            onClose={() => setIsScannerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
