import React, { useState, useEffect } from "react";
import { Plus, Check, Eye, Package } from "lucide-react";
import { ShopProduct } from "@/types/shop";
import { formatIDR } from "@/lib/utils";

interface ProductCardProps {
  product: ShopProduct;
  onAddToCart: (product: ShopProduct, qty: number) => void;
  onViewDetail: (product: ShopProduct) => void;
  onContactSales?: (product: ShopProduct) => void;
  isAuthenticated?: boolean;
}

export function ProductCard({
  product,
  onAddToCart,
  onViewDetail,
  onContactSales,
}: ProductCardProps) {
  const [isAdded, setIsAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [product.id, product.image_url]);

  const hasDiscount = product.promo_price > 0 && product.promo_price < product.unit_price;
  const displayPrice = hasDiscount ? product.promo_price : product.unit_price;
  const isB2B =
    product.availability_type === "MAKE_TO_ORDER" ||
    (product.availability_type === "AUTO" && displayPrice <= 0);

  const photoCount = React.useMemo(() => {
    const urls = new Set<string>();
    if (product.image_url && product.image_url.trim()) {
      urls.add(product.image_url.trim());
    }
    if (Array.isArray(product.gallery_urls)) {
      product.gallery_urls.forEach((u) => {
        if (typeof u === "string" && u.trim()) urls.add(u.trim());
      });
    } else if (typeof product.shop_gallery_urls === "string") {
      try {
        const parsed = JSON.parse(product.shop_gallery_urls);
        if (Array.isArray(parsed)) {
          parsed.forEach((u) => {
            if (typeof u === "string" && u.trim()) urls.add(u.trim());
          });
        }
      } catch {}
    }
    return urls.size;
  }, [product]);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isB2B) {
      if (onContactSales) {
        onContactSales(product);
      } else {
        onViewDetail(product);
      }
      return;
    }
    onAddToCart(product, product.moq || 1);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1400);
  };

  const hasValidCover = Boolean(product.image_url && product.image_url.trim() !== "") && !imgError;

  return (
    <div
      onClick={() => onViewDetail(product)}
      className="cv-auto group bg-white rounded-2xl border border-stone-200 hover:border-stone-400/80 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden cursor-pointer relative"
    >
      {/* Top Image Container */}
      <div className="relative aspect-4/3 w-full bg-stone-100 overflow-hidden">
        {hasValidCover ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-stone-100 via-stone-200/70 to-stone-100 flex flex-col items-center justify-center p-4 text-center">
            <div className="w-11 h-11 rounded-xl bg-white/90 border border-stone-200 flex items-center justify-center text-stone-400 shadow-2xs mb-2">
              <Package className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-mono font-bold text-stone-500 uppercase tracking-wider">
              {product.item_code}
            </span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.badge && (
            <span className="public-glass-badge-dark px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white">
              <span
                className="public-glass-accent-blur inset-0 bg-amber-400"
                aria-hidden="true"
              />
              <span className="relative z-10">{product.badge}</span>
            </span>
          )}
          {hasDiscount && (
            <span className="public-glass-badge-dark px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-white">
              <span
                className="public-glass-accent-blur inset-0 bg-[#b02524]"
                aria-hidden="true"
              />
              <span className="relative z-10">
                Save {Math.round(((product.unit_price - product.promo_price) / product.unit_price) * 100)}%
              </span>
            </span>
          )}
        </div>

        {/* Photo Count Indicator */}
        {photoCount > 1 && (
          <div className="absolute top-3 right-3 z-10">
            <span className="public-glass-badge-dark px-2 py-0.5 rounded-md text-[10px] font-bold text-white flex items-center gap-1">
              <span className="relative z-10">{photoCount} Photos</span>
            </span>
          </div>
        )}

        {/* Category Tag on Image */}
        <div className="absolute bottom-3 left-3 z-10">
          <span className="public-glass-badge px-2.5 py-1 rounded-lg text-[10px] font-bold text-stone-800">
            <span
              className="public-glass-accent-blur left-0 top-1/2 -translate-y-1/2 w-10 h-6 bg-[#b02524]"
              aria-hidden="true"
            />
            <span className="relative z-10">{product.category}</span>
          </span>
        </div>

        {/* Hover Quick View Button */}
        <div className="absolute inset-0 bg-stone-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="px-3.5 py-2 rounded-xl bg-white text-stone-900 text-xs font-bold shadow-md flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform">
            <Eye className="w-4 h-4 text-stone-700" />
            <span>View Specifications</span>
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-1">
            {product.item_code}
          </div>
          <h3 className="text-sm sm:text-base font-bold text-stone-900 group-hover:text-[#b02524] transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>

          {product.dimension && (
            <p className="text-xs text-stone-500 mt-1.5 line-clamp-1">
              Size: <span className="font-medium text-stone-700">{product.dimension}</span>
            </p>
          )}
        </div>

        {/* Price & Action Section */}
        <div className="pt-3 border-t border-stone-100 mt-auto">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <div>
              {isB2B ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-amber-900 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Custom Order
                  </span>
                  <span className="text-[10px] font-semibold text-stone-500">
                    ({product.uom})
                  </span>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base sm:text-lg font-black text-stone-900 font-mono">
                    {formatIDR(displayPrice)}
                  </span>
                  <span className="text-[11px] font-semibold text-stone-500">
                    /{product.uom}
                  </span>
                </div>
              )}
              {hasDiscount && !isB2B && (
                <div className="text-[11px] text-stone-400 line-through font-mono">
                  {formatIDR(product.unit_price)}
                </div>
              )}
            </div>

            {/* Stock / Mode indicator */}
            <div className="text-right">
              {isB2B ? (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  Made to Order
                </span>
              ) : product.available_qty > 0 ? (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                  In Stock
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                  In Production
                </span>
              )}
            </div>
          </div>

          <button
            onClick={handleQuickAdd}
            className={`w-full py-3 sm:py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation ${
              isAdded
                ? "bg-emerald-600 text-white shadow-xs"
                : isB2B
                ? "bg-amber-800 hover:bg-amber-900 text-white shadow-xs active:scale-95"
                : "bg-[#b02524] hover:bg-[#8e1d1c] text-white shadow-xs active:scale-95"
            }`}
          >
            {isAdded ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Added to Cart</span>
              </>
            ) : isB2B ? (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Request Quote</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Add to Cart</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
