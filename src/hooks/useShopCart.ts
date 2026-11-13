import { useState, useEffect, useCallback } from "react";
import { ShopProduct, CartItem } from "@/types/shop";

export function useShopCart(customerId?: string) {
  const getCartKey = (id?: string) => {
    return id ? `pavingjoss_shop_cart_customer_${id}` : "pavingjoss_shop_cart_guest";
  };

  // Helper to load cart items from localStorage based on key
  const loadCartItems = useCallback((id?: string): CartItem[] => {
    try {
      const key = getCartKey(id);
      const stored = localStorage.getItem(key);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const [items, setItems] = useState<CartItem[]>(() => loadCartItems(customerId));

  // Sync cart when customerId changes & automatically merge guest cart into customer cart on login
  useEffect(() => {
    if (customerId) {
      try {
        const guestRaw = localStorage.getItem("pavingjoss_shop_cart_guest");
        const guestItems: CartItem[] = guestRaw ? JSON.parse(guestRaw) : [];
        const customerKey = getCartKey(customerId);
        const customerItems = loadCartItems(customerId);

        if (Array.isArray(guestItems) && guestItems.length > 0) {
          const mergedMap = new Map<string, CartItem>();
          for (const ci of customerItems) {
            if (ci?.product?.id) {
              mergedMap.set(ci.product.id, { ...ci });
            }
          }
          for (const gi of guestItems) {
            if (gi?.product?.id) {
              const existing = mergedMap.get(gi.product.id);
              if (existing) {
                mergedMap.set(gi.product.id, {
                  product: gi.product,
                  qty: Math.max(existing.qty, gi.qty),
                });
              } else {
                mergedMap.set(gi.product.id, { ...gi });
              }
            }
          }
          const mergedList = Array.from(mergedMap.values());
          localStorage.setItem(customerKey, JSON.stringify(mergedList));
          localStorage.removeItem("pavingjoss_shop_cart_guest");
          setItems(mergedList);
          return;
        }
      } catch (e) {
        console.warn("Guest cart migration note:", e);
      }
    }
    setItems(loadCartItems(customerId));
  }, [customerId, loadCartItems]);

  const saveCart = useCallback(
    (newItems: CartItem[], targetCustomerId?: string) => {
      const effectiveId = targetCustomerId !== undefined ? targetCustomerId : customerId;
      setItems(newItems);
      try {
        const key = getCartKey(effectiveId);
        localStorage.setItem(key, JSON.stringify(newItems));
        // Notify other tabs/windows or listeners
        window.dispatchEvent(new Event("shop_cart_updated"));
      } catch (e) {
        console.warn("Failed to persist cart to localStorage", e);
      }
    },
    [customerId]
  );

  // Hydrate server cart_snapshot items into the customer's cart using available catalog products
  const hydrateFromSnapshot = useCallback(
    (
      snapshot: any[],
      catalogProducts: ShopProduct[],
      targetCustomerId?: string
    ) => {
      if (!Array.isArray(snapshot) || snapshot.length === 0) return;
      const effectiveId = targetCustomerId || customerId;
      const current = loadCartItems(effectiveId);
      const mergedMap = new Map<string, CartItem>();

      for (const item of current) {
        if (item?.product?.id) {
          mergedMap.set(item.product.id, { ...item });
        }
      }

      for (const snap of snapshot) {
        const itemId = String(snap.item_id || snap.product?.id || "");
        if (!itemId) continue;
        if (mergedMap.has(itemId)) continue;

        const matchedProduct =
          snap.product ||
          catalogProducts.find((p) => p.id === itemId || p.item_code === snap.item_code);
        if (matchedProduct) {
          mergedMap.set(itemId, {
            product: matchedProduct,
            qty: Math.max(1, Number(snap.qty) || 1),
          });
        }
      }

      const merged = Array.from(mergedMap.values());
      saveCart(merged, effectiveId);
    },
    [customerId, loadCartItems, saveCart]
  );

  // Sync cart state across browser tabs, windows, or storage events
  useEffect(() => {
    const handleStorageChange = () => {
      setItems(loadCartItems(customerId));
    };

    window.addEventListener("shop_cart_updated", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("shop_cart_updated", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [customerId, loadCartItems]);

  const addToCart = useCallback(
    (product: ShopProduct, quantity: number = 1) => {
      // Guard: Made to order items do not enter retail shopping cart
      const isMto =
        product.availability_type === "MAKE_TO_ORDER" ||
        (product.availability_type === "AUTO" &&
          (product.promo_price > 0 ? product.promo_price : product.unit_price) <= 0);
      if (isMto) {
        return;
      }

      const currentList = loadCartItems(customerId);
      const existingIndex = currentList.findIndex((i) => i.product.id === product.id);
      let updated: CartItem[];
      if (existingIndex > -1) {
        updated = [...currentList];
        updated[existingIndex].qty += quantity;
      } else {
        updated = [...currentList, { product, qty: quantity }];
      }
      saveCart(updated);
    },
    [customerId, loadCartItems, saveCart]
  );

  const updateQty = useCallback(
    (productId: string, quantity: number) => {
      const currentList = loadCartItems(customerId);
      if (quantity <= 0) {
        const filtered = currentList.filter((i) => i.product.id !== productId);
        saveCart(filtered);
      } else {
        const updated = currentList.map((i) =>
          i.product.id === productId ? { ...i, qty: quantity } : i
        );
        saveCart(updated);
      }
    },
    [customerId, loadCartItems, saveCart]
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      const currentList = loadCartItems(customerId);
      const filtered = currentList.filter((i) => i.product.id !== productId);
      saveCart(filtered);
    },
    [customerId, loadCartItems, saveCart]
  );

  const clearCart = useCallback(() => {
    saveCart([]);
  }, [saveCart]);

  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  const subtotal = items.reduce((sum, item) => {
    const price =
      item.product.promo_price > 0 ? item.product.promo_price : item.product.unit_price;
    return sum + price * item.qty;
  }, 0);

  const totalWeightKg = items.reduce((sum, item) => {
    const weight = item.product.weight_kg || 2.5;
    return sum + weight * item.qty;
  }, 0);

  return {
    items,
    totalItems,
    subtotal,
    totalWeightKg,
    addToCart,
    updateQty,
    removeFromCart,
    clearCart,
    hydrateFromSnapshot,
  };
}

