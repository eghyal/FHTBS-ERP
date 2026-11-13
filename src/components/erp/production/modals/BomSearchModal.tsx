import React from "react";
import { Modal } from "@/components/ui/Modal";
import { Search, Package } from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";

interface BomRegistrySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearching: boolean;
  searchResults: any[];
  selectItemFromSearch: (item: any) => void;
  onOpenInventoryMaster?: (searchTerm?: string) => void;
  title?: string;
}

export const BomRegistrySearchModal: React.FC<BomRegistrySearchModalProps> = ({
  isOpen,
  onClose,
  searchTerm,
  setSearchTerm,
  isSearching,
  searchResults,
  selectItemFromSearch,
  title = "Registry Database Search",
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="2xl"
      contentClassName="p-0 flex flex-col h-[75vh]"
    >
      <div className="p-6 border-b border-stone-100 shrink-0 space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            autoFocus
            placeholder="Search items by name, SKU code, dimension, or specification..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-4 text-sm font-bold text-stone-900 outline-none focus:border-stone-900 focus:ring-4 focus:ring-stone-100 transition-all font-sans"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-xs">
          <span className="text-[11px] font-medium text-stone-600">
            Need a new material or component SKU? Register it via the{" "}
            <strong className="text-stone-900">Warehouse &gt; Inventory Master &amp; Balances</strong>{" "}
            menu.
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/50">
        {isSearching ? (
          <div className="text-center py-16 animate-pulse">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-stone-200 border-t-stone-900 animate-spin"></div>
              Scanning Registry...
            </div>
          </div>
        ) : searchResults.length > 0 ? (
          searchResults.map((item) => {
            const ssotPrice = Number(item.ssot_unit_price ?? item.unit_price ?? 0);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectItemFromSearch(item)}
                className="w-full text-left p-5 rounded-2xl border border-stone-200 hover:border-stone-900 bg-white hover:bg-stone-50 transition-all group flex justify-between items-center shadow-2xs hover:shadow-md cursor-pointer"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-1 bg-stone-100 rounded-lg text-[10px] font-bold text-stone-700 font-mono tracking-wider uppercase border border-stone-200/70">
                      {item.item_code}
                    </span>
                    <h5 className="text-sm font-black text-stone-900 truncate tracking-tight">
                      {item.name}
                    </h5>
                  </div>
                  <div className="text-[10px] text-stone-500 font-bold uppercase tracking-wider flex items-center gap-3 flex-wrap">
                    {item.dimension && <span>DIM: {item.dimension}</span>}
                    {item.spec && <span>SPEC: {item.spec}</span>}
                    {ssotPrice > 0 && (
                      <span className="font-mono text-stone-700">
                        SSOT: {formatIDR(ssotPrice)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4 border-l border-stone-100 pl-6 transition-all group-hover:border-stone-200">
                  <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                    FREE STOCK
                  </div>
                  <div
                    className={cn(
                      "text-lg font-black font-mono tabular-nums tracking-tighter",
                      (item.free_stock || 0) > 0
                        ? "text-emerald-600"
                        : "text-stone-400",
                    )}
                  >
                    {item.free_stock || 0}{" "}
                    <span className="text-[10px] text-stone-500 font-sans tracking-widest ml-1 uppercase">
                      {item.uom || "PCS"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        ) : searchTerm.trim().length > 0 ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-12 h-12 text-stone-300 mx-auto" />
            <div className="space-y-1.5 max-w-md mx-auto">
              <div className="text-xs font-bold text-stone-700 uppercase tracking-widest">
                No matching Master SKU found for &quot;{searchTerm}&quot;
              </div>
              <p className="text-xs text-stone-500 leading-relaxed">
                SKU not registered in Inventory Master. Register new items via{" "}
                <strong className="text-stone-800">Warehouse &gt; Inventory Balances</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center">
            <Search className="w-12 h-12 text-stone-200 mb-4" />
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
              Type item name, SKU code, dimension, or specification to search
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
