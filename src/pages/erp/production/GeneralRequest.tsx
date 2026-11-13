import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { apiFetch } from "@/utils/api";
import { ClipboardList } from "lucide-react";
import { generatePDF } from "@/lib/pdfGenerator";
import { cn, isFinishGoodItem } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useShare } from "@/contexts/ShareContext";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAutoSave } from "@/hooks/useAutoSave";
import {
  ERP_DEPARTMENT_OPTIONS,
  getDepartmentLabel,
  normalizeDepartmentToRole,
} from "@/constants/rbac";
import { OngoingRequestsSection } from "@/components/erp/production/general/OngoingRequestsSection";
import { GeneralRequestModals } from "@/components/erp/production/general/GeneralRequestModals";
import {
  GeneralRequestMaterialSection,
  type GeneralRequestBomRow as BomRow,
} from "@/components/erp/production/general/GeneralRequestMaterialSection";

const CATEGORY_MAP: Record<string, { labelId: string; labelEn: string }> = {
  MAINTENANCE: { labelId: "Maintenance & Plant", labelEn: "Maintenance & Plant" },
  TOOLING: { labelId: "Tooling & Moulds", labelEn: "Tooling & Moulds" },
  RND: { labelId: "R&D & Lab Trial", labelEn: "R&D & Lab Trial" },
  CONSUMABLE: { labelId: "Consumables & Safety", labelEn: "Consumables & Safety" },
  INFRASTRUCTURE: { labelId: "Infrastructure & GA", labelEn: "Infrastructure & GA" },
  SPECIAL_DESIGN: { labelId: "Custom Design / Prototype", labelEn: "Custom Design / Prototype" },
};

function defaultExpectedDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

export default function GeneralRequest() {
  const printRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const [prs, setPrs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Form Generation States (Auto-saved like Design Requests)
  const {
    data: selectedDepartment,
    setData: setSelectedDepartment,
  } = useAutoSave<string>("general_req_department", "PRODUCTION");
  const {
    data: selectedCategory,
    setData: setSelectedCategory,
  } = useAutoSave<string>("general_req_category", "MAINTENANCE");
  const {
    data: requestTitle,
    setData: setRequestTitle,
    clearDraft: clearRequestTitle,
  } = useAutoSave<string>("general_req_title", "");
  const {
    data: drawingReference,
    setData: setDrawingReference,
    clearDraft: clearDrawingReference,
  } = useAutoSave<string>("general_req_drawing_ref", "");
  const {
    data: bomRows,
    setData: setBomRows,
    clearDraft: clearBomDraft,
  } = useAutoSave<BomRow[]>("general_req_bom_rows", [
    {
      id: "row-1",
      item_id: "",
      item_code: "",
      name: "",
      dimension: "",
      spec: "",
      qty: "1",
      uom: "PCS",
      unit_price: "0",
      free_stock: 0,
      shortage_qty: 1,
      qty_to_order: 1,
      expected_date: defaultExpectedDate(),
      notFound: false,
      is_custom: true,
    },
  ]);

  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [urgency, setUrgency] = useState<"NORMAL" | "URGENT" | "CRITICAL">("NORMAL");
  const [isChecking, setIsChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);

  // BOM-style Registry Search Modal States
  const [searchModal, setSearchModal] = useState<{
    isOpen: boolean;
    rowId: string | null;
  }>({ isOpen: false, rowId: null });
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // e-Approval & Revision Modal States
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [selectedPrToAuth, setSelectedPrToAuth] = useState<any>(null);
  const [revisingPr, setRevisingPr] = useState<any>(null);
  const [previewPrData, setPreviewPrData] = useState<any>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"FORM" | "ONGOING">("FORM");

  const { user } = useAuth();
  const { showToast } = useToast();
  const { shareToForum } = useShare();

  const nonFgInventoryItems = useMemo(() => {
    return inventoryItems.filter((item) => !isFinishGoodItem(item));
  }, [inventoryItems]);

  const fetchPrs = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/purchasing/prs?scope=GENERAL", {}, user?.username);
      if (res.ok) {
        setPrs(Array.isArray(res.data) ? res.data : []);
      } else {
        showToast(res.error || "Failed to fetch General PRs", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error fetching General PRs", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Master Warehouse Items SSOT (/api/items with /api/inventory fallback)
  const fetchInventory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/items", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        setInventoryItems(res.data);
        return;
      }
      const invRes = await apiFetch("/api/inventory", {}, user?.username);
      if (invRes.ok && Array.isArray(invRes.data)) {
        setInventoryItems(invRes.data);
      }
    } catch (err) {
      console.error("GeneralRequest: Failed to fetch warehouse items", err);
    }
  }, [user?.username]);

  useEffect(() => {
    fetchPrs();
    fetchInventory();
  }, [fetchInventory]);

  // Auto-refresh Non-FG catalog when returning from Warehouse / Inventory Master tab or window (identical to Engineering BOM)
  useEffect(() => {
    const handleFocusOrVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchInventory();
      }
    };
    window.addEventListener("focus", handleFocusOrVisibility);
    document.addEventListener("visibilitychange", handleFocusOrVisibility);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisibility);
      document.removeEventListener("visibilitychange", handleFocusOrVisibility);
    };
  }, [fetchInventory]);

  // Auto-enrich and lock rows with Master Warehouse item details whenever nonFgInventoryItems are available or updated
  useEffect(() => {
    if (nonFgInventoryItems.length === 0 || bomRows.length === 0) return;
    setBomRows((prevRows) => {
      let hasChanges = false;
      const updated = prevRows.map((r) => {
        if (!r.item_code || r.item_code.trim() === "") return r;
        const cleanCode = r.item_code.trim().toUpperCase();
        const matched = nonFgInventoryItems.find(
          (i) =>
            (r.item_id && (i.id === r.item_id || i.item_id === r.item_id)) ||
            (i.item_code && i.item_code.trim().toUpperCase() === cleanCode),
        );
        if (matched) {
          const masterId = matched.id || matched.item_id;
          const masterCode = matched.item_code || r.item_code;
          const masterName = matched.name || matched.item_name || "";
          const masterDim = matched.dimension || "";
          const masterSpec = matched.spec || "";
          const masterUom = matched.uom || "PCS";
          const ssotPrice = String(
            matched.ssot_unit_price ?? matched.unit_price ?? r.unit_price ?? 0,
          );
          const freeStock = Number(matched.free_stock ?? matched.quantity ?? 0);
          const reqQty = Math.max(1, Number(r.qty) || 1);
          const shortage = Math.max(0, reqQty - freeStock);

          if (
            r.item_id !== masterId ||
            r.item_code !== masterCode ||
            r.name !== masterName ||
            r.dimension !== masterDim ||
            r.spec !== masterSpec ||
            r.uom !== masterUom ||
            r.unit_price !== ssotPrice ||
            r.free_stock !== freeStock ||
            r.shortage_qty !== shortage ||
            r.notFound
          ) {
            hasChanges = true;
            return {
              ...r,
              item_id: masterId,
              item_code: masterCode,
              name: masterName,
              dimension: masterDim,
              spec: masterSpec,
              uom: masterUom,
              unit_price: ssotPrice,
              free_stock: freeStock,
              shortage_qty: shortage,
              qty_to_order: shortage,
              notFound: false,
            };
          }
        }
        return r;
      });
      return hasChanges ? updated : prevRows;
    });
  }, [nonFgInventoryItems, setBomRows]);

  // Registry Search Modal Effect (instant local filter + backend search fallback, strictly Non-FG SSOT)
  useEffect(() => {
    if (!searchModal.isOpen) return;
    const q = searchTerm.trim().toLowerCase();
    if (!q) {
      // Show top 30 Non-FG items by default when modal opens so user can browse immediately
      setSearchResults(nonFgInventoryItems.slice(0, 30));
      return;
    }

    // Instant local match by SKU code, name, dimension, or spec
    const localMatches = nonFgInventoryItems.filter((item) => {
      const code = String(item.item_code || "").toLowerCase();
      const name = String(item.name || item.item_name || "").toLowerCase();
      const dim = String(item.dimension || "").toLowerCase();
      const spec = String(item.spec || "").toLowerCase();
      return (
        code.includes(q) ||
        name.includes(q) ||
        dim.includes(q) ||
        spec.includes(q)
      );
    });
    setSearchResults(localMatches.slice(0, 50));

    if (q.length < 2) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await apiFetch(
          `/api/items/search?q=${encodeURIComponent(searchTerm.trim())}`,
          {},
          user?.username,
        );
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res)
            ? res
            : [];
        if (list.length > 0) {
          const nonFgList = list.filter((i: any) => !isFinishGoodItem(i));
          setSearchResults(nonFgList);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchTerm, searchModal.isOpen, nonFgInventoryItems, user?.username]);

  const selectItemFromSearch = (item: any) => {
    if (!searchModal.rowId) return;
    if (isFinishGoodItem(item)) {
      showToast(
        "General Request hanya diperuntukkan bagi item Non-Finished Goods (SSOT).",
        "error",
      );
      return;
    }
    const freeStock = Number(item.free_stock ?? item.quantity ?? 0);
    const ssotPrice = Number(item.ssot_unit_price ?? item.unit_price ?? 0);

    setBomRows((prev) =>
      prev.map((r) => {
        if (r.id !== searchModal.rowId) return r;
        const reqQty = Math.max(1, Number(r.qty) || 1);
        const shortage = Math.max(0, reqQty - freeStock);
        return {
          ...r,
          item_id: item.id || item.item_id,
          item_code: item.item_code || "",
          name: item.name || item.item_name || "",
          dimension: item.dimension || "",
          spec: item.spec || "",
          uom: item.uom || "PCS",
          unit_price: String(ssotPrice),
          free_stock: freeStock,
          shortage_qty: shortage,
          qty_to_order: shortage,
          expected_date: r.expected_date || defaultExpectedDate(),
          notFound: false,
        };
      }),
    );
    setHasChecked(false);
    setSearchModal({ isOpen: false, rowId: null });
    setSearchTerm("");
  };

  // BOM-style updateRow handler with instant local SKU match + debounced API lookup
  const updateRow = useCallback(
    (id: string, field: keyof BomRow, value: string) => {
      if (field === "qty") {
        setBomRows((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const nextQty = Math.max(1, Number(value) || 1);
            const freeStock = Number(r.free_stock || 0);
            const shortage = Math.max(0, nextQty - freeStock);
            return {
              ...r,
              qty: value,
              shortage_qty: shortage,
              qty_to_order: shortage,
            };
          }),
        );
        setHasChecked(false);
        return;
      }

      if (field !== "item_code") {
        setBomRows((prev) =>
          prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
        );
        return;
      }

      const val = value.toUpperCase();
      const cleanCode = val.trim().toUpperCase();

      if (searchTimerRef.current[id]) {
        clearTimeout(searchTimerRef.current[id]);
        delete searchTimerRef.current[id];
      }

      // 1. Instant local match against preloaded Non-FG warehouse items
      const matchedItem = nonFgInventoryItems.find(
        (i) => i.item_code && i.item_code.trim().toUpperCase() === cleanCode,
      );

      if (matchedItem) {
        const freeStock = Number(matchedItem.free_stock ?? matchedItem.quantity ?? 0);
        const ssotPrice = Number(
          matchedItem.ssot_unit_price ?? matchedItem.unit_price ?? 0,
        );
        setBomRows((prev) =>
          prev.map((r) => {
            if (r.id !== id) return r;
            const reqQty = Math.max(1, Number(r.qty) || 1);
            const shortage = Math.max(0, reqQty - freeStock);
            return {
              ...r,
              item_code: matchedItem.item_code,
              item_id: matchedItem.id || matchedItem.item_id,
              name: matchedItem.name || matchedItem.item_name || "",
              dimension: matchedItem.dimension || "",
              spec: matchedItem.spec || "",
              uom: matchedItem.uom || "PCS",
              unit_price: String(ssotPrice),
              free_stock: freeStock,
              shortage_qty: shortage,
              qty_to_order: shortage,
              notFound: false,
            };
          }),
        );
        setHasChecked(false);
        return;
      }

      // 2. If no instant match, set typed item_code and clear linked fields
      setBomRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                item_code: val,
                item_id: undefined,
                name: "",
                dimension: "",
                spec: "",
                unit_price: "0",
                free_stock: 0,
                shortage_qty: Math.max(1, Number(r.qty) || 1),
                qty_to_order: Math.max(1, Number(r.qty) || 1),
                notFound: false,
              }
            : r,
        ),
      );
      setHasChecked(false);

      if (cleanCode.length < 2) return;

      // 3. Debounced network fallback query (/api/items/code/:code)
      searchTimerRef.current[id] = setTimeout(async () => {
        try {
          const res = await apiFetch(
            `/api/items/code/${encodeURIComponent(cleanCode)}`,
            {},
            user?.username,
          );
          if (res.ok && res.data?.id && !isFinishGoodItem(res.data)) {
            const item = res.data;
            const freeStock = Number(item.free_stock ?? 0);
            const ssotPrice = Number(item.ssot_unit_price ?? item.unit_price ?? 0);
            setInventoryItems((prev) => {
              if (!prev.some((x) => x.id === item.id)) return [...prev, item];
              return prev;
            });

            setBomRows((prev) =>
              prev.map((r) => {
                if (r.id === id && r.item_code.trim().toUpperCase() === cleanCode) {
                  const reqQty = Math.max(1, Number(r.qty) || 1);
                  const shortage = Math.max(0, reqQty - freeStock);
                  return {
                    ...r,
                    item_id: item.id,
                    item_code: item.item_code,
                    name: item.name,
                    dimension: item.dimension || "",
                    spec: item.spec || "",
                    uom: item.uom || "PCS",
                    unit_price: String(ssotPrice),
                    free_stock: freeStock,
                    shortage_qty: shortage,
                    qty_to_order: shortage,
                    notFound: false,
                  };
                }
                return r;
              }),
            );
          } else {
            setBomRows((prev) =>
              prev.map((r) => {
                if (r.id === id && r.item_code.trim().toUpperCase() === cleanCode) {
                  return { ...r, notFound: true };
                }
                return r;
              }),
            );
          }
        } catch (err) {
          console.error(err);
        }
      }, 300);
    },
    [nonFgInventoryItems, user?.username, setBomRows],
  );

  const handleAddMaterialRow = useCallback(() => {
    setBomRows((prev) => [
      ...prev,
      {
        id: "row-" + Math.random().toString(36).substring(2, 9),
        item_id: "",
        item_code: "",
        name: "",
        dimension: "",
        spec: "",
        qty: "1",
        uom: "PCS",
        unit_price: "0",
        free_stock: 0,
        shortage_qty: 1,
        qty_to_order: 1,
        expected_date: defaultExpectedDate(),
        notFound: false,
        is_custom: true,
      },
    ]);
    setHasChecked(false);
  }, [setBomRows]);

  const handleRefreshCatalog = useCallback(() => {
    fetchInventory();
    showToast("Master SKU catalog refreshed.", "info");
  }, [fetchInventory, showToast]);

  const handleOpenSearchModal = useCallback((rowId: string, initialSearchTerm = "") => {
    setSearchTerm(initialSearchTerm);
    setSearchModal({ isOpen: true, rowId });
  }, []);

  const handleRemoveMaterialRow = useCallback(
    (rowId: string, rowIndex: number) => {
      const targetRow = bomRows[rowIndex];
      if (!targetRow) return;

      const hasContent = Boolean(
        targetRow.item_id ||
        (targetRow.item_code && targetRow.item_code.trim()) ||
        (targetRow.name && targetRow.name.trim())
      );

      const performRemove = () => {
        setBomRows((prev) => {
          if (prev.length <= 1) {
            return [
              {
                id: "row-" + Math.random().toString(36).substring(2, 9),
                item_id: "",
                item_code: "",
                name: "",
                dimension: "",
                spec: "",
                qty: "1",
                uom: "PCS",
                unit_price: "0",
                free_stock: 0,
                shortage_qty: 1,
                qty_to_order: 1,
                expected_date: defaultExpectedDate(),
                notFound: false,
                is_custom: true,
              },
            ];
          }
          return prev.filter((_, i) => i !== rowIndex);
        });
        setHasChecked(false);
        showToast("Baris item berhasil dihapus", "info");
      };

      if (hasContent) {
        setConfirmModal({
          isOpen: true,
          title: "Hapus Komponen?",
          message: `Apakah Anda yakin ingin menghapus "${targetRow.name || targetRow.item_code || "komponen ini"}" dari daftar General Request?`,
          action: () => {
            performRemove();
            setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          },
        });
      } else {
        performRemove();
      }
    },
    [bomRows, setBomRows, showToast, setConfirmModal],
  );

  const handleCheckStock = async () => {
    if (bomRows.length === 0 || bomRows.some((r) => !r.item_id || r.notFound)) {
      showToast(
        "Pastikan seluruh baris menggunakan Master SKU Non-FG yang terdaftar sebelum validasi stok.",
        "error",
      );
      return;
    }

    setIsChecking(true);
    try {
      const invRes = await apiFetch("/api/items", {}, user?.username);
      const latestInv: any[] =
        invRes.ok && Array.isArray(invRes.data) ? invRes.data : inventoryItems;
      if (invRes.ok && Array.isArray(invRes.data)) {
        setInventoryItems(invRes.data);
      }

      const updated = bomRows.map((row) => {
        const matched = latestInv.find(
          (i: any) =>
            (row.item_id && (i.id === row.item_id || i.item_id === row.item_id)) ||
            (row.item_code &&
              String(i.item_code || "").toLowerCase() === row.item_code.toLowerCase()),
        );

        const freeStock = Number(matched?.free_stock ?? matched?.quantity ?? row.free_stock ?? 0);
        const reqQty = Math.max(1, Number(row.qty) || 1);
        const shortage = Math.max(0, reqQty - freeStock);
        const ssotPrice = Number(
          matched?.ssot_unit_price ?? matched?.unit_price ?? row.unit_price ?? 0,
        );

        return {
          ...row,
          item_id: matched?.id || matched?.item_id || row.item_id,
          item_code: matched?.item_code || row.item_code,
          name: matched?.name || matched?.item_name || row.name,
          dimension: matched?.dimension || row.dimension || "",
          spec: matched?.spec || row.spec || "",
          uom: matched?.uom || row.uom || "PCS",
          unit_price: String(ssotPrice),
          free_stock: freeStock,
          shortage_qty: shortage,
          qty_to_order: shortage,
          expected_date: row.expected_date || defaultExpectedDate(),
          notFound: false,
        };
      });

      setBomRows(updated);
      setHasChecked(true);
      showToast("Warehouse Free Stock & SSOT Price check completed", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to validate warehouse stock", "error");
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmitPr = async () => {
    setIsSubmitting(true);
    try {
      if (revisingPr) {
        const customItems = bomRows
          .filter(
            (r) =>
              (r.qty_to_order !== undefined ? r.qty_to_order : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            id: r.id,
            item_id: r.item_id,
            item_code: r.item_code,
            name: r.name,
            uom: r.uom,
            dimension: r.dimension,
            spec: r.spec,
            unit_price: Number(r.unit_price) || 0,
            qty_to_order:
              r.qty_to_order !== undefined ? r.qty_to_order : r.shortage_qty || 0,
            expected_delivery_date: r.expected_date,
          }));

        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const payload = {
          urgency,
          department: selectedDepartment,
          category: selectedCategory,
          title: requestTitle || revisingPr.title || revisingPr.project_name,
          drawing_reference: drawingReference || revisingPr.drawing_reference,
          expected_delivery_date:
            bomRows[0]?.expected_date || revisingPr.expected_delivery_date,
          remarks: requestTitle || drawingReference || revisingPr.remarks,
          items: customItems,
        };

        const res = await apiFetch(
          `/api/purchasing/pr/${revisingPr.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
          user?.username,
        );

        if (res.ok) {
          showToast("PR Revised successfully", "success");
          setShowPrModal(false);
          setRevisingPr(null);
          fetchPrs();
        } else {
          showToast(res.error || "Failed to revise PR", "error");
        }
      } else {
        const customItems = bomRows
          .filter(
            (r) =>
              (r.qty_to_order !== undefined ? r.qty_to_order : r.shortage_qty || 0) > 0,
          )
          .map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            name: r.name,
            uom: r.uom,
            dimension: r.dimension,
            spec: r.spec,
            unit_price: Number(r.unit_price) || 0,
            qty_to_order:
              r.qty_to_order !== undefined ? r.qty_to_order : r.shortage_qty || 0,
            expected_delivery_date: r.expected_date,
          }));

        if (
          customItems.length > 0 &&
          customItems.some((item) => !item.expected_delivery_date)
        ) {
          showToast("Please specify an expected delivery date for all items.", "error");
          setIsSubmitting(false);
          return;
        }

        const payload = {
          department: selectedDepartment,
          category: selectedCategory,
          title:
            requestTitle.trim() ||
            `${CATEGORY_MAP[selectedCategory]?.labelEn || selectedCategory} - ${getDepartmentLabel(selectedDepartment)}`,
          remarks: requestTitle.trim() || drawingReference.trim(),
          drawing_reference: drawingReference.trim() || "Attached in System",
          expected_delivery_date:
            bomRows[0]?.expected_date || defaultExpectedDate(),
          urgency,
          items: customItems,
        };

        const res = await apiFetch(
          "/api/purchasing/generate-general-pr",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          user?.username,
        );

        if (res.ok) {
          const data = res.data;
          showToast(
            data && data.pr_created
              ? `PR Created: ${data.pr_number}`
              : "No PR needed (Stock fulfilled)",
            "success",
          );
          setShowPrModal(false);
          fetchPrs();
          clearRequestTitle();
          clearDrawingReference();
          clearBomDraft();
          setBomRows([
            {
              id: "row-1",
              item_id: "",
              item_code: "",
              name: "",
              dimension: "",
              spec: "",
              qty: "1",
              uom: "PCS",
              unit_price: "0",
              free_stock: 0,
              shortage_qty: 1,
              qty_to_order: 1,
              expected_date: defaultExpectedDate(),
              notFound: false,
              is_custom: true,
            },
          ]);
          setHasChecked(false);
          if (data && data.pr_created && data.pr_id) {
            handleViewPr(data.pr_id);
          }
        } else {
          showToast(res.error || "Failed to generate PR", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showToast(
        revisingPr ? "Failed to revise PR" : "Failed to generate PR",
        "error",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthorizePr = async (pin: string) => {
    if (!selectedPrToAuth) return;
    setIsSubmitting(true);
    try {
      const digitalSignature = `Digitally Authorized by ${user?.name || user?.username} (${user?.role}) on ${new Date().toISOString()}`;
      const res = await apiFetch(
        "/api/purchasing/authorize-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            authorized_doc: digitalSignature,
            pin,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowAuthorizeModal(false);
        fetchPrs();
        showToast(
          res.data?.message || "PR digitally authorized and sent to Procurement queue",
          "success",
        );
      } else {
        showToast(res.error || "Failed to authorize PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error authorizing PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevisePr = async (note: string) => {
    if (!note.trim() || !selectedPrToAuth) {
      showToast("Validation Failed: Revision note is required.", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        "/api/purchasing/revise-pr",
        {
          method: "POST",
          body: JSON.stringify({
            pr_id: selectedPrToAuth.id,
            revision_note: note,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        setShowReviseModal(false);
        fetchPrs();
        showToast("PR marked for revision", "success");
      } else {
        showToast(res.error || "Failed to mark PR for revision", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error revising PR", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelPr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Cancel Purchase Request?",
      message:
        "Are you sure you want to cancel this PR? This will revert items inside to unauthorized state.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}/cancel`,
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR cancelled successfully", "success");
          } else {
            showToast(res.error || "Failed to cancel PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error cancelling PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeletePr = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Purchase Request?",
      message:
        "Are you sure you want to delete this PR? This will remove it from the active queue.",
      action: async () => {
        try {
          const res = await apiFetch(
            `/api/purchasing/pr/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast("PR deleted successfully", "success");
          } else {
            showToast(res.error || "Failed to delete PR", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error deleting PR", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleArchiveFinishedPrs = async () => {
    setConfirmModal({
      isOpen: true,
      title: "Archive Finished Purchase Requests?",
      message:
        "This will archive all ORDERED, RECEIVED, and CANCELLED Purchase Requests from your active queue. Archived items remain safely stored in the database for comprehensive audits.",
      action: async () => {
        try {
          const res = await apiFetch(
            "/api/purchasing/clear-prs",
            { method: "POST" },
            user?.username,
          );
          if (res.ok) {
            fetchPrs();
            showToast(
              "Requests successfully archived and removed from active view.",
              "success",
            );
          } else {
            showToast(res.error || "Failed to archive requests", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error archiving requests", "error");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setIsSubmitting(true);
    try {
      const fileName = previewPrData
        ? `PR_${previewPrData.pr_number}.pdf`
        : "Document.pdf";
      await generatePDF(printRef.current, fileName);
    } catch (error) {
      console.error("PDF Generation failed", error);
      showToast("Failed to generate PDF. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewPr = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setPreviewPrData({
          id: data.id,
          pr_number: data.pr_number,
          project_id: data.project_id,
          project_name: data.title || data.project_name,
          department: data.department || "PRODUCTION",
          category: data.category || "MAINTENANCE",
          drawing_reference: data.drawing_reference,
          created_at: data.created_at,
          status: data.status,
          authorized_doc: data.authorized_doc,
          created_by: data.created_by || data.requested_by,
          urgency: data.urgency,
          expected_delivery_date: data.expected_delivery_date,
          items: (data.items || []).map((item: any) => ({
            item_code: item.item_code,
            name: item.item_name,
            dimension: item.dimension,
            spec: item.spec,
            shortage_qty: item.qty,
            uom: item.uom,
            unit_price: item.unit_price,
            expected_delivery_date:
              item.expected_delivery_date || data.expected_delivery_date || "",
          })),
        });
        setShowPreviewModal(true);
      } else {
        showToast(res.error || "Failed to view PR", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error viewing PR", "error");
    }
  };

  const handleRevisePrSetup = async (prId: string) => {
    try {
      const res = await apiFetch(
        `/api/purchasing/pr/${prId}`,
        {},
        user?.username,
      );
      if (res.ok) {
        const data = res.data;
        setRevisingPr(data);
        setUrgency(data.urgency || "NORMAL");
        if (data.department)
          setSelectedDepartment(normalizeDepartmentToRole(data.department));
        if (data.category) setSelectedCategory(data.category);
        if (data.title) setRequestTitle(data.title);
        if (data.drawing_reference) setDrawingReference(data.drawing_reference);
        setBomRows(
          (data.items || []).map((item: any) => ({
            id: item.id || Math.random().toString(),
            item_id: item.item_id,
            item_code: item.item_code || "",
            name: item.item_name || "",
            dimension: item.dimension || "",
            spec: item.spec || "",
            qty: String(item.qty || 1),
            uom: item.uom || "PCS",
            unit_price: String(item.unit_price || 0),
            free_stock: Number(item.free_stock || 0),
            shortage_qty: Number(item.qty || 1),
            qty_to_order: Number(item.qty || 1),
            expected_date:
              item.expected_delivery_date ||
              data.expected_delivery_date ||
              defaultExpectedDate(),
            notFound: false,
            is_custom: true,
          })),
        );
        setShowPrModal(true);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch PR details for revision", "error");
    }
  };

  const filteredPrs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return prs;
    return prs.filter(
      (pr) =>
        String(pr.pr_number || "").toLowerCase().includes(q) ||
        String(pr.project_name || pr.title || "").toLowerCase().includes(q) ||
        String(pr.department || "").toLowerCase().includes(q) ||
        String(pr.category || "").toLowerCase().includes(q) ||
        String(pr.po_numbers || "").toLowerCase().includes(q),
    );
  }, [prs, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="General Requests"
        subtitle="Departmental material requisitions"
        icon={<ClipboardList className="w-5 h-5" />}
      />

      {/* 2-Tab Menu Switcher */}
      <div className="flex items-center gap-1 p-1 bg-stone-100 border border-stone-200/80 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveTab("FORM")}
          className={cn(
            "px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
            activeTab === "FORM"
              ? "bg-white text-stone-900 shadow-2xs"
              : "text-stone-500 hover:text-stone-900",
          )}
        >
          Form Generation
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ONGOING")}
          className={cn(
            "px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-2",
            activeTab === "ONGOING"
              ? "bg-white text-stone-900 shadow-2xs"
              : "text-stone-500 hover:text-stone-900",
          )}
        >
          <span>Ongoing Requests</span>
          <span className="font-mono tabular-nums text-[10px] text-stone-400">
            ({filteredPrs.length})
          </span>
        </button>
      </div>

      {/* Tab 1: Form Generation */}
      {activeTab === "FORM" && (
        <section className="space-y-4">
          <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-2xs space-y-6">
            {/* Department & Metadata Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 border-b border-stone-100">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                  Target Department
                </label>
                <Select
                  value={normalizeDepartmentToRole(selectedDepartment)}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                >
                  {ERP_DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                  Operational Category
                </label>
                <Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {Object.entries(CATEGORY_MAP).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.labelEn}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                  Requisition Title / Purpose
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Hydraulic Seal & Bearing Replacement"
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-stone-400 tracking-widest uppercase">
                  Reference Drawing / Spec Doc
                </label>
                <Input
                  type="text"
                  placeholder="e.g. DWG-MTC-2026-08 / Attached in System"
                  value={drawingReference}
                  onChange={(e) => setDrawingReference(e.target.value)}
                />
              </div>
            </div>

            {/* Material Requirements List - Clean & Elegant BOM Table Structure */}
            <GeneralRequestMaterialSection
              bomRows={bomRows}
              nonFgInventoryItems={nonFgInventoryItems}
              onRefreshCatalog={handleRefreshCatalog}
              updateRow={updateRow}
              onOpenSearchModal={handleOpenSearchModal}
              onRemoveMaterialRow={handleRemoveMaterialRow}
              onAddMaterialRow={handleAddMaterialRow}
            />

          {/* Footer Action Bar */}
          <div className="flex justify-between items-center bg-stone-50/70 p-4 rounded-2xl border border-stone-200/80 gap-3 flex-wrap">
            <div className="text-[11px] text-stone-500 font-medium">
              Need a new SKU? Register it in{" "}
              <strong className="text-stone-800">
                Warehouse &gt; Inventory Master &amp; Balances
              </strong>
              .
            </div>
            <div className="flex justify-end gap-2.5 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckStock}
                disabled={
                  isChecking ||
                  bomRows.length === 0 ||
                  bomRows.some((r) => !r.item_id || r.notFound)
                }
                isLoading={isChecking}
              >
                {isChecking ? "Processing stock..." : "Validate Stock"}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowPrModal(true);
                }}
                disabled={
                  bomRows.length === 0 ||
                  !hasChecked ||
                  bomRows.some((r) => !r.item_id || r.notFound)
                }
              >
                Generate Document
              </Button>
            </div>
          </div>
          </div>
        </section>
      )}

      {/* Tab 2: Ongoing Requests */}
      {activeTab === "ONGOING" && (
        <OngoingRequestsSection
          user={user}
          isLoading={isLoading}
          filteredPrs={filteredPrs}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          fetchPrs={fetchPrs}
          handleArchiveFinishedPrs={handleArchiveFinishedPrs}
          handleViewPr={handleViewPr}
          shareToForum={shareToForum}
          setSelectedPrToAuth={setSelectedPrToAuth}
          setShowAuthorizeModal={setShowAuthorizeModal}
          setShowReviseModal={setShowReviseModal}
          handleRevisePrSetup={handleRevisePrSetup}
          handleCancelPr={handleCancelPr}
          handleDeletePr={handleDeletePr}
        />
      )}

      <GeneralRequestModals
        printRef={printRef}
        searchModal={searchModal}
        setSearchModal={setSearchModal}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        isSearching={isSearching}
        searchResults={searchResults}
        selectItemFromSearch={selectItemFromSearch}
        showAuthorizeModal={showAuthorizeModal}
        setShowAuthorizeModal={setShowAuthorizeModal}
        selectedPrToAuth={selectedPrToAuth}
        isSubmitting={isSubmitting}
        handleAuthorizePr={handleAuthorizePr}
        showReviseModal={showReviseModal}
        setShowReviseModal={setShowReviseModal}
        handleRevisePr={handleRevisePr}
        showPreviewModal={showPreviewModal}
        setShowPreviewModal={setShowPreviewModal}
        previewPrData={previewPrData}
        handleExportPDF={handleExportPDF}
        showPrModal={showPrModal}
        setShowPrModal={setShowPrModal}
        revisingPr={revisingPr}
        setRevisingPr={setRevisingPr}
        selectedDepartment={selectedDepartment}
        urgency={urgency}
        setUrgency={setUrgency}
        bomRows={bomRows}
        setBomRows={setBomRows}
        handleSubmitPr={handleSubmitPr}
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
      />
    </div>
  );
}
