import React from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatNumberWithDots } from "@/lib/utils";

export interface GeneralRequestBomRow {
  id: string;
  item_id?: string;
  item_code: string;
  name: string;
  dimension?: string;
  spec?: string;
  qty: string;
  uom?: string;
  unit_price?: string;
  free_stock?: number;
  shortage_qty?: number;
  qty_to_order?: number;
  expected_date?: string;
  notFound?: boolean;
  is_custom?: boolean;
}

interface GeneralRequestMaterialSectionProps {
  bomRows: GeneralRequestBomRow[];
  nonFgInventoryItems: any[];
  onRefreshCatalog: () => void;
  updateRow: (id: string, field: keyof GeneralRequestBomRow, value: string) => void;
  onOpenSearchModal: (rowId: string, initialSearchTerm?: string) => void;
  onRemoveMaterialRow: (rowId: string, index: number) => void;
  onAddMaterialRow: () => void;
}

export const GeneralRequestMaterialSection: React.FC<GeneralRequestMaterialSectionProps> = React.memo(
  ({
    bomRows,
    nonFgInventoryItems,
    onRefreshCatalog,
    updateRow,
    onOpenSearchModal,
    onRemoveMaterialRow,
    onAddMaterialRow,
  }) => {
    return (
      <div className="border border-stone-200 rounded-2xl bg-white shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between bg-stone-100/50 px-6 py-3.5 border-b border-stone-200 gap-3">
          <h3 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
            Material Requirements List ({bomRows.length})
          </h3>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onRefreshCatalog}
            title="Refresh Master SKU Catalog"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <datalist id="general-req-nonfg-datalist">
          {nonFgInventoryItems.map((item) => (
            <option key={item.id || item.item_id} value={item.item_code}>
              {item.name || item.item_name}{" "}
              {item.dimension ? `(${item.dimension})` : ""}{" "}
              {item.spec ? `[${item.spec}]` : ""}
            </option>
          ))}
        </datalist>

        {bomRows.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {bomRows.map((row, index) => {
              const isUnregistered =
                !row.item_id && (row.notFound || Boolean(row.item_code?.trim()));

              return (
                <div
                  key={row.id}
                  className="px-8 py-6 hover:bg-stone-50 transition-colors group relative flex gap-6 items-start"
                >
                  <div className="text-[10px] font-bold text-stone-400 w-10 pt-4 text-center shrink-0 font-mono tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="flex-1 space-y-5 min-w-0">
                    {/* Row 1: Primary Identification */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 block">
                          Item Code (Master SKU)
                        </label>
                        <div className="relative group/input">
                          <input
                            type="text"
                            list="general-req-nonfg-datalist"
                            value={row.item_code}
                            onChange={(e) =>
                              updateRow(row.id, "item_code", e.target.value)
                            }
                            className={cn(
                              "w-full bg-white border border-stone-200 rounded-xl px-4 py-3 pr-10 text-sm uppercase outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-900/5 transition-all font-bold tracking-tight",
                              isUnregistered
                                ? "text-rose-700 border-rose-300 bg-rose-50/50"
                                : "text-stone-950"
                            )}
                            placeholder="Select or Type Registered SKU..."
                          />
                          <button
                            type="button"
                            onClick={() => onOpenSearchModal(row.id, "")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-900 transition-all cursor-pointer"
                            title="Search Master SKU Catalog"
                          >
                            <Search className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="md:col-span-8 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 block">
                          Component Name &amp; Description
                        </label>
                        <input
                          type="text"
                          value={row.name}
                          readOnly
                          tabIndex={-1}
                          onClick={() => {
                            if (!row.item_id) {
                              onOpenSearchModal(row.id, "");
                            }
                          }}
                          className={cn(
                            "w-full bg-stone-100/70 border border-stone-200/80 rounded-xl px-4 py-3 text-sm outline-none font-bold text-stone-700",
                            !row.item_id
                              ? "cursor-pointer hover:border-stone-300"
                              : "cursor-not-allowed"
                          )}
                          placeholder="Auto-populated from registered Master SKU"
                        />
                      </div>
                    </div>

                    {/* Unregistered SKU Governance Warning Bar */}
                    {isUnregistered && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-2.5 rounded-xl bg-rose-50/80 border border-rose-200">
                        <div className="text-[11px] font-bold text-rose-800">
                          SKU is not registered in the Inventory Master. Please select an
                          item from the catalog or register a new SKU via Warehouse &gt;
                          Inventory Master &amp; Balances.
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenSearchModal(row.id, row.item_code || "")}
                          className="h-7 px-3 rounded-lg bg-white hover:bg-stone-50 border border-stone-200 text-[10px] font-bold text-stone-700 uppercase tracking-wider transition-all cursor-pointer shrink-0"
                        >
                          Search Catalog
                        </button>
                      </div>
                    )}

                    {/* Row 2: Specifications & Logistics (Exact BOM Row 2 Structure) */}
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-5 py-3 px-4 bg-stone-50/50 rounded-2xl border border-stone-100/50">
                      <div className="col-span-1 md:col-span-3 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 block">
                          Dimensions
                        </label>
                        <input
                          type="text"
                          value={row.dimension || ""}
                          readOnly
                          tabIndex={-1}
                          className="w-full bg-stone-100/70 border border-stone-200/70 rounded-lg px-3 py-2 text-[13px] outline-none font-medium text-stone-600 cursor-not-allowed"
                          placeholder="Master Dimension"
                        />
                      </div>

                      <div className="col-span-1 md:col-span-3 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 block">
                          Technical Spec
                        </label>
                        <input
                          type="text"
                          value={row.spec || ""}
                          readOnly
                          tabIndex={-1}
                          className="w-full bg-stone-100/70 border border-stone-200/70 rounded-lg px-3 py-2 text-[13px] outline-none font-medium text-stone-600 cursor-not-allowed"
                          placeholder="Master Spec"
                        />
                      </div>

                      <div className="col-span-1 md:col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 block">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={row.qty}
                          onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-950 outline-none focus:border-stone-900 font-bold text-center font-mono tabular-nums"
                        />
                      </div>

                      <div className="col-span-1 md:col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 block">
                          Uom
                        </label>
                        <input
                          type="text"
                          value={row.uom || "PCS"}
                          readOnly
                          tabIndex={-1}
                          className="w-full bg-stone-100/70 border border-stone-200/70 rounded-lg px-3 py-2 text-[13px] text-stone-700 outline-none font-bold text-center uppercase cursor-not-allowed"
                          placeholder="PCS"
                        />
                      </div>

                      <div className="col-span-2 md:col-span-2 space-y-1.5">
                        <label className="text-[8px] font-bold text-stone-400 uppercase tracking-widest px-1 text-center block">
                          Stock
                        </label>
                        <div
                          className={cn(
                            "w-full border rounded-lg px-3 py-2 text-center text-xs font-bold font-mono tabular-nums",
                            (row.free_stock || 0) > 0
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                              : "bg-stone-100 border-stone-200 text-stone-400"
                          )}
                        >
                          {row.free_stock || 0}
                        </div>
                      </div>
                    </div>

                    {/* Row 3: Financials & Delivery */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 px-1">
                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 block">
                          Matrix Unit Price (IDR)
                        </label>
                        <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold font-mono tabular-nums text-stone-900">
                          {formatNumberWithDots(Number(row.unit_price || 0))}
                        </div>
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 block">
                          Net Order Qty
                        </label>
                        <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold font-mono tabular-nums text-stone-900">
                          {row.shortage_qty || 0} {row.uom || "PCS"}
                        </div>
                      </div>

                      <div className="md:col-span-4 space-y-1.5">
                        <label className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.15em] px-1 block">
                          Expected Arrival
                        </label>
                        <input
                          type="date"
                          value={row.expected_date || ""}
                          onChange={(e) =>
                            updateRow(row.id, "expected_date", e.target.value)
                          }
                          className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold font-mono text-stone-900 focus:border-stone-900 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="w-10 shrink-0 pt-6 flex flex-col items-center justify-start">
                    <button
                      type="button"
                      onClick={() => onRemoveMaterialRow(row.id, index)}
                      disabled={
                        bomRows.length === 1 &&
                        !row.item_code?.trim() &&
                        !row.name?.trim()
                      }
                      className={cn(
                        "w-10 h-10 rounded-xl transition-all flex items-center justify-center shadow-3xs",
                        bomRows.length === 1 &&
                          !row.item_code?.trim() &&
                          !row.name?.trim()
                          ? "bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600 border border-stone-200/60 dark:border-stone-700/60 cursor-not-allowed opacity-40"
                          : "bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 cursor-pointer active:scale-95 shadow-2xs group/btn"
                      )}
                      title={
                        bomRows.length === 1 &&
                        (row.item_code?.trim() || row.name?.trim())
                          ? "Clear Component Row"
                          : bomRows.length === 1
                          ? "Minimum 1 component required"
                          : "Remove Component"
                      }
                      aria-label="Remove component"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600 dark:text-rose-400 group-hover/btn:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-14 bg-stone-50/30">
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-tight">
              No Material Requirements Added
            </h4>
            <p className="text-[10px] text-stone-500 mt-1 font-medium tracking-wider uppercase">
              Click Add Component below to select Non-FG items from Inventory Master
            </p>
          </div>
        )}

        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200">
          <Button
            type="button"
            onClick={onAddMaterialRow}
            variant="secondary"
            className="w-full flex items-center justify-center py-3 text-xs uppercase font-bold"
          >
            Add Component
          </Button>
        </div>
      </div>
    );
  }
);
