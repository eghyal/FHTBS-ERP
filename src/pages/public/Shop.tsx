import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ShopHeader } from "@/components/shop/ShopHeader";
import {
  PublicFooter,
  PublicTopExperience,
  usePublicCmsConfig,
} from "@/components/layouts/PublicLayout";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductDetailModal } from "@/components/shop/ProductDetailModal";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { CheckoutModal } from "@/components/shop/CheckoutModal";
import { OrderSuccessModal } from "@/components/shop/OrderSuccessModal";
import { OrderTrackingModal } from "@/components/shop/OrderTrackingModal";
import { CustomerAuthModal, PendingAuthAction } from "@/components/shop/CustomerAuthModal";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useShopCart } from "@/hooks/useShopCart";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";
import {
  ShieldCheck,
  Truck,
  Sparkles,
  Filter,
  ChevronDown,
  RefreshCw,
  Send,
  CheckCircle2,
  Phone,
  Mail,
  ExternalLink,
  ArrowRight,
  ShoppingBag,
  FileText,
  Package,
  HelpCircle,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { fetchJsonWithSmartCache } from "@/utils/smartCache";
import { trackPageView, trackSearch, trackFilter, trackProductView, trackCartAdd, rotateVisitorSession } from "@/lib/tracker";
import { signOutGoogleStoreCustomer } from "@/lib/googleStoreAuth";
import {
  DEFAULT_SHOP_CMS,
  harmonizeScenePalette,
  isAnnualEventActive,
  mergeShopCms,
  ShopCmsConfig,
  ShopBundleItem,
} from "@/constants/cmsDefaults";
import {
  getLatestCmsSnapshot,
  recordServerCmsSnapshot,
  subscribeToCmsUpdates,
} from "@/utils/cmsLiveSync";

export default function Shop() {
  const { showToast } = useToast();

  // Customer authentication state
  const [customer, setCustomer] = useState<any | null>(() => {
    try {
      const raw = localStorage.getItem("shop_customer_session_v1");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const {
    items: cartItems,
    totalItems,
    subtotal,
    totalWeightKg,
    addToCart,
    updateQty,
    removeFromCart,
    clearCart,
    hydrateFromSnapshot,
  } = useShopCart(customer?.id);

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [shopCms, setShopCms] = useState<ShopCmsConfig>(() => {
    const snap = getLatestCmsSnapshot<Partial<ShopCmsConfig>>("shop");
    return snap ? mergeShopCms(snap) : DEFAULT_SHOP_CMS;
  });
  const publicCms = usePublicCmsConfig();
  const publicEventActive = isAnnualEventActive(publicCms);
  const sceneThemeActive = publicEventActive && publicCms.event_scene_auto_theme;
  const harmonized = sceneThemeActive
    ? harmonizeScenePalette({
        primary: publicCms.event_primary_color || "#047857",
        secondary: publicCms.event_secondary_color || "#b45309",
        surfaceTint: publicCms.event_surface_tint || "#ecfdf5",
        badgeText: publicCms.event_badge_text_color || "#065f46",
      })
    : {
        primary: "#b02524",
        secondary: "#8e1d1c",
        surfaceTint: "#fff1f2",
        badgeText: "#8e1d1c",
      };
  const activeSurfaceTint = harmonized.surfaceTint;
  const activePrimaryColor = harmonized.primary;
  const activeSecondaryColor = harmonized.secondary;

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<PendingAuthAction | null>(null);

  // Modals state
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [lastPlacedOrder, setLastPlacedOrder] = useState<any>(null);
  const [trackingOrderNumber, setTrackingOrderNumber] = useState<string>("");

  // Customer Orders state ("Pesanan Saya")
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Contact Person & Project RFQ Modal State
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedProductForContact, setSelectedProductForContact] = useState<ShopProduct | null>(null);
  const [rfqSubmitting, setRfqSubmitting] = useState(false);
  const [rfqResult, setRfqResult] = useState<any>(null);
  const [rfqForm, setRfqForm] = useState({
    customer_name: "",
    company: "",
    phone: "",
    email: "",
    project_location: "",
    qty: "200",
    notes: "",
  });

  const getSavedOrderNumbers = (): string[] => {
    try {
      const raw = localStorage.getItem("pavingjoss_customer_order_numbers_v1");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const rememberOrderNumber = (orderNum: string) => {
    if (!orderNum) return;
    try {
      const existing = getSavedOrderNumbers();
      if (!existing.includes(orderNum)) {
        const next = [orderNum, ...existing].slice(0, 30);
        localStorage.setItem("pavingjoss_customer_order_numbers_v1", JSON.stringify(next));
      }
    } catch {}
  };

  const fetchCustomerOrders = async (activeCust = customer) => {
    const savedNums = getSavedOrderNumbers();
    if (!activeCust && savedNums.length === 0) {
      setCustomerOrders([]);
      return;
    }

    setIsLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      if (activeCust?.id) params.set("customer_id", activeCust.id);
      if (activeCust?.email) params.set("email", activeCust.email);
      if (activeCust?.phone) params.set("phone", activeCust.phone);
      if (activeCust?.customer_name) params.set("customer_name", activeCust.customer_name);
      if (savedNums.length > 0) params.set("order_numbers", savedNums.join(","));

      const res = await fetch(`/api/shop/customer-orders?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json?.success && Array.isArray(json.data)) {
        setCustomerOrders(json.data);
      }
    } catch (err) {
      console.warn("Failed to load customer orders:", err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  // Listen for customer auth changes across components/tabs and validate session with server
  useEffect(() => {
    const syncLocalAuthState = () => {
      try {
        const raw = localStorage.getItem("shop_customer_session_v1");
        setCustomer(raw ? JSON.parse(raw) : null);
      } catch {
        setCustomer(null);
      }
    };

    window.addEventListener("shop_customer_auth_changed", syncLocalAuthState);
    window.addEventListener("storage", syncLocalAuthState);
    return () => {
      window.removeEventListener("shop_customer_auth_changed", syncLocalAuthState);
      window.removeEventListener("storage", syncLocalAuthState);
    };
  }, []);

  // Validate and refresh active customer session from backend on mount
  useEffect(() => {
    if (!customer?.id && !customer?.email) return;
    let active = true;

    const params = new URLSearchParams();
    if (customer.id) params.set("customer_id", customer.id);
    if (customer.email) params.set("email", customer.email);

    fetch(`/api/shop/customer-session?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!active || !json?.success || !json?.data) return;
        localStorage.setItem("shop_customer_session_v1", JSON.stringify(json.data));
        setCustomer(json.data);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [customer?.id]);

  // Fetch customer's orders whenever customer logs in or changes
  useEffect(() => {
    if (customer) {
      fetchCustomerOrders(customer);
    } else {
      setCustomerOrders([]);
    }
  }, [customer?.id, customer?.email, customer?.phone]);

  // Sync cart updates to server if customer is authenticated
  const syncCustomerCart = async (customerId: string, updatedItems: any[]) => {
    if (!customerId) return;
    try {
      await fetch("/api/shop/customer-cart-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          cart_items: updatedItems,
        }),
      });
    } catch (err) {
      console.warn("Background cart sync note:", err);
    }
  };

  const isInitialCartSyncMount = useRef(true);

  useEffect(() => {
    if (isInitialCartSyncMount.current) {
      isInitialCartSyncMount.current = false;
      return;
    }
    if (!customer?.id) return;
    const timer = setTimeout(() => {
      syncCustomerCart(customer.id, cartItems);
    }, 400);
    return () => clearTimeout(timer);
  }, [cartItems, customer?.id]);

  const isInitialSearchMount = useRef(true);

  const fetchProducts = async () => {
    setHasError(false);
    const params = new URLSearchParams();
    if (selectedCategory && selectedCategory !== "ALL") {
      params.append("category", selectedCategory);
    }
    if (searchQuery.trim()) {
      params.append("q", searchQuery.trim());
    }
    if (sortBy) {
      params.append("sort", sortBy);
    }
    const url = `/api/shop/products?${params.toString()}`;

    // Only show skeleton spinner if we have no products yet
    if (products.length === 0) {
      setIsLoading(true);
    }

    try {
      const json = await fetchJsonWithSmartCache<any>(url, {
        ttlMs: 60_000,
        onRevalidate: (freshJson) => {
          if (freshJson?.success) {
            setProducts(freshJson.data || []);
            if (freshJson.categories && freshJson.categories.length > 0) {
              setCategories(freshJson.categories);
            }
          }
        },
      });
      if (json?.success) {
        setProducts(json.data || []);
        if (json.categories && json.categories.length > 0) {
          setCategories(json.categories);
        }
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error("Failed to load shop products:", err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    trackPageView("SHOP", "Katalog Produk & Toko Online Paving Joss", "/shop");
    const unsubscribeLive = subscribeToCmsUpdates<Partial<ShopCmsConfig>>(
      "shop",
      (data) => {
        setShopCms(mergeShopCms(data));
      },
    );

    apiFetch("/api/cms/shop")
      .then((res) => {
        if (res.ok && res.data && typeof res.data === "object") {
          const merged = mergeShopCms(res.data);
          recordServerCmsSnapshot("shop", merged);
          setShopCms(merged);
        }
      })
      .catch(() => {});

    return () => {
      unsubscribeLive();
    };
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, sortBy]);

  // Debounced search (skips duplicate initial mount call)
  useEffect(() => {
    if (isInitialSearchMount.current) {
      isInitialSearchMount.current = false;
      return;
    }
    const handler = setTimeout(() => {
      fetchProducts();
      if (searchQuery.trim().length >= 2) {
        trackSearch(searchQuery.trim(), "SHOP");
      }
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleViewDetail = useCallback((product: ShopProduct) => {
    setSelectedProduct(product);
    trackProductView(product);
  }, []);

  const handleOpenRfqModal = useCallback(
    (productForRfq?: ShopProduct | null) => {
      if (!customer) {
        showToast(
          "Silakan Sign In terlebih dahulu untuk mengajukan penawaran proyek (RFQ).",
          "info",
        );
        setPendingAuthAction({
          actionType: "OPEN_RFQ",
          product: productForRfq || undefined,
        });
        setIsAuthModalOpen(true);
        return;
      }

      setSelectedProductForContact(productForRfq || null);
      setRfqResult(null);
      setRfqForm((prev) => ({
        ...prev,
        customer_name: customer?.customer_name || prev.customer_name,
        company: customer?.company || prev.company,
        phone: customer?.phone || prev.phone,
        email: customer?.email || prev.email,
      }));
      setIsContactModalOpen(true);
    },
    [customer, showToast],
  );

  const handleAddToCart = useCallback(
    (product: ShopProduct, qty: number) => {
      const isMto =
        product.availability_type === "MAKE_TO_ORDER" ||
        (product.availability_type === "AUTO" &&
          (product.promo_price > 0 ? product.promo_price : product.unit_price) <= 0);

      if (isMto) {
        handleOpenRfqModal(product);
        return;
      }

      trackCartAdd(product, qty);
      addToCart(product, qty);
    },
    [addToCart, handleOpenRfqModal],
  );

  const handleInstantBuy = useCallback(
    (product: ShopProduct, qty: number) => {
      trackCartAdd(product, qty);
      addToCart(product, qty);
      setIsCartOpen(false);
      setIsCheckoutOpen(true);
    },
    [addToCart],
  );

  const promoProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.availability_type !== "MAKE_TO_ORDER" &&
          Number(p.unit_price) > 0 &&
          ((Number(p.promo_price) > 0 && Number(p.promo_price) < Number(p.unit_price)) ||
            (p.badge && p.badge.trim() !== "") ||
            p.is_featured === 1),
      ),
    [products],
  );

  const handleAddPromoItem = useCallback(
    (promoProduct: ShopProduct) => handleAddToCart(promoProduct, 1),
    [handleAddToCart],
  );

  const handleAuthSuccess = (newCustomer: any) => {
    rotateVisitorSession();
    setCustomer(newCustomer);
    fetchCustomerOrders(newCustomer);

    // Hydrate any saved server cart snapshot items into the customer's cart
    if (Array.isArray(newCustomer?.cart_snapshot) && newCustomer.cart_snapshot.length > 0 && products.length > 0) {
      hydrateFromSnapshot(newCustomer.cart_snapshot, products, newCustomer.id);
    }

    if (pendingAuthAction) {
      if (pendingAuthAction.actionType === "OPEN_RFQ") {
        setSelectedProductForContact(pendingAuthAction.product || null);
        setRfqResult(null);
        setRfqForm((prev) => ({
          ...prev,
          customer_name: newCustomer?.customer_name || prev.customer_name,
          company: newCustomer?.company || prev.company,
          phone: newCustomer?.phone || prev.phone,
          email: newCustomer?.email || prev.email,
        }));
        setIsContactModalOpen(true);
      } else if (pendingAuthAction.actionType === "OPEN_ORDERS") {
        setTrackingOrderNumber("");
        setIsTrackingOpen(true);
      } else if (pendingAuthAction.actionType === "VIEW_DETAIL" && pendingAuthAction.product) {
        setSelectedProduct(pendingAuthAction.product);
        trackProductView(pendingAuthAction.product);
      } else if (
        (pendingAuthAction.isInstantBuy || pendingAuthAction.actionType === "INSTANT_BUY") &&
        pendingAuthAction.product
      ) {
        addToCart(pendingAuthAction.product, pendingAuthAction.qty || 1);
        setIsCheckoutOpen(true);
      } else if (pendingAuthAction.product) {
        addToCart(pendingAuthAction.product, pendingAuthAction.qty || 1);
      }
      setPendingAuthAction(null);
    }
  };

  const handleLogoutCustomer = async () => {
    rotateVisitorSession();
    setCustomer(null);
    setCustomerOrders([]);
    await signOutGoogleStoreCustomer();
  };

  const handleProceedToCheckout = () => {
    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  };

  const handleOrderPlaced = (orderData: any) => {
    if (orderData?.order_number) {
      rememberOrderNumber(orderData.order_number);
    }
    setLastPlacedOrder(orderData);
    clearCart();
    setIsCheckoutOpen(false);
    setIsSuccessOpen(true);
    fetchCustomerOrders(customer);
  };

  const handleOpenTrackingWithOrder = (orderNumber: string) => {
    if (orderNumber) {
      rememberOrderNumber(orderNumber);
    }
    setTrackingOrderNumber(orderNumber);
    fetchCustomerOrders(customer);
    setIsTrackingOpen(true);
  };

  const handleOpenOrdersButton = () => {
    if (!customer) {
      setPendingAuthAction({ actionType: "OPEN_ORDERS" });
      setIsAuthModalOpen(true);
      return;
    }
    setTrackingOrderNumber("");
    fetchCustomerOrders(customer);
    setIsTrackingOpen(true);
  };

  const handleOrderLinked = (linkedOrder: any) => {
    if (!linkedOrder?.order_number) return;
    rememberOrderNumber(linkedOrder.order_number);
    setCustomerOrders((prev) => {
      const idx = prev.findIndex((o) => o.order_number === linkedOrder.order_number);
      if (idx > -1) {
        const updated = [...prev];
        updated[idx] = linkedOrder;
        return updated;
      }
      return [linkedOrder, ...prev];
    });
  };

  const handleBuyAgain = (order: any) => {
    const orderItems = Array.isArray(order?.items) ? order.items : [];
    if (orderItems.length === 0) return;

    for (const item of orderItems) {
      const matchedProduct = products.find(
        (p) =>
          p.id === item.item_id ||
          (p.item_code && p.item_code === item.item_code) ||
          p.name === item.item_name
      );

      const qtyToBuy = Math.max(1, Number(item.qty) || 1);

      if (matchedProduct) {
        addToCart(matchedProduct, qtyToBuy);
      } else {
        const unitPrice =
          Number(item.unit_price) ||
          (item.total_price && item.qty ? Number(item.total_price) / Number(item.qty) : 0);
        const fallbackProduct: ShopProduct = {
          id: item.item_id || item.item_code || `ITEM-${Date.now()}`,
          item_code: item.item_code || "SKU",
          name: item.item_name || "Material Paving Joss",
          category: item.category || "Material Beton",
          uom: item.uom || "Unit",
          unit_price: unitPrice,
          promo_price: 0,
          weight_kg: Number(item.weight_kg) || 2.5,
          image_url: item.image_url || "",
          gallery_urls: [],
          badge: "",
          is_featured: 0,
          availability_type: "READY_STOCK",
          lead_time_days: 3,
          moq: Number(item.moq) || 1,
          technical_specs: "",
          description: "",
          available_qty: 999,
        };
        addToCart(fallbackProduct, qtyToBuy);
      }
    }

    setIsTrackingOpen(false);
    setIsCartOpen(true);
  };

  const handleSelectBundleForRfq = useCallback(
    (bundle: ShopBundleItem) => {
      const syntheticProduct: ShopProduct = {
        id: bundle.id,
        item_code: bundle.id,
        name: bundle.name,
        category: "Paket Bundling Proyek",
        uom: "M2",
        unit_price: bundle.bundle_price,
        promo_price: 0,
        weight_kg: 100,
        image_url: "",
        gallery_urls: [],
        badge: bundle.saving_badge,
        is_featured: 1,
        availability_type: "MAKE_TO_ORDER",
        lead_time_days: 7,
        moq: bundle.default_qty || 100,
        technical_specs: bundle.items_summary,
        description: `${bundle.target_use} — ${bundle.items_summary}`,
        available_qty: 999,
      };
      setRfqForm((prev) => ({
        ...prev,
        qty: String(bundle.default_qty || 100),
        notes: `Permintaan Paket Bundling: ${bundle.name} (${bundle.items_summary}) - Estimasi Harga Paket ${formatIDR(bundle.bundle_price)}`,
      }));
      handleOpenRfqModal(syntheticProduct);
    },
    [handleOpenRfqModal],
  );

  const promoBannerThemeClasses =
    shopCms.promo_theme === "dark"
      ? "from-stone-900 via-stone-800 to-stone-950 text-white"
      : shopCms.promo_theme === "emerald"
        ? "from-emerald-900 via-emerald-800 to-teal-950 text-white"
        : "from-[#b02524] via-[#961f1e] to-stone-900 text-white";

  return (
    <div className="min-h-screen bg-[#faf9f6] text-stone-900 flex flex-col font-sans antialiased">
      {/* Unified Light-Gray ASCII Marquee Top Bar + Annual Event Ornament Banner & Scene Theme */}
      <PublicTopExperience
        extraAnnouncementText={
          shopCms.announcement_enabled && shopCms.announcement_text
            ? shopCms.announcement_text
            : undefined
        }
      />

      {/* Clean Navigation Header */}
      <ShopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        cartItemCount={totalItems}
        orderCount={customerOrders.length}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenTracking={handleOpenOrdersButton}
        customer={customer}
        onOpenAuth={() => {
          setPendingAuthAction(null);
          setIsAuthModalOpen(true);
        }}
        onLogoutCustomer={handleLogoutCustomer}
      />

      {/* Sleek, Clean & Simple Header with Continuous Seamless Atmospheric Gradient Blend */}
      <section
        className="border-b border-stone-200/40 py-5 sm:py-7 relative overflow-hidden"
        style={{
          background: sceneThemeActive
            ? `radial-gradient(ellipse 95% 100% at 50% 0%, ${activePrimaryColor}12 0%, ${activeSurfaceTint}B8 48%, #faf9f6 100%)`
            : "radial-gradient(ellipse 95% 100% at 50% 0%, rgba(176, 37, 36, 0.05) 0%, rgba(255, 241, 242, 0.52) 48%, #faf9f6 100%)",
        }}
      >
        <div className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 relative z-10">
          {/* Catalog Section Label */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <span className="public-glass-badge inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider text-stone-800">
              <span
                className="public-glass-accent-blur -left-1 top-1/2 -translate-y-1/2 w-12 h-7"
                style={{ backgroundColor: activePrimaryColor }}
                aria-hidden="true"
              />
              <span className="w-1.5 h-1.5 rounded-full bg-stone-400/70 relative z-10" />
              <span className="relative z-10">Katalog Toko Pabrik</span>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-stone-900 tracking-tight">
                {shopCms.header_title}
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 mt-0.5 sm:mt-1">
                {shopCms.header_subtitle}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="public-glass-stat-card inline-flex items-center gap-2.5 font-bold text-stone-800 px-3.5 py-2 rounded-xl">
                <span
                  className="public-glass-accent-blur left-1 top-1/2 -translate-y-1/2 w-10 h-8 bg-emerald-500"
                  aria-hidden="true"
                />
                <span className="public-glass-icon-well w-6 h-6 rounded-lg flex items-center justify-center shrink-0 relative z-10">
                  <ShieldCheck className="w-3.5 h-3.5 text-stone-600" />
                </span>
                <span className="relative z-10">{shopCms.trust_badge_1}</span>
              </div>
              <div className="public-glass-stat-card inline-flex items-center gap-2.5 font-bold text-stone-800 px-3.5 py-2 rounded-xl">
                <span
                  className="public-glass-accent-blur left-1 top-1/2 -translate-y-1/2 w-10 h-8"
                  style={{ backgroundColor: activePrimaryColor }}
                  aria-hidden="true"
                />
                <span className="public-glass-icon-well w-6 h-6 rounded-lg flex items-center justify-center shrink-0 relative z-10">
                  <Truck className="w-3.5 h-3.5 text-stone-600" />
                </span>
                <span className="relative z-10">{shopCms.trust_badge_2}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Viewport */}
      <main className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 w-full pb-28 md:pb-12">
        {/* Campaign Promo Banner (CMS Controlled & Harmonized with Scene Palette) */}
        {shopCms.promo_banner_enabled && (
          <div
            className={`mb-6 sm:mb-8 rounded-2xl bg-gradient-to-r ${promoBannerThemeClasses} p-5 sm:p-7 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5`}
            style={
              shopCms.promo_theme === "crimson" || sceneThemeActive
                ? {
                    background: `linear-gradient(115deg, ${activePrimaryColor} 0%, ${activeSecondaryColor} 68%, #1c1917 100%)`,
                  }
                : undefined
            }
          >
            <div className="space-y-1.5 max-w-2xl">
              {shopCms.promo_badge && (
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/85 block">
                  {shopCms.promo_badge}
                </span>
              )}
              <h2 className="text-lg sm:text-2xl font-black tracking-tight leading-snug">
                {shopCms.promo_title}
              </h2>
              <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
                {shopCms.promo_subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenRfqModal(null)}
              className="px-5 py-3 rounded-xl bg-white hover:bg-stone-100 text-stone-900 text-xs font-extrabold inline-flex items-center gap-2 shrink-0 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <FileText className="w-4 h-4 text-[#b02524]" />
              <span>{shopCms.promo_cta_text}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Curated Project Bundles Section (CMS Controlled) */}
        {shopCms.show_bundles &&
          Array.isArray(shopCms.bundles) &&
          shopCms.bundles.length > 0 && (
            <section className="mb-8 sm:mb-10">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base sm:text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                    <Package className="w-5 h-5 text-[#b02524]" />
                    <span>{shopCms.bundles_section_title}</span>
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {shopCms.bundles_section_subtitle}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shopCms.bundles.map((bundle, idx) => (
                  <div
                    key={bundle.id || idx}
                    className="bg-white rounded-2xl border border-stone-200/90 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-stone-500 font-semibold">
                          {bundle.area_coverage}
                        </span>
                        {bundle.saving_badge && (
                          <span className="text-emerald-700 font-extrabold">
                            {bundle.saving_badge}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-black text-stone-900 leading-snug">
                        {bundle.name}
                      </h3>

                      <p className="text-xs font-semibold text-[#b02524]">
                        {bundle.target_use}
                      </p>

                      <p className="text-xs text-stone-600 leading-relaxed pt-1 border-t border-stone-100">
                        {bundle.items_summary}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-stone-400 block">
                          Estimasi Harga Paket
                        </span>
                        <span className="text-base font-black text-stone-900 font-mono tabular-nums">
                          {formatIDR(bundle.bundle_price)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectBundleForRfq(bundle)}
                        className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-[#b02524] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <span>Pesan Paket</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        {/* Controls Bar: Categories & Sorting */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 sm:gap-4 pb-4 sm:pb-6 border-b border-stone-200/80 mb-6 sm:mb-8">
          {/* Category Chips with smooth touch swipe */}
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto w-full md:w-auto pb-1.5 md:pb-0 scrollbar-none touch-pan-x">
            <button
              onClick={() => {
                setSelectedCategory("ALL");
                trackFilter("Kategori Produk", "Semua Produk", "SHOP");
              }}
              className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
                selectedCategory === "ALL"
                  ? "bg-[#b02524] text-white shadow-xs"
                  : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/80"
              }`}
            >
              Semua Produk
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  trackFilter("Kategori Produk", cat, "SHOP");
                }}
                className={`px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-[#b02524] text-white shadow-xs"
                    : "bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Sort Selector & Product Count */}
          <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 w-full md:w-auto shrink-0">
            <span className="text-xs font-medium text-stone-500">
              Menampilkan <span className="font-bold font-mono tabular-nums text-stone-900">{products.length}</span> Produk
            </span>

            <div className="relative flex items-center">
              <Filter className="w-3.5 h-3.5 text-stone-400 absolute left-3 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="pl-8 pr-8 py-2 bg-white border border-stone-200/90 rounded-xl text-xs font-bold text-stone-800 appearance-none hover:border-stone-400 focus:outline-hidden cursor-pointer shadow-2xs touch-manipulation"
              >
                <option value="popular">Paling Populer</option>
                <option value="price_asc">Harga: Terendah ke Tertinggi</option>
                <option value="price_desc">Harga: Tertinggi ke Terendah</option>
                <option value="name_asc">Nama: A ke Z</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => handleOpenRfqModal(null)}
              title={
                customer
                  ? "Ajukan Penawaran Proyek (RFQ) ke Sales ERP"
                  : "Sign In untuk Mengajukan Penawaran Proyek (RFQ)"
              }
              className="group pl-2.5 pr-3.5 py-1.5 bg-gradient-to-r from-red-50 via-white to-amber-50/70 hover:from-[#b02524] hover:via-[#b02524] hover:to-[#961f1e] text-[#b02524] hover:text-white border border-[#b02524]/25 hover:border-[#b02524] rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-2xs hover:shadow-md hover:shadow-red-900/15 transition-all duration-200 cursor-pointer shrink-0 active:scale-[0.98]"
            >
              <span className="w-6 h-6 rounded-lg bg-[#b02524]/10 group-hover:bg-white/20 text-[#b02524] group-hover:text-white flex items-center justify-center transition-colors shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </span>
              <span className="tracking-tight">Ajukan RFQ Proyek</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          </div>
        </div>

        {/* Product Cards Grid or Simple Elegant Empty State */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-stone-200/80 p-4 animate-pulse flex flex-col gap-3"
              >
                <div className="w-full aspect-4/3 bg-stone-100 rounded-xl" />
                <div className="h-4 bg-stone-100 rounded w-3/4" />
                <div className="h-3 bg-stone-100 rounded w-1/2" />
                <div className="h-8 bg-stone-100 rounded-xl mt-auto" />
              </div>
            ))}
          </div>
        ) : hasError ? (
          <div className="max-w-md mx-auto py-12 px-6 bg-white rounded-3xl border border-stone-200/80 shadow-xs text-center my-6">
            <h3 className="text-lg font-bold text-stone-900 mb-2">
              Gagal Memuat Katalog Produk
            </h3>
            <p className="text-xs text-stone-500 mb-6">
              Terjadi kendala saat menyinkronkan data katalog dari server pabrik.
            </p>
            <button
              type="button"
              onClick={() => fetchProducts()}
              className="px-5 py-2.5 bg-[#b02524] hover:bg-[#8e1d1c] text-white rounded-lg text-xs font-bold transition-all shadow-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Coba Muat Ulang</span>
            </button>
          </div>
        ) : products.length === 0 ? (
          /* Simple, Elegant, Non-Overinformative Showcase */
          <div className="max-w-xl mx-auto py-12 px-6 sm:px-8 bg-white rounded-xl border border-stone-200/80 shadow-xs text-center my-6">
            <div className="w-14 h-14 rounded-xl bg-red-50 text-[#b02524] flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6" />
            </div>

            <span className="text-[10px] font-bold text-[#b02524] uppercase tracking-widest bg-red-50 px-3 py-1 rounded-md border border-red-100 inline-block mb-3">
              Made-to-Order &amp; Custom Fabrication
            </span>

            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Katalog Sedang Dipersiapkan
            </h2>

            <p className="text-xs sm:text-sm text-stone-500 mt-2.5 max-w-md mx-auto leading-relaxed">
              Saat ini seluruh pemesanan material beton presisi dan fabrikasi baja dilayani secara custom sesuai spesifikasi teknis dan kebutuhan proyek Anda.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
              <a
                href="https://wa.me/6281111113993?text=Halo%20Paving%20Joss,%20saya%20ingin%20konsultasi%20spesifikasi%20dan%20permintaan%20penawaran%20harga%20custom."
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-6 py-3 bg-[#b02524] hover:bg-[#8e1d1c] text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 inline-flex items-center justify-center gap-2"
              >
                <span>Konsultasi via WhatsApp (0811-1111-3993)</span>
              </a>
              <button
                type="button"
                onClick={() => handleOpenRfqModal(null)}
                className="group w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-red-50 via-white to-amber-50/70 hover:from-[#b02524] hover:to-[#961f1e] text-[#b02524] hover:text-white border border-[#b02524]/25 hover:border-[#b02524] rounded-xl font-bold text-xs uppercase tracking-wider transition-all inline-flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <FileText className="w-4 h-4" />
                <span>Ajukan RFQ &amp; Penawaran</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium text-stone-400">
              <span>✓ Standar Mutu SNI &amp; Teruji</span>
              <span>•</span>
              <span>✓ Custom Dimensi &amp; CAD</span>
              <span>•</span>
              <span>✓ Pengiriman Langsung ke Site</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isAuthenticated={!!customer}
                onAddToCart={handleAddToCart}
                onViewDetail={handleViewDetail}
                onContactSales={(p) => handleOpenRfqModal(p)}
              />
            ))}
          </div>
        )}

        {/* Delivery Fleet Guide, Quality Guarantees & FAQ Section (CMS Controlled) */}
        {shopCms.show_info_sections && (
          <section className="mt-12 sm:mt-16 pt-10 border-t border-stone-200/80 space-y-10">
            {/* Fleet Guide */}
            {Array.isArray(shopCms.fleets) && shopCms.fleets.length > 0 && (
              <div>
                <div className="mb-5">
                  <h2 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                    <Truck className="w-5 h-5 text-[#b02524]" />
                    <span>{shopCms.fleet_section_title}</span>
                  </h2>
                  <p className="text-xs sm:text-sm text-stone-500 mt-1">
                    {shopCms.fleet_section_subtitle}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {shopCms.fleets.map((fl, i) => (
                    <div
                      key={fl.id || i}
                      className="bg-white rounded-2xl border border-stone-200/90 p-4 shadow-2xs space-y-2"
                    >
                      <h3 className="text-sm font-black text-stone-900">
                        {fl.name}
                      </h3>
                      <div className="text-xs font-extrabold text-[#b02524]">
                        Kapasitas: {fl.capacity}
                      </div>
                      <div className="text-xs font-semibold text-stone-700">
                        Syarat Akses: {fl.road_access}
                      </div>
                      <p className="text-xs text-stone-500 leading-relaxed pt-1 border-t border-stone-100">
                        {fl.notes}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quality Guarantees */}
            {Array.isArray(shopCms.quality_guarantees) &&
              shopCms.quality_guarantees.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {shopCms.quality_guarantees.map((q, i) => (
                    <div
                      key={q.id || i}
                      className="bg-stone-900 text-white rounded-2xl p-5 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Jaminan Resmi Pabrik</span>
                      </div>
                      <h3 className="text-sm font-black text-white">
                        {q.title}
                      </h3>
                      <p className="text-xs text-stone-300 leading-relaxed">
                        {q.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

            {/* FAQs */}
            {Array.isArray(shopCms.faqs) && shopCms.faqs.length > 0 && (
              <div>
                <h2 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight flex items-center gap-2 mb-4">
                  <HelpCircle className="w-5 h-5 text-[#b02524]" />
                  <span>Informasi &amp; Tanya Jawab Pembelian (FAQ)</span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shopCms.faqs.map((faq, i) => (
                    <div
                      key={faq.id || i}
                      className="bg-white rounded-2xl border border-stone-200/90 p-5 space-y-1.5 shadow-2xs"
                    >
                      <h3 className="text-sm font-black text-stone-900">
                        {faq.question}
                      </h3>
                      <p className="text-xs text-stone-600 leading-relaxed">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Mobile Floating Sticky Cart Bar (Easy checkout navigation on responsive mobile) */}
      {totalItems > 0 && (
        <div className="md:hidden fixed bottom-4 left-3 right-3 z-30 animate-in slide-in-from-bottom-3 duration-200">
          <div className="bg-stone-950/95 backdrop-blur-md text-white rounded-2xl p-3 shadow-2xl border border-stone-800/90 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-white" />
                <span className="absolute -top-1 -right-1 bg-[#b02524] text-white text-[10px] font-black font-mono tabular-nums w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-stone-300 font-medium truncate">
                  <span className="font-mono tabular-nums font-bold">{totalItems}</span> barang di keranjang
                </div>
                <div className="text-sm font-black font-mono tabular-nums text-white tracking-tight">
                  {formatIDR(subtotal)}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsCartOpen(true)}
              className="py-2.5 px-3.5 rounded-xl bg-[#b02524] hover:bg-red-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-sm transition-transform cursor-pointer touch-manipulation"
              aria-label="Lihat Keranjang Belanja"
            >
              <span>Keranjang</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16">
        <PublicFooter />
      </div>

      {/* Contact Sales & Direct B2B Project RFQ Window (Connected to Sales Quotations ERP) */}
      <Modal
        isOpen={isContactModalOpen}
        onClose={() => {
          setIsContactModalOpen(false);
          setSelectedProductForContact(null);
          setRfqResult(null);
        }}
        maxWidth="lg"
        title="Ajukan Penawaran Proyek (RFQ) & Kontak Sales"
      >
        <div className="p-6 space-y-5 text-stone-800">
          {/* Selected Product Pill if opened from a specific product */}
          {selectedProductForContact && (
            <div className="flex items-center gap-3 p-3 bg-stone-50 border border-stone-200/80 rounded-2xl">
              <img
                src={selectedProductForContact.image_url || "https://images.unsplash.com/photo-1584463623578-3062b88137f4?w=800&auto=format&fit=crop&q=80"}
                alt={selectedProductForContact.name}
                className="w-12 h-12 rounded-xl object-cover border border-stone-200 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-mono text-stone-400 font-bold">
                  {selectedProductForContact.item_code}
                </div>
                <div className="text-xs font-bold text-stone-900 truncate">
                  {selectedProductForContact.name}
                </div>
                <div className="text-[11px] text-amber-800 font-semibold mt-0.5">
                  Made to Order / Penawaran Proyek ({selectedProductForContact.uom})
                </div>
              </div>
            </div>
          )}

          {rfqResult ? (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center space-y-3">
              <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-white px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Tersinkronisasi ke Sales ERP
                </span>
                <h4 className="text-base font-black text-stone-900 mt-1.5">
                  Draf Quotation Resmi Terbit: <span className="font-mono text-[#b02524]">{rfqResult.quotation_number}</span>
                </h4>
                <p className="text-xs text-stone-600 mt-1">
                  Permintaan penawaran untuk <strong>{rfqResult.item_name} ({rfqResult.qty} {rfqResult.uom})</strong> telah masuk ke daftar Quotations Sales ERP kami.
                </p>
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <a
                  href={`https://wa.me/6281111113993?text=${encodeURIComponent(
                    `Halo Sales Paving Joss, saya sudah mengajukan RFQ di Toko Pabrik dengan Nomor Quotation: ${rfqResult.quotation_number} (${rfqResult.item_name} - ${rfqResult.qty} ${rfqResult.uom}).`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Konfirmasi via WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={() => setRfqResult(null)}
                  className="px-4 py-2 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-bold cursor-pointer"
                >
                  Buat RFQ Lain
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const cName = rfqForm.customer_name.trim() || customer?.customer_name || "";
                const cPhone = rfqForm.phone.trim() || customer?.phone || "";
                const cEmail = rfqForm.email.trim() || customer?.email || "";
                if (!cName || (!cPhone && !cEmail)) {
                  showToast("Mohon isi Nama serta Nomor WhatsApp atau Email Anda.", "error");
                  return;
                }
                setRfqSubmitting(true);
                try {
                  const res = await apiFetch("/api/public/rfq", {
                    method: "POST",
                    body: JSON.stringify({
                      customer_name: cName,
                      company: rfqForm.company.trim() || customer?.company || cName,
                      phone: cPhone,
                      email: cEmail,
                      project_location: rfqForm.project_location.trim() || "Jawa Timur",
                      item_id: selectedProductForContact?.id || null,
                      item_name: selectedProductForContact?.name || "Paket Material Proyek",
                      item_code: selectedProductForContact?.item_code || null,
                      uom: selectedProductForContact?.uom || "M2",
                      unit_price: selectedProductForContact?.unit_price || 0,
                      qty: Number(rfqForm.qty) || 100,
                      notes: rfqForm.notes,
                      source_module: "SHOP_STOREFRONT",
                    }),
                  });
                  if (res.ok && res.data) {
                    setRfqResult(res.data.data || res.data);
                    showToast("Permintaan Penawaran (RFQ) tercatat di Sales ERP!", "success");
                  } else {
                    showToast(res.error || "Gagal mengirim permintaan penawaran", "error");
                  }
                } catch {
                  showToast("Kesalahan jaringan saat mengirim RFQ", "error");
                } finally {
                  setRfqSubmitting(false);
                }
              }}
              className="p-4 rounded-2xl bg-stone-50 border border-stone-200/90 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#b02524]" />
                  <span>Formulir RFQ Cepat (Otomatis Masuk Sales ERP)</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Input
                  type="text"
                  required
                  placeholder="Nama Lengkap / PIC *"
                  value={rfqForm.customer_name || customer?.customer_name || ""}
                  onChange={(e) => setRfqForm({ ...rfqForm, customer_name: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="Nama Perusahaan / Kontraktor"
                  value={rfqForm.company || customer?.company || ""}
                  onChange={(e) => setRfqForm({ ...rfqForm, company: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <Input
                  type="tel"
                  required
                  placeholder="No. WhatsApp *"
                  value={rfqForm.phone || customer?.phone || ""}
                  onChange={(e) => setRfqForm({ ...rfqForm, phone: e.target.value })}
                  className="font-mono tabular-nums"
                />
                <Input
                  type="text"
                  required
                  placeholder="Lokasi Proyek (Kota) *"
                  value={rfqForm.project_location}
                  onChange={(e) => setRfqForm({ ...rfqForm, project_location: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  required
                  placeholder={`Volume (${selectedProductForContact?.uom || "M2"}) *`}
                  value={rfqForm.qty}
                  onChange={(e) => setRfqForm({ ...rfqForm, qty: e.target.value })}
                  className="font-mono tabular-nums font-bold"
                />
              </div>

              <Textarea
                rows={2}
                placeholder="Catatan spesifikasi / mutu beton / jadwal pengiriman proyek..."
                value={rfqForm.notes}
                onChange={(e) => setRfqForm({ ...rfqForm, notes: e.target.value })}
              />

              <Button
                type="submit"
                variant="primary"
                isLoading={rfqSubmitting}
                leftIcon={<Send className="w-3.5 h-3.5" />}
                className="w-full bg-[#b02524] hover:bg-[#961f1e] border-[#b02524]"
              >
                {rfqSubmitting ? "Membuat Quotation..." : "Terbitkan Permintaan Penawaran (RFQ)"}
              </Button>
            </form>
          )}

          {/* 2 Primary Direct Contact Channels: Phone & Email */}
          <div className="space-y-2.5 pt-2 border-t border-stone-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
              Atau Hubungi Langsung Tim Komersial
            </span>
            {/* 1. Phone / WhatsApp */}
            <div className="p-3.5 rounded-2xl border border-stone-200 bg-white hover:border-emerald-300 transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                    Telepon / WhatsApp
                  </span>
                  <div className="text-sm font-bold text-stone-900 font-mono tracking-tight truncate">
                    0811-1111-3993
                  </div>
                </div>
              </div>

              <a
                href={`https://wa.me/6281111113993?text=${encodeURIComponent(
                  `Halo Sales Paving Joss, saya ingin meminta penawaran harga untuk produk: ${
                    selectedProductForContact?.name || "Material Made to Order"
                  } (${selectedProductForContact?.item_code || "-"})`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <span>WhatsApp</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* 2. Email */}
            <div className="p-3.5 rounded-2xl border border-stone-200 bg-white hover:border-blue-300 transition-colors flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">
                    Email Resmi
                  </span>
                  <div className="text-sm font-bold text-stone-900 font-mono tracking-tight truncate">
                    pavingjoss@gmail.com
                  </div>
                </div>
              </div>

              <a
                href={`mailto:pavingjoss@gmail.com?subject=${encodeURIComponent(
                  `Permintaan Penawaran Harga - ${selectedProductForContact?.name || "Material Made to Order"}`
                )}&body=${encodeURIComponent(
                  `Halo Tim Sales Paving Joss,\n\nSaya ingin mengajukan permintaan penawaran harga untuk produk:\nNama Produk: ${
                    selectedProductForContact?.name || "-"
                  }\nKode SKU: ${selectedProductForContact?.item_code || "-"}\n\nNama / Perusahaan: \nNo. Telp / WhatsApp: \nEstimasi Kebutuhan Volume: \n\nTerima kasih.`
                )}`}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <span>Kirim Email</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </Modal>

      {/* Cart Window */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        subtotal={subtotal}
        totalWeightKg={totalWeightKg}
        onUpdateQty={updateQty}
        onRemoveItem={removeFromCart}
        onClearCart={clearCart}
        onProceedCheckout={handleProceedToCheckout}
        promoProducts={promoProducts}
        onAddPromoItem={handleAddPromoItem}
      />

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onInstantBuy={handleInstantBuy}
        onOpenContactSales={(p) => {
          setSelectedProduct(null);
          handleOpenRfqModal(p);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={cartItems}
        subtotal={subtotal}
        totalWeightKg={totalWeightKg}
        onOrderPlaced={handleOrderPlaced}
        customer={customer}
      />

      {/* Customer Auth / Progressive Gating Modal */}
      <CustomerAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingAuthAction(null);
        }}
        pendingProduct={pendingAuthAction}
        onSuccess={handleAuthSuccess}
      />

      {/* Order Confirmation Screen */}
      <OrderSuccessModal
        orderData={lastPlacedOrder}
        onClose={() => {
          setIsSuccessOpen(false);
          setLastPlacedOrder(null);
        }}
        onTrackOrder={handleOpenTrackingWithOrder}
      />

      {/* Customer Orders Hub Modal ("Pesanan Saya") */}
      <OrderTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        initialOrderNumber={trackingOrderNumber}
        customer={customer}
        orders={customerOrders}
        isLoadingOrders={isLoadingOrders}
        onRefreshOrders={() => fetchCustomerOrders(customer)}
        onBuyAgain={handleBuyAgain}
        onOrderLinked={handleOrderLinked}
      />
    </div>
  );
}
