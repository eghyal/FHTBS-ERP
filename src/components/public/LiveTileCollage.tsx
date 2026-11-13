import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Box, CheckCircle2, Layers, ArrowUpRight } from "lucide-react";

export interface CatalogProductItem {
  id: string;
  item_code?: string;
  name: string;
  dimension?: string;
  category?: string;
  spec?: string;
  badge?: string;
  image_url: string;
  gallery_urls?: string[];
  shop_gallery_urls?: string[] | string;
  uom?: string;
  available_qty?: number;
  unit_price?: number;
  source_type?: "SHOP_PRODUCT" | "ERP_PROJECT";
}

interface TileSlotConfig {
  id: string;
  label: string;
  sizeType: "large" | "wide" | "tall" | "medium";
  className: string;
  intervalMs: number;
  animType: "flip" | "slide-up" | "slide-down" | "crossfade";
}

const TILE_SLOTS: TileSlotConfig[] = [
  {
    id: "slot-0",
    label: "Hero Live Tile (2x2)",
    sizeType: "large",
    className:
      "col-span-2 row-span-2 md:col-span-2 md:row-span-2 min-h-[340px] md:min-h-[420px]",
    intervalMs: 5400,
    animType: "flip",
  },
  {
    id: "slot-1",
    label: "Medium Tile A (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 4200,
    animType: "slide-up",
  },
  {
    id: "slot-2",
    label: "Medium Tile B (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 6500,
    animType: "crossfade",
  },
  {
    id: "slot-3",
    label: "Wide Tile A (2x1)",
    sizeType: "wide",
    className:
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 4800,
    animType: "slide-down",
  },
  {
    id: "slot-4",
    label: "Tall Live Tile (1x2)",
    sizeType: "tall",
    className:
      "col-span-1 row-span-2 md:col-span-1 md:row-span-2 min-h-[340px] md:min-h-[420px]",
    intervalMs: 7200,
    animType: "flip",
  },
  {
    id: "slot-5",
    label: "Wide Tile B (2x1 on desktop, 1x1 on mobile)",
    sizeType: "wide",
    className:
      "col-span-1 row-span-1 md:col-span-2 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 5100,
    animType: "slide-up",
  },
  {
    id: "slot-6",
    label: "Medium Tile C (1x1 on desktop, 2x1 on mobile)",
    sizeType: "medium",
    className:
      "col-span-2 row-span-1 md:col-span-1 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 6100,
    animType: "crossfade",
  },
  {
    id: "slot-7",
    label: "Medium Tile D (1x1)",
    sizeType: "medium",
    className:
      "col-span-1 row-span-1 md:col-span-1 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 4600,
    animType: "slide-down",
  },
  {
    id: "slot-8",
    label: "Wide Tile C (2x1)",
    sizeType: "wide",
    className:
      "col-span-2 row-span-1 md:col-span-2 md:row-span-1 min-h-[170px] md:min-h-[210px]",
    intervalMs: 7600,
    animType: "flip",
  },
];

interface LiveTileCellProps {
  slot: TileSlotConfig;
  pool: CatalogProductItem[];
  slotIndex: number;
}

const LiveTileCell: React.FC<LiveTileCellProps> = ({ slot, pool }) => {
  const [index, setIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (pool.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % pool.length);
    }, slot.intervalMs);

    return () => clearInterval(timer);
  }, [pool.length, slot.intervalMs]);

  const currentItem = pool[index % pool.length];
  if (!currentItem) return null;

  const hasValidImage =
    Boolean(currentItem.image_url && currentItem.image_url.trim() !== "") &&
    !failedImages[currentItem.id];

  const getVariants = () => {
    switch (slot.animType) {
      case "flip":
        return {
          initial: { rotateX: 90, opacity: 0 },
          animate: { rotateX: 0, opacity: 1 },
          exit: { rotateX: -90, opacity: 0 },
          transition: { duration: 0.65, ease: "easeOut" as const },
        };
      case "slide-up":
        return {
          initial: { y: "100%", opacity: 0.8 },
          animate: { y: "0%", opacity: 1 },
          exit: { y: "-100%", opacity: 0.8 },
          transition: { duration: 0.7, ease: "easeInOut" as const },
        };
      case "slide-down":
        return {
          initial: { y: "-100%", opacity: 0.8 },
          animate: { y: "0%", opacity: 1 },
          exit: { y: "100%", opacity: 0.8 },
          transition: { duration: 0.7, ease: "easeInOut" as const },
        };
      case "crossfade":
      default:
        return {
          initial: { scale: 1.08, opacity: 0 },
          animate: { scale: 1, opacity: 1 },
          exit: { scale: 0.95, opacity: 0 },
          transition: { duration: 0.75, ease: "easeInOut" as const },
        };
    }
  };

  const variants = getVariants();

  return (
    <Link
      to={`/shop?q=${encodeURIComponent(currentItem.name)}`}
      id={`live-tile-${slot.id}`}
      className={`relative overflow-hidden bg-stone-900 border border-white/15 ${slot.className} select-none group block`}
      style={{ perspective: 1000 }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${currentItem.id}-${index}`}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={variants.transition}
          className="absolute inset-0 w-full h-full"
          style={{ transformStyle: "preserve-3d", willChange: "transform, opacity" }}
        >
          {hasValidImage ? (
            <>
              <img
                src={currentItem.image_url}
                alt={currentItem.name}
                loading="lazy"
                onError={() => {
                  setFailedImages((prev) => ({ ...prev, [currentItem.id]: true }));
                }}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/30 to-transparent group-hover:from-stone-950/95 transition-all duration-300" />
            </>
          ) : (
            /* Architectural & Technical Specification Surface when product/project has no uploaded photo */
            <div className="w-full h-full bg-gradient-to-br from-stone-900 via-stone-900 to-stone-950 relative overflow-hidden p-4 md:p-5 flex flex-col justify-between">
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 2px 2px, rgba(255,255,255,0.35) 1px, transparent 0)",
                  backgroundSize: "20px 20px",
                }}
              />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/10 text-stone-200 border border-white/10 text-[10px] font-mono font-bold uppercase tracking-wider truncate">
                  {currentItem.source_type === "ERP_PROJECT" ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Box className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {currentItem.category || "Katalog Pabrik"}
                  </span>
                </span>
                <ArrowUpRight className="w-4 h-4 text-stone-400 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
              </div>

              <div className="relative z-10 my-auto py-2">
                {currentItem.item_code && (
                  <div className="text-[10px] font-mono font-bold text-amber-400/90 uppercase tracking-widest mb-1">
                    {currentItem.item_code}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top Status Badge for Photo Tiles */}
          {hasValidImage && (
            <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
              <span className="public-glass-badge-dark inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-white text-[10px] font-bold uppercase tracking-wider truncate">
                <span
                  className="public-glass-accent-blur left-0 top-1/2 -translate-y-1/2 w-8 h-6 bg-amber-400"
                  aria-hidden="true"
                />
                <Layers className="w-3 h-3 text-amber-300/80 shrink-0 relative z-10" />
                <span className="truncate relative z-10">{currentItem.category || "Produk Pabrik"}</span>
              </span>
              {currentItem.badge && (
                <span className="public-glass-badge-dark px-2.5 py-1 rounded-lg text-white text-[9px] font-extrabold uppercase tracking-wider shrink-0">
                  <span
                    className="public-glass-accent-blur inset-0 bg-[#b02524]"
                    aria-hidden="true"
                  />
                  <span className="relative z-10">{currentItem.badge}</span>
                </span>
              )}
            </div>
          )}

          {/* Bottom Title & Specs */}
          <div className="absolute bottom-0 left-0 right-0 p-3.5 md:p-5 z-10 flex flex-col justify-end text-left pointer-events-none">
            <h3
              className={`font-extrabold text-white leading-snug tracking-tight drop-shadow-md ${
                slot.sizeType === "large"
                  ? "text-base sm:text-xl md:text-2xl line-clamp-2"
                  : slot.sizeType === "wide"
                  ? "text-sm sm:text-base md:text-lg line-clamp-2"
                  : slot.sizeType === "tall"
                  ? "text-sm sm:text-base md:text-lg line-clamp-3"
                  : "text-xs sm:text-sm line-clamp-2"
              }`}
            >
              {currentItem.name}
            </h3>
            {(currentItem.dimension || currentItem.spec) && (
              <span className="text-[11px] text-stone-300 font-mono mt-1 opacity-95 drop-shadow-sm line-clamp-1">
                {currentItem.dimension || currentItem.spec}
              </span>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </Link>
  );
};

interface LiveTileCollageProps {
  products: CatalogProductItem[];
  activeCategory: string;
}

export const LiveTileCollage: React.FC<LiveTileCollageProps> = ({
  products,
  activeCategory,
}) => {
  // Flatten all photos per item; if an item has no photo yet, still include it once so real products/projects are always represented
  const flattenedPool = useMemo(() => {
    if (!products || products.length === 0) return [];
    const list: CatalogProductItem[] = [];

    products.forEach((p) => {
      let g: string[] = [];
      if (Array.isArray(p.gallery_urls) && p.gallery_urls.length > 0) {
        g = p.gallery_urls;
      } else if (typeof p.shop_gallery_urls === "string") {
        try {
          g = JSON.parse(p.shop_gallery_urls);
        } catch {
          g = [];
        }
      } else if (Array.isArray(p.shop_gallery_urls) && p.shop_gallery_urls.length > 0) {
        g = p.shop_gallery_urls;
      }

      const validGallery = Array.isArray(g)
        ? g.filter((url) => typeof url === "string" && url.trim() !== "")
        : [];

      if (validGallery.length > 0) {
        validGallery.forEach((url, photoIdx) => {
          list.push({
            ...p,
            id: `${p.id}-p${photoIdx}`,
            image_url: url.trim(),
          });
        });
      } else {
        list.push({
          ...p,
          image_url: typeof p.image_url === "string" ? p.image_url.trim() : "",
        });
      }
    });

    return list;
  }, [products]);

  const filteredProducts =
    activeCategory === "ALL"
      ? flattenedPool
      : flattenedPool.filter((p) => p.category === activeCategory);

  const totalPool = filteredProducts;

  if (totalPool.length === 0) {
    return null;
  }

  // If there are fewer than 9 items in totalPool, render a clean responsive grid for the exact items without duplicating tiles unnecessarily;
  // otherwise use the 9-slot Live Tile matrix.
  if (totalPool.length < 4) {
    return (
      <div className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {totalPool.map((item, idx) => (
            <LiveTileCell
              key={item.id || idx}
              slot={{
                id: `direct-${idx}`,
                label: item.name,
                sizeType: "wide",
                className: "rounded-3xl min-h-[240px] shadow-md",
                intervalMs: 6000,
                animType: "crossfade",
              }}
              pool={[item]}
              slotIndex={idx}
            />
          ))}
        </div>
      </div>
    );
  }

  const getSlotPool = (slotIndex: number): CatalogProductItem[] => {
    if (totalPool.length <= TILE_SLOTS.length) {
      return [
        totalPool[slotIndex % totalPool.length],
        totalPool[(slotIndex + 3) % totalPool.length],
        totalPool[(slotIndex + 7) % totalPool.length],
      ].filter(Boolean);
    }

    const items: CatalogProductItem[] = [];
    for (let i = 0; i < totalPool.length; i++) {
      if (i % TILE_SLOTS.length === slotIndex) {
        items.push(totalPool[i]);
      }
    }
    if (items.length <= 1) {
      const extra = totalPool[(slotIndex + TILE_SLOTS.length) % totalPool.length];
      if (extra && !items.some((it) => it.id === extra.id)) {
        items.push(extra);
      }
    }
    return items.length > 0 ? items : [totalPool[0]];
  };

  return (
    <div className="w-full">
      <div className="w-full rounded-[2rem] overflow-hidden border-2 border-white shadow-2xl bg-stone-950">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 p-0 m-0">
          {TILE_SLOTS.map((slot, idx) => (
            <LiveTileCell
              key={slot.id}
              slot={slot}
              pool={getSlotPool(idx)}
              slotIndex={idx}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

