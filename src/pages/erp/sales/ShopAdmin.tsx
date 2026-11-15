import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Boxes,
  ShoppingBag,
  EyeOff,
  Search,
  RefreshCw,
  ExternalLink,
  Check,
  Layers,
  Clock,
  Truck,
  FileText,
  Calendar,
  Phone,
  MapPin,
  ArrowRight,
  Store,
  Warehouse,
  PackageCheck,
  Factory,
  SlidersHorizontal,
  Sparkles,
  Receipt,
  Package,
} from "lucide-react";
import { formatIDR, cn } from "@/lib/utils";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CurrencyInput } from "@/components/ui/CurrencyInput";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { useToast } from "@/contexts/ToastContext";
import { ShopOrder } from "@/types/shop";
import { ProductImageUploader } from "@/components/shared/ProductImageUploader";
import { ShopCmsEditor } from "@/components/shop/ShopCmsEditor";
import { ShopOrderDetailModal } from "@/components/shop/ShopOrderDetailModal";
import { invalidateSmartCache } from "@/utils/smartCache";
import { broadcastCatalogUpdate, subscribeToCatalogUpdates } from "@/utils/shopLiveSync";

interface CatalogItem {
  id: string;
  item_code: string;
  name: string;
  dimension?: string | null;
  spec?: string | null;
  category: string;
  description?: string | null;
  uom: string;
  unit_price: number;
  shop_promo_price: number;
  shop_weight_kg: number;
  shop_image_url: string;
  shop_gallery_urls?: string[] | string;
  shop_badge?: string | null;
  shop_featured: number;
  is_published_shop: number;
  shop_availability_type?: "AUTO" | "READY_STOCK" | "MAKE_TO_ORDER" | "PRE_ORDER";
  shop_lead_time_days?: number;
  shop_moq?: number;
  shop_specs?: string;
  available_qty: number;
  physical_qty: number;
}

export default function ShopManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"catalog" | "orders" | "cms">("catalog");
  const [stats, setStats] = useState<any>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters for Catalog
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [availabilityFilter, setAvailabilityFilter] = useState<"ALL" | "READY" | "MTO" | "PUBLISHED" | "HIDDEN">("ALL");

  // Filters for Orders
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");

  // Modals & Action Loading States
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [isDispatchingId, setIsDispatchingId] = useState<string | null>(null);
  const [isCreatingInvoiceId, setIsCreatingInvoiceId] = useState<string | null>(null);
  const [isTriggeringSpkId, setIsTriggeringSpkId] = useState<string | null>(null);
  const [isSyncingIntegrity, setIsSyncingIntegrity] = useState(false);
  const [brokenThumbIds, setBrokenThumbIds] = useState<Record<string, boolean>>({});

  // Fetch KPI statistics
  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/erp/shop-management/stats", {}, user?.username);
      if (res.ok && res.data) {
        setStats(res.data.data || res.data);
      }
    } catch (err) {
      console.error("Failed to fetch shop stats:", err);
    }
  }, [user?.username]);

  // Fetch Finished Goods catalog
  const fetchCatalog = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch("/api/erp/shop-management/catalog", {}, user?.username);
      if (res.ok && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.data || [];
        setCatalog(list);
      }
    } catch (err) {
      console.error("Failed to fetch catalog:", err);
      showToast("Failed to load finished goods catalog", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, showToast]);

  // Fetch retail orders
  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (orderStatusFilter !== "ALL") params.append("status", orderStatusFilter);
      if (orderSearch.trim()) params.append("q", orderSearch.trim());

      const res = await apiFetch(
        `/api/erp/shop-management/orders?${params.toString()}`,
        {},
        user?.username,
      );
      if (res.ok && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.data || [];
        setOrders(list);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      showToast("Failed to load storefront retail orders", "error");
    } finally {
      setIsLoading(false);
    }
  }, [orderStatusFilter, orderSearch, user?.username, showToast]);

  useEffect(() => {
    fetchStats();
    if (activeTab === "catalog") {
      fetchCatalog();
    } else {
      fetchOrders();
    }
  }, [activeTab, orderStatusFilter, fetchStats, fetchCatalog, fetchOrders]);

  useEffect(() => {
    const unsubscribe = subscribeToCatalogUpdates(() => {
      if (activeTab === "catalog") {
        fetchCatalog();
      }
      fetchStats();
    });
    return () => {
      unsubscribe();
    };
  }, [activeTab, fetchCatalog, fetchStats]);

  // Toggle publish state directly
  const handleTogglePublish = useCallback(async (item: CatalogItem) => {
    try {
      const newState = item.is_published_shop === 1 ? 0 : 1;
      const res = await apiFetch(
        `/api/erp/shop-management/catalog/${item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({ is_published_shop: newState }),
        },
        user?.username,
      );
      if (res.ok) {
        invalidateSmartCache("/api/shop");
        invalidateSmartCache("/api/public");
        broadcastCatalogUpdate(item.id, "PUBLISH_TOGGLED");
        showToast(
          newState === 1
            ? `SKU ${item.item_code} published on storefront`
            : `SKU ${item.item_code} hidden from storefront`,
          "success",
        );
        setCatalog((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_published_shop: newState } : it)),
        );
        fetchStats();
      } else {
        showToast(res.error || "Failed to update publication status", "error");
      }
    } catch {
      showToast("Connection error while updating status", "error");
    }
  }, [user?.username, showToast, fetchStats]);

  // Save detailed item display settings
  const handleSaveItemDisplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const availType = editingItem.shop_availability_type || "AUTO";
    const basePrice = Number(editingItem.unit_price || 0);

    if (availType === "READY_STOCK" && basePrice <= 0) {
      showToast("Base Unit Price is required for B2C Direct Sale products (must be greater than 0).", "error");
      return;
    }

    const finalUnitPrice = availType === "MAKE_TO_ORDER" ? 0 : basePrice;
    const finalPromoPrice = availType === "MAKE_TO_ORDER" ? 0 : Number(editingItem.shop_promo_price || 0);

    setIsSavingItem(true);
    try {
      const res = await apiFetch(
        `/api/erp/shop-management/catalog/${editingItem.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            unit_price: finalUnitPrice,
            is_published_shop: editingItem.is_published_shop,
            shop_promo_price: finalPromoPrice,
            shop_weight_kg: Number(editingItem.shop_weight_kg || 2.5),
            shop_badge: editingItem.shop_badge,
            shop_featured: editingItem.shop_featured,
            shop_availability_type: availType,
            shop_lead_time_days: Number(editingItem.shop_lead_time_days || 3),
            shop_moq: Number(editingItem.shop_moq || 1),
            shop_specs: editingItem.shop_specs,
            shop_image_url: editingItem.shop_image_url,
            shop_gallery_urls:
              typeof editingItem.shop_gallery_urls === "string"
                ? editingItem.shop_gallery_urls
                : JSON.stringify(editingItem.shop_gallery_urls || []),
            category: editingItem.category,
            description: editingItem.description,
          }),
        },
        user?.username,
      );
      if (!res.ok) {
        throw new Error(res.error || "Failed to save configuration");
      }

      const savedRow = res.data?.data || null;
      if (savedRow) {
        setBrokenThumbIds((prev) => {
          const next = { ...prev };
          delete next[editingItem.id];
          return next;
        });
        setCatalog((prev) =>
          prev.map((it) =>
            it.id === editingItem.id
              ? {
                  ...it,
                  unit_price: Number(savedRow.unit_price ?? finalUnitPrice),
                  is_published_shop: Number(savedRow.is_published_shop ?? editingItem.is_published_shop),
                  shop_promo_price: Number(savedRow.shop_promo_price ?? finalPromoPrice),
                  shop_weight_kg: Number(savedRow.shop_weight_kg ?? editingItem.shop_weight_kg),
                  shop_badge: savedRow.shop_badge ?? editingItem.shop_badge,
                  shop_featured: Number(savedRow.shop_featured ?? editingItem.shop_featured),
                  shop_availability_type: savedRow.shop_availability_type ?? availType,
                  shop_lead_time_days: Number(savedRow.shop_lead_time_days ?? editingItem.shop_lead_time_days),
                  shop_moq: Number(savedRow.shop_moq ?? editingItem.shop_moq),
                  shop_specs: savedRow.shop_specs ?? editingItem.shop_specs,
                  shop_image_url: savedRow.shop_image_url || "",
                  shop_gallery_urls: savedRow.shop_gallery_urls || "[]",
                  category: savedRow.category ?? editingItem.category,
                  description: savedRow.description ?? editingItem.description,
                }
              : it,
          ),
        );
      }

      invalidateSmartCache("/api/shop");
      invalidateSmartCache("/api/public");
      broadcastCatalogUpdate(editingItem.id, "CATALOG_UPDATED");

      showToast("Showroom display settings saved & synced live", "success");
      setEditingItem(null);
      fetchCatalog();
      fetchStats();
    } catch (err: any) {
      showToast(err.message || "Failed to save changes", "error");
    } finally {
      setIsSavingItem(false);
    }
  };

  // Update order status (Cancel, Mark Paid, etc.)
  const handleUpdateOrderStatus = useCallback(async (orderId: string, newStatus: string, newPaymentStatus?: string) => {
    try {
      const res = await apiFetch(
        `/api/erp/shop-management/orders/${orderId}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            order_status: newStatus,
            payment_status: newPaymentStatus,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast("Order status updated successfully", "success");
        fetchOrders();
        fetchStats();
        setSelectedOrder((prev) =>
          prev && prev.id === orderId
            ? {
                ...prev,
                order_status: newStatus as any,
                payment_status: (newPaymentStatus as any) || prev.payment_status,
              }
            : prev,
        );
      } else {
        showToast(res.error || "Failed to update order status", "error");
      }
    } catch {
      showToast("Network error while updating order", "error");
    }
  }, [user?.username, showToast, fetchOrders, fetchStats]);

  // 1-Click Dispatch to Official ERP Delivery Note (DO)
  const handleDispatchOrderToDo = useCallback(async (order: ShopOrder) => {
    setIsDispatchingId(order.id);
    try {
      const res = await apiFetch(
        `/api/erp/shop-management/orders/${order.id}/dispatch-do`,
        {
          method: "POST",
          body: JSON.stringify({
            driver_name: "Factory Logistics Driver",
            vehicle_plate: "Internal Fleet",
            dispatch_notes: `B2C Shop Order ${order.order_number}`,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        const dnNum = res.data?.data?.dn_number || res.data?.dn_number || "DN";
        showToast(
          res.data?.already_exists
            ? `Delivery Order ${dnNum} was already issued previously.`
            : `Delivery Order ${dnNum} generated, stock released & dispatched`,
          "success",
        );
        fetchOrders();
        fetchStats();
        setSelectedOrder((prev) =>
          prev && prev.id === order.id
            ? {
                ...prev,
                order_status: "DISPATCHED" as any,
                tracking_number: dnNum,
              }
            : prev,
        );
      } else {
        showToast(res.error || "Failed to dispatch Delivery Note", "error");
      }
    } catch {
      showToast("Network error while generating Delivery Note", "error");
    } finally {
      setIsDispatchingId(null);
    }
  }, [user?.username, showToast, fetchOrders, fetchStats]);

  // 1-Click Trigger Official Production SPK, 3-Stage BOP & WOT for B2C MTO / Hybrid Orders
  const handleTriggerSpkForOrder = useCallback(async (order: ShopOrder) => {
    setIsTriggeringSpkId(order.id);
    try {
      const res = await apiFetch(
        `/api/erp/shop-management/orders/${order.id}/trigger-spk`,
        {
          method: "POST",
        },
        user?.username,
      );
      if (res.ok) {
        const spkNum = res.data?.data?.spk_number || res.data?.spk_number || "SPK";
        const projCode = res.data?.data?.project_code || "";
        showToast(
          res.data?.already_exists
            ? `Production Work Order ${spkNum} was previously issued.`
            : `Production Work Order ${spkNum} (${projCode}), 3-Stage BOM & WOT tickets successfully issued!`,
          "success",
        );
        fetchOrders();
        fetchStats();
        setSelectedOrder((prev) =>
          prev && prev.id === order.id
            ? {
                ...prev,
                spk_number: spkNum,
                production_status: "IN_PRODUCTION",
                order_status: "PROCESSING" as any,
              }
            : prev,
        );
      } else {
        showToast(res.error || "Failed to issue Production Work Order", "error");
      }
    } catch {
      showToast("Network error while issuing Production Work Order", "error");
    } finally {
      setIsTriggeringSpkId(null);
    }
  }, [user?.username, showToast, fetchOrders, fetchStats]);

  // 1-Click Convert Shop Order to Official ERP Commercial Invoice & AR/Revenue/DP GL Journal
  const handleCreateInvoiceForOrder = useCallback(async (
    order: ShopOrder,
    invoiceCategory?: "DOWN_PAYMENT" | "FINAL_SETTLEMENT" | "STANDARD",
  ) => {
    setIsCreatingInvoiceId(order.id);
    try {
      const res = await apiFetch(
        `/api/erp/shop-management/orders/${order.id}/create-invoice`,
        {
          method: "POST",
          body: JSON.stringify(invoiceCategory ? { invoice_category: invoiceCategory } : {}),
        },
        user?.username,
      );
      if (res.ok) {
        const ciNum = res.data?.data?.ci_number || res.data?.ci_number || "CI";
        const dnNum = res.data?.data?.dn_number || order.tracking_number;
        const cat = res.data?.data?.invoice_category || invoiceCategory || "STANDARD";
        showToast(
          res.data?.already_exists
            ? `Invoice ${ciNum} was already issued for this order.`
            : cat === "DOWN_PAYMENT"
              ? `Down Payment Invoice ${ciNum} issued & journaled to Customer Advances (COA 2106)!`
              : cat === "FINAL_SETTLEMENT"
                ? `Settlement Invoice ${ciNum} issued & advance payment knock-off (COA 2106) completed!`
                : `Commercial Invoice ${ciNum} issued & journaled to Finance General Ledger!`,
          "success",
        );
        fetchOrders();
        fetchStats();
        setSelectedOrder((prev) =>
          prev && prev.id === order.id
            ? {
                ...prev,
                ci_number: ciNum,
                dp_ci_number: cat === "DOWN_PAYMENT" ? ciNum : prev.dp_ci_number,
                final_ci_number: cat === "FINAL_SETTLEMENT" ? ciNum : prev.final_ci_number,
                tracking_number: dnNum || prev.tracking_number,
              }
            : prev,
        );
      } else {
        showToast(res.error || "Failed to issue Commercial Invoice", "error");
      }
    } catch {
      showToast("Network error while issuing Invoice", "error");
    } finally {
      setIsCreatingInvoiceId(null);
    }
  }, [user?.username, showToast, fetchOrders, fetchStats]);

  // Cross-Module Audit & Integrity Sync (Inventory Stock, Deliveries, & GL Journals)
  const handleSyncIntegrity = async () => {
    setIsSyncingIntegrity(true);
    try {
      const res = await apiFetch(
        "/api/erp/shop-management/sync-integrity",
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message || "Warehouse stock, delivery orders, and general ledger synchronized!",
          "success",
        );
        fetchStats();
        fetchCatalog();
        fetchOrders();
      } else {
        showToast(res.error || "Failed to synchronize data integrity", "error");
      }
    } catch {
      showToast("Network error while synchronizing integrity", "error");
    } finally {
      setIsSyncingIntegrity(false);
    }
  };

  // Filtered Catalog List
  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const s = catalogSearch.toLowerCase().trim();
      const matchesSearch =
        !s ||
        item.name.toLowerCase().includes(s) ||
        item.item_code.toLowerCase().includes(s) ||
        (item.category && item.category.toLowerCase().includes(s)) ||
        (item.spec && item.spec.toLowerCase().includes(s));

      const matchesCat = categoryFilter === "ALL" || item.category === categoryFilter;

      let matchesAvail = true;
      const isReady = (item.physical_qty || 0) > 0;
      if (availabilityFilter === "READY") {
        matchesAvail = isReady;
      } else if (availabilityFilter === "MTO") {
        matchesAvail = !isReady || item.shop_availability_type === "MAKE_TO_ORDER";
      } else if (availabilityFilter === "PUBLISHED") {
        matchesAvail = item.is_published_shop === 1;
      } else if (availabilityFilter === "HIDDEN") {
        matchesAvail = item.is_published_shop === 0;
      }

      return matchesSearch && matchesCat && matchesAvail;
    });
  }, [catalog, catalogSearch, categoryFilter, availabilityFilter]);

  // Extract unique categories from catalog
  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((it) => {
      if (it.category) set.add(it.category);
    });
    return Array.from(set).sort();
  }, [catalog]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Header */}
      <PageHeader
        title="Finished Goods & Storefront"
        subtitle="Catalog pricing & storefront inventory"
        icon={<Store className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              isLoading={isSyncingIntegrity}
              onClick={handleSyncIntegrity}
              leftIcon={<PackageCheck className="w-4 h-4 text-stone-600" />}
              title="Audit and sync warehouse stock, delivery notes (DO), and general ledger (GL)"
            >
              Sync Stock &amp; Ledger
            </Button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => {
                fetchStats();
                if (activeTab === "catalog") fetchCatalog();
                else fetchOrders();
              }}
              title="Refresh Storefront Data"
              aria-label="Refresh Storefront Data"
            >
              <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
            </Button>
            <a
              href="/shop"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-9 px-3.5 py-2 text-xs font-bold tracking-wide rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-900 text-white shadow-xs transition-all active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4 text-white/90" />
              <span>View Storefront</span>
            </a>
          </div>
        }
      />

      {/* Main Tab Switcher */}
      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
        <Tabs
          tabs={[
            {
              id: "catalog",
              label: "Finished Goods Catalog",
              icon: <Layers className="w-3.5 h-3.5" />,
              count: catalog.length,
            },
            {
              id: "orders",
              label: "Retail Orders & Fulfillment",
              icon: <ShoppingBag className="w-3.5 h-3.5" />,
              count: orders.length,
            },
            {
              id: "cms",
              label: "Storefront CMS",
              icon: <Sparkles className="w-3.5 h-3.5" />,
            },
          ]}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as "catalog" | "orders" | "cms")}
        />
      </div>

      {/* TAB 1: FINISHED GOODS CATALOG */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Controls Bar: Unified Search & Structured Filters */}
          <div className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex-1 max-w-lg">
              <Input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search SKU code, item name, specification, dimension..."
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="min-w-[180px]">
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  options={[
                    { value: "ALL", label: `All Categories (${categories.length})` },
                    ...categories.map((cat) => ({ value: cat, label: cat })),
                  ]}
                />
              </div>

              <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/70 overflow-x-auto">
                {(
                  [
                    { id: "ALL", label: "All" },
                    { id: "READY", label: "Ready Stock" },
                    { id: "MTO", label: "Make to Order" },
                    { id: "PUBLISHED", label: "Published" },
                    { id: "HIDDEN", label: "Hidden" },
                  ] as const
                ).map((chip) => (
                  <Button
                    key={chip.id}
                    variant={availabilityFilter === chip.id ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => setAvailabilityFilter(chip.id)}
                  >
                    {chip.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[260px]">SKU & Item Details</TableHead>
                  <TableHead className="min-w-[160px]">Warehouse Stock & Mode</TableHead>
                  <TableHead className="min-w-[130px] text-right">Storefront Pricing</TableHead>
                  <TableHead className="text-center min-w-[100px]">Storefront</TableHead>
                  <TableHead className="text-right w-16">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableEmpty colSpan={5} message="Loading catalog data..." />
                ) : filteredCatalog.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    icon={<Boxes className="w-8 h-8 text-stone-300" />}
                    message="No Finished Goods matching the current criteria."
                  />
                ) : (
                  filteredCatalog.map((item) => {
                    const isReadyStock = (item.physical_qty || 0) > 0;
                    const hasDiscount = item.shop_promo_price > 0 && item.shop_promo_price < item.unit_price;
                    const galleryList: string[] = (() => {
                      try {
                        if (Array.isArray(item.shop_gallery_urls)) return item.shop_gallery_urls;
                        if (typeof item.shop_gallery_urls === "string") return JSON.parse(item.shop_gallery_urls);
                        return item.shop_image_url ? [item.shop_image_url] : [];
                      } catch {
                        return item.shop_image_url ? [item.shop_image_url] : [];
                      }
                    })();
                    const photoCount = Math.max(item.shop_image_url ? 1 : 0, galleryList.length);

                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-stone-100 border border-stone-200/80 overflow-hidden shrink-0 flex items-center justify-center relative">
                              {item.shop_image_url && !brokenThumbIds[item.id] ? (
                                <img
                                  src={item.shop_image_url}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setBrokenThumbIds((prev) => ({ ...prev, [item.id]: true }))
                                  }
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Package className="w-4 h-4 text-stone-400" />
                              )}
                              {photoCount > 1 && (
                                <span className="absolute bottom-0.5 right-0.5 bg-stone-900/85 text-white text-[8px] font-mono tabular-nums font-bold px-1 rounded">
                                  {photoCount}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-stone-900 truncate max-w-[280px]">
                                  {item.name}
                                </span>
                                {item.shop_featured === 1 && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-amber-200/90 bg-amber-50/50 text-amber-900 inline-flex items-center gap-1 font-mono">
                                    <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                    <span>Featured</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mt-1 flex-wrap">
                                <span className="font-mono tabular-nums text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/70 text-[10px] font-semibold">
                                  {item.item_code}
                                </span>
                                <span className="text-stone-300">·</span>
                                <span>{item.category || "General"}</span>
                                {photoCount > 1 && (
                                  <>
                                    <span className="text-stone-300">·</span>
                                    <span className="text-stone-600 font-mono tabular-nums font-medium">
                                      {photoCount} photos
                                    </span>
                                  </>
                                )}
                                {item.dimension && (
                                  <>
                                    <span className="text-stone-300">·</span>
                                    <span className="text-stone-600 font-mono tabular-nums">{item.dimension}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {isReadyStock ? (
                            <div className="space-y-0.5">
                              <Badge variant="success" size="sm" className="font-mono tabular-nums">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                Ready: {item.physical_qty?.toLocaleString()} {item.uom}
                              </Badge>
                              <span className="text-[10px] text-stone-400 block font-medium">
                                Gambiran Stockyard
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <Badge variant="neutral" size="sm" className="font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0" />
                                Make to Order
                              </Badge>
                              <span className="text-[10px] text-stone-400 block font-mono tabular-nums font-medium">
                                MOQ: {item.shop_moq || 1} {item.uom}
                              </span>
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          {item.unit_price <= 0 ||
                          item.shop_availability_type === "MAKE_TO_ORDER" ||
                          item.shop_availability_type === "PRE_ORDER" ? (
                            <div className="space-y-0.5 flex flex-col items-end">
                              {item.unit_price > 0 ? (
                                <div className="font-bold text-stone-900 font-mono tabular-nums text-xs">
                                  {formatIDR(item.unit_price)}
                                </div>
                              ) : null}
                              <Badge variant="warning" size="sm" className="font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                B2B Quotation
                              </Badge>
                            </div>
                          ) : hasDiscount ? (
                            <div>
                              <div className="font-bold text-stone-900 font-mono tabular-nums text-xs">
                                {formatIDR(item.shop_promo_price)}
                              </div>
                              <div className="text-[10px] text-stone-400 font-mono tabular-nums line-through mt-0.5">
                                {formatIDR(item.unit_price)}
                              </div>
                            </div>
                          ) : (
                            <div className="font-bold text-stone-900 font-mono tabular-nums text-xs">
                              {formatIDR(item.unit_price)}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="text-center">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleTogglePublish(item)}
                            title={item.is_published_shop === 1 ? "Click to unpublish" : "Click to publish live"}
                            leftIcon={
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full shrink-0",
                                  item.is_published_shop === 1 ? "bg-emerald-500" : "bg-stone-300"
                                )}
                              />
                            }
                          >
                            {item.is_published_shop === 1 ? "Live" : "Hidden"}
                          </Button>
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            id={`btn-config-item-${item.id}`}
                            variant="secondary"
                            size="xs"
                            onClick={() => setEditingItem(item)}
                            title={`Configure ${item.name}`}
                            aria-label={`Configure ${item.name}`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-stone-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: RETAIL ORDERS & ERP FULFILLMENT */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Search and Status Filters */}
          <div className="bg-white p-3 rounded-xl border border-stone-200/90 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex-1 max-w-lg">
              <Input
                type="text"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchOrders();
                }}
                placeholder="Search order #, customer name, phone, city..."
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/70 overflow-x-auto">
              {[
                { id: "ALL", label: "All Orders" },
                { id: "PROCESSING", label: "Processing" },
                { id: "DISPATCHED", label: "Dispatched" },
                { id: "COMPLETED", label: "Completed" },
              ].map((st) => (
                <Button
                  key={st.id}
                  variant={orderStatusFilter === st.id ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setOrderStatusFilter(st.id)}
                >
                  {st.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-2xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Order # & Date</TableHead>
                  <TableHead className="min-w-[180px]">Customer & Contact</TableHead>
                  <TableHead className="min-w-[190px]">Items Summary</TableHead>
                  <TableHead className="min-w-[140px] text-right">Total & Dispatch</TableHead>
                  <TableHead className="min-w-[130px]">Payment Status</TableHead>
                  <TableHead className="min-w-[120px]">Fulfillment</TableHead>
                  <TableHead className="text-right min-w-[200px]">ERP Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableEmpty colSpan={7} message="Loading retail orders..." />
                ) : orders.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    icon={<ShoppingBag className="w-8 h-8 text-stone-300" />}
                    message="No retail orders found in this filter."
                  />
                ) : (
                  orders.map((order) => {
                    const isPaid = order.payment_status === "PAID" || order.payment_status === "VERIFIED";
                    const canDispatchDo =
                      order.order_status !== "DISPATCHED" &&
                      order.order_status !== "COMPLETED" &&
                      order.order_status !== "CANCELLED";

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono tabular-nums">
                          <div className="font-bold text-stone-900">{order.order_number}</div>
                          <div className="text-[10px] text-stone-400 font-sans flex items-center gap-1.5 mt-0.5">
                            <Calendar className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="font-mono tabular-nums">
                              {new Date(order.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-stone-900">{order.customer_name}</span>
                            {order.customer_code && (
                              <span className="font-mono tabular-nums text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200/80">
                                {order.customer_code}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-stone-500 font-mono tabular-nums flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 text-stone-400 shrink-0" />
                            <span>{order.customer_phone}</span>
                          </div>
                          {order.delivery_city && (
                            <div className="text-[10px] text-stone-400 flex items-center gap-1.5 mt-0.5">
                              <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="truncate max-w-[150px]">{order.delivery_city}</span>
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="font-semibold text-stone-800">
                            {order.items && order.items.length > 0 ? (
                              <span className="truncate max-w-[180px] block">
                                {order.items[0].item_name}{" "}
                                {order.items.length > 1 && (
                                  <span className="text-stone-400 font-mono tabular-nums font-normal">
                                    +{order.items.length - 1} more
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="font-mono tabular-nums">{order.item_count || 1} Item(s)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[10px] text-stone-500 font-mono tabular-nums">
                              {order.items
                                ? `${order.items.reduce((acc, it) => acc + (it.qty || 0), 0)} units`
                                : "Direct retail"}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border border-stone-200/80 bg-stone-50 text-stone-700">
                              {order.fulfillment_mode || (order.is_dp === 1 ? "MTO" : "MTS")}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="font-bold text-stone-900 font-mono tabular-nums text-xs">
                            {formatIDR(order.total_amount)}
                          </div>
                          <div className="text-[10px] text-stone-500 font-sans flex items-center justify-end gap-1.5 mt-0.5">
                            <Truck className="w-3 h-3 text-stone-400 shrink-0" />
                            <span className="whitespace-nowrap">
                              {order.delivery_method === "PICKUP" ? "Stockyard Pickup" : "Fleet Delivery"}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant={isPaid ? "success" : "warning"} size="sm">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isPaid ? "bg-emerald-500" : "bg-amber-500")} />
                            <span>{order.payment_status}</span>
                          </Badge>
                          <div className="text-[10px] text-stone-400 mt-1 uppercase font-semibold tracking-wider">
                            {order.payment_method.replace("_", " ")}
                            {order.is_dp === 1 ? " · DP 50%" : ""}
                          </div>
                          {order.payment_proof_url && (
                            <div className="mt-1.5">
                              <a
                                href={order.payment_proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-700 hover:text-stone-900 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0 text-stone-400" />
                                <span>View Proof</span>
                              </a>
                            </div>
                          )}
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              order.order_status === "COMPLETED"
                                ? "success"
                                : order.order_status === "DISPATCHED"
                                  ? "primary"
                                  : order.order_status === "CANCELLED"
                                    ? "danger"
                                    : "warning"
                            }
                            size="sm"
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                order.order_status === "COMPLETED"
                                  ? "bg-emerald-500"
                                  : order.order_status === "DISPATCHED"
                                    ? "bg-stone-800"
                                    : order.order_status === "CANCELLED"
                                      ? "bg-rose-500"
                                      : "bg-amber-500"
                              )}
                            />
                            {order.order_status.replace("_", " ")}
                          </Badge>
                          <div className="flex flex-col gap-1 mt-1">
                            {order.spk_number && (
                              <div className="space-y-0.5">
                                <div className="inline-flex items-center gap-1 font-mono tabular-nums text-[10px] text-stone-800 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/80 font-semibold w-fit">
                                  WO: {order.spk_number}
                                </div>
                                {typeof order.bop_progress === "number" && (
                                  <div className="flex items-center gap-1.5 w-24">
                                    <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-stone-800 rounded-full"
                                        style={{ width: `${Math.min(100, order.bop_progress)}%` }}
                                      />
                                    </div>
                                    <span className="text-[9px] font-mono tabular-nums text-stone-500">
                                      {order.bop_progress}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            {order.tracking_number && (
                              <div className="inline-flex items-center gap-1 font-mono tabular-nums text-[10px] text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/80 font-semibold w-fit">
                                DO: {order.tracking_number}
                              </div>
                            )}
                            {order.dp_ci_number && (
                              <div className="inline-flex items-center gap-1 font-mono tabular-nums text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 font-semibold w-fit">
                                DP: {order.dp_ci_number}
                              </div>
                            )}
                            {(order.final_ci_number || order.ci_number) && (
                              <div className="inline-flex items-center gap-1 font-mono tabular-nums text-[10px] text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200/80 font-semibold w-fit">
                                INV: {order.final_ci_number || order.ci_number}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <Button
                              variant="secondary"
                              size="xs"
                              onClick={() => setSelectedOrder(order)}
                              leftIcon={<FileText className="w-3.5 h-3.5 text-stone-500" />}
                            >
                              Details
                            </Button>

                            {!order.spk_number &&
                              order.order_status !== "CANCELLED" &&
                              order.order_status !== "COMPLETED" &&
                              (order.fulfillment_mode === "MTO" ||
                                order.fulfillment_mode === "HYBRID" ||
                                order.is_dp === 1) && (
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  isLoading={isTriggeringSpkId === order.id}
                                  onClick={() => handleTriggerSpkForOrder(order)}
                                  leftIcon={<Factory className="w-3.5 h-3.5 text-stone-700" />}
                                  title="Trigger official ERP Production Work Order, 3-stage BOP & WOT tickets"
                                >
                                  Trigger WO
                                </Button>
                              )}

                            {order.is_dp === 1 && !order.dp_ci_number && !order.ci_number && order.order_status !== "CANCELLED" ? (
                              <Button
                                variant="secondary"
                                size="xs"
                                isLoading={isCreatingInvoiceId === order.id}
                                onClick={() => handleCreateInvoiceForOrder(order, "DOWN_PAYMENT")}
                                leftIcon={<Receipt className="w-3.5 h-3.5 text-amber-600" />}
                                title="Issue Down Payment (DP) Invoice and credit COA 2106 Customer Deposits"
                              >
                                DP Invoice
                              </Button>
                            ) : order.dp_ci_number && !order.final_ci_number && order.order_status !== "CANCELLED" ? (
                              <Button
                                variant="secondary"
                                size="xs"
                                isLoading={isCreatingInvoiceId === order.id}
                                onClick={() => handleCreateInvoiceForOrder(order, "FINAL_SETTLEMENT")}
                                leftIcon={<Receipt className="w-3.5 h-3.5 text-emerald-700" />}
                                title="Issue Final Settlement Invoice & knock-off DP on COA 2106"
                              >
                                Settlement
                              </Button>
                            ) : order.ci_number || order.final_ci_number ? (
                              <Link
                                to="/invoices"
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-800 transition-all whitespace-nowrap"
                                title={`Open Invoice ${order.final_ci_number || order.ci_number} in Invoices module`}
                              >
                                <Receipt className="w-3.5 h-3.5 text-stone-600" />
                                <span>Invoice</span>
                              </Link>
                            ) : (
                              order.order_status !== "CANCELLED" && (
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  isLoading={isCreatingInvoiceId === order.id}
                                  onClick={() => handleCreateInvoiceForOrder(order, "STANDARD")}
                                  leftIcon={<Receipt className="w-3.5 h-3.5 text-stone-600" />}
                                  title="Issue official commercial invoice and post AR ledger"
                                >
                                  Issue Invoice
                                </Button>
                              )
                            )}

                            {canDispatchDo ? (
                              <Button
                                variant="primary"
                                size="xs"
                                isLoading={isDispatchingId === order.id}
                                onClick={() => handleDispatchOrderToDo(order)}
                                leftIcon={<Truck className="w-3.5 h-3.5" />}
                                title="Generate official ERP Delivery Note (DN), deduct stock & post COGS journal"
                              >
                                Dispatch DO
                              </Button>
                            ) : (
                              <Link
                                to="/deliveries"
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-800 transition-all whitespace-nowrap"
                                title="Open in Official ERP Deliveries module"
                              >
                                <Truck className="w-3.5 h-3.5 text-stone-600" />
                                <span>Deliveries</span>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: TAMPILAN & CMS TOKO PABRIK */}
      {activeTab === "cms" && <ShopCmsEditor />}

      {/* MODAL: CONFIGURE FINISHED GOODS SHOWROOM DISPLAY */}
      {editingItem && (
        <Modal
          isOpen={true}
          onClose={() => setEditingItem(null)}
          title={`Configure Showroom Display: ${editingItem.name}`}
          maxWidth="6xl"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingItem(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="shopadmin-showroom-form"
                variant="primary"
                isLoading={isSavingItem}
                leftIcon={<Check className="w-3.5 h-3.5" />}
              >
                Save Configuration
              </Button>
            </div>
          }
        >
          <form id="shopadmin-showroom-form" onSubmit={handleSaveItemDisplay} className="space-y-4 text-xs text-stone-700">
            {/* Read-only Item Master Bar */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">SKU Code</span>
                <span className="font-bold text-stone-900 font-mono tabular-nums">{editingItem.item_code}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Base Price</span>
                <span className="font-bold text-stone-900 font-mono tabular-nums">{formatIDR(editingItem.unit_price)}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Stockyard Qty</span>
                <span className={`font-bold font-mono tabular-nums ${editingItem.physical_qty > 0 ? "text-emerald-700" : "text-stone-500"}`}>
                  {editingItem.physical_qty || 0} {editingItem.uom}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Dimension</span>
                <span className="font-medium text-stone-800 font-mono tabular-nums">{editingItem.dimension || "Standard"}</span>
              </div>
            </div>

            {/* Visibility and Featured Switches */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 cursor-pointer">
                <div>
                  <span className="font-bold text-stone-900 block">Publish on Public Storefront</span>
                  <span className="text-[11px] text-stone-500">Enable visibility for retail buyers</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingItem.is_published_shop === 1}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      is_published_shop: e.target.checked ? 1 : 0,
                    })
                  }
                  className="w-4 h-4 accent-stone-900 rounded-md border-stone-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 cursor-pointer">
                <div>
                  <span className="font-bold text-stone-900 block">Featured on Homepage</span>
                  <span className="text-[11px] text-stone-500">Highlight in showroom recommendations</span>
                </div>
                <input
                  type="checkbox"
                  checked={editingItem.shop_featured === 1}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_featured: e.target.checked ? 1 : 0,
                    })
                  }
                  className="w-4 h-4 accent-stone-900 rounded-md border-stone-300"
                />
              </label>
            </div>

            {/* Availability Strategy & Production Parameters */}
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
              <div className="font-bold text-stone-900 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Availability &amp; Production Mode</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Strategy Availability & Sales Model"
                  value={editingItem.shop_availability_type || "AUTO"}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_availability_type: e.target.value as any,
                    })
                  }
                  options={[
                    {
                      value: "AUTO",
                      label: "Smart Auto (B2C Fixed Price if Priced, B2B Made to Order if Unpriced)",
                    },
                    {
                      value: "READY_STOCK",
                      label: "B2C - Retail Direct Sale (Fixed Price Required)",
                    },
                    {
                      value: "MAKE_TO_ORDER",
                      label: "B2B - Project Made to Order (Quotation Only / No Price Shown)",
                    },
                  ]}
                  helperText={
                    editingItem.shop_availability_type === "MAKE_TO_ORDER"
                      ? "B2B Mode: No price shown on storefront (Made to Order / RFQ Quotation)"
                      : editingItem.shop_availability_type === "READY_STOCK"
                        ? "B2C Mode: Fixed price mandatory for direct storefront purchase"
                        : "Auto Mode: Displays fixed price if set, or Made to Order if unpriced"
                  }
                />

                <Input
                  label="Minimum Order Qty (MOQ)"
                  type="number"
                  min={1}
                  value={editingItem.shop_moq || 1}
                  onChange={(e) =>
                    setEditingItem({
                      ...editingItem,
                      shop_moq: parseFloat(e.target.value) || 1,
                    })
                  }
                  className="font-mono tabular-nums"
                  helperText="Minimum order quantity per request"
                />
              </div>
            </div>

            {/* Pricing, Category, Weight & Marketing Badge */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Select
                label="Product Category"
                value={editingItem.category || "Paving & Precast"}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    category: e.target.value,
                  })
                }
                options={[
                  { value: "Paving & Precast", label: "Paving & Precast" },
                  { value: "Drainase & Kanstin", label: "Drainase & Kanstin" },
                  { value: "Fabrikasi Baja", label: "Fabrikasi Baja" },
                  { value: "General", label: "General" },
                ]}
                helperText="Showroom classification"
              />

              <CurrencyInput
                label="Base Unit Price (IDR)"
                value={editingItem.unit_price || 0}
                onChange={(val) =>
                  setEditingItem({
                    ...editingItem,
                    unit_price: val,
                  })
                }
                helperText="B2C Price (0 for B2B RFQ)"
              />

              <CurrencyInput
                label="Promotional Price (IDR)"
                disabled={editingItem.shop_availability_type === "MAKE_TO_ORDER"}
                value={
                  editingItem.shop_availability_type === "MAKE_TO_ORDER"
                    ? 0
                    : editingItem.shop_promo_price || 0
                }
                onChange={(val) =>
                  setEditingItem({
                    ...editingItem,
                    shop_promo_price: val,
                  })
                }
                helperText={
                  editingItem.shop_availability_type === "MAKE_TO_ORDER"
                    ? "Disabled for Made to Order"
                    : "Set 0 if no active promo"
                }
              />

              <Input
                label={`Unit Weight (KG/${editingItem.uom || "PCS"})`}
                type="number"
                step="0.1"
                value={editingItem.shop_weight_kg || 2.5}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    shop_weight_kg: parseFloat(e.target.value) || 2.5,
                  })
                }
                className="font-mono tabular-nums"
                helperText="Used for freight estimation"
              />

              <Select
                label="Marketing Badge"
                value={editingItem.shop_badge || ""}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    shop_badge: e.target.value,
                  })
                }
                options={[
                  { value: "", label: "No Badge" },
                  { value: "SNI Certified", label: "SNI Certified" },
                  { value: "Bestseller", label: "Bestseller" },
                  { value: "Heavy Duty", label: "Heavy Duty" },
                  { value: "Custom Press", label: "Custom Press" },
                  { value: "Top Rated", label: "Top Rated" },
                ]}
                helperText="Showroom promo tag"
              />
            </div>

            {/* Product Image Uploader with Multi-Photo Gallery Support (>=1 Photo) */}
            <ProductImageUploader
              id="showroom-image-uploader"
              label="PRODUCT GALLERY & PORTFOLIO PHOTOS (MULTI-UPLOAD SUPPORTED >= 1)"
              value={editingItem.shop_image_url || ""}
              galleryUrls={(() => {
                try {
                  if (Array.isArray(editingItem.shop_gallery_urls)) return editingItem.shop_gallery_urls;
                  if (typeof editingItem.shop_gallery_urls === "string") return JSON.parse(editingItem.shop_gallery_urls);
                  return [];
                } catch {
                  return [];
                }
              })()}
              onImagesChange={(primaryUrl, allGalleryUrls) => {
                setEditingItem((prev) =>
                  prev
                    ? {
                        ...prev,
                        shop_image_url: primaryUrl,
                        shop_gallery_urls: allGalleryUrls,
                      }
                    : prev,
                );
              }}
              pathPrefix="catalog_products"
            />

            {/* Description & Technical Notes */}
            <Textarea
              label="Storefront Description / Material Notes"
              rows={3}
              value={editingItem.description || ""}
              onChange={(e) =>
                setEditingItem({
                  ...editingItem,
                  description: e.target.value,
                })
              }
              placeholder="Compressive strength, application area, laying pattern..."
            />

          </form>
        </Modal>
      )}

      {/* MODAL: ORDER DETAILS & ERP HANDOFF */}
      <ShopOrderDetailModal
        selectedOrder={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        isTriggeringSpkId={isTriggeringSpkId}
        isCreatingInvoiceId={isCreatingInvoiceId}
        isDispatchingId={isDispatchingId}
        onTriggerSpk={handleTriggerSpkForOrder}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        onCreateInvoice={handleCreateInvoiceForOrder}
        onDispatchToDo={handleDispatchOrderToDo}
      />
    </div>
  );
}

