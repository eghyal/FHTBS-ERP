import React, { memo } from "react";
import {
  Cpu,
  ShieldCheck,
  Workflow,
  QrCode,
  Sliders,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { Loader } from "@/components/shared/Loader";
import { cn } from "@/lib/utils";
import { Action, hasPermission } from "@/utils/pbac";

export interface WarehouseInventoryItem {
  id: string;
  item_code: string;
  name: string;
  dimension: string;
  spec: string;
  uom: string;
  type: string;
  unit_price: number;
  free_stock: number;
  allocated_stock: number;
  reserved_stock?: number;
  reserved_qty?: number;
  physical_qty?: number;
  available_qty?: number;
  min_stock?: number;
  max_stock?: number;
  location?: string;
  item_type?: string;
  category?: string;
  machine_category?: string;
  capacity_per_hour?: number;
  machine_status?: string;
  operational_status?: string;
  assigned_operator?: string;
  serial_number?: string;
  manufacturer?: string;
  machine_specifications?: any;
  bypass_multi_station?: number | boolean;
}

interface WarehouseStockTableProps {
  isLoading: boolean;
  items: WarehouseInventoryItem[];
  user: any;
  onOpenBopModal: (item: WarehouseInventoryItem) => void;
  onOpenLabelModal: (item: WarehouseInventoryItem) => void;
  onOpenAdjustModal: (item: WarehouseInventoryItem) => void;
  onOpenEditModal: (item: WarehouseInventoryItem) => void;
  onDeleteItem: (id: string, itemCode: string) => void;
}

export const WarehouseStockTable = memo(function WarehouseStockTable({
  isLoading,
  items,
  user,
  onOpenBopModal,
  onOpenLabelModal,
  onOpenAdjustModal,
  onOpenEditModal,
  onDeleteItem,
}: WarehouseStockTableProps) {
  const canWarehouseAction = hasPermission(user, Action.WAREHOUSE_ACTION);
  const canConfigureMachine = hasPermission(user, Action.CONFIGURE_MACHINE);

  return (
    <div className="px-2.5 sm:px-5 pb-5 pt-2.5 space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item & SKU Details</TableHead>
            <TableHead>Asset Class</TableHead>
            <TableHead className="text-right">Stock Balances</TableHead>
            <TableHead className="text-center">Action Protocol</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4}>
                <Loader
                  text="Syncing inventory ledger..."
                  className="py-24"
                />
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableEmpty
              colSpan={4}
              message='No items or SKUs found. Click "Register Item / SKU" to add.'
            />
          ) : (
            items.map((item) => {
              const isMachine =
                item.type === "MACHINE" ||
                item.item_type === "MACHINE" ||
                Boolean(item.machine_category) ||
                Boolean(
                  item.item_code &&
                    (item.item_code.startsWith("MC - ") ||
                      item.item_code.startsWith("MC-"))
                ) ||
                Boolean(
                  item.category &&
                    item.category.toLowerCase().includes("machin")
                );
              const isFinishGood =
                item.type === "FINISH_GOOD" ||
                item.type === "FINISHED" ||
                Boolean(
                  item.item_code &&
                    (item.item_code.startsWith("FG - ") ||
                      item.item_code.startsWith("FG-"))
                );
              const freeStock = item.free_stock ?? 0;
              const allocatedStock =
                item.allocated_stock ?? item.reserved_qty ?? 0;
              const physicalStock =
                item.physical_qty ?? freeStock + allocatedStock;

              return (
                <TableRow key={item.id}>
                  {/* Item & SKU Details */}
                  <TableCell>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-[10px] font-bold font-mono tabular-nums text-stone-800 tracking-wider border border-stone-200">
                        {item.item_code}
                      </span>
                      {isMachine && item.bypass_multi_station ? (
                        <Badge variant="success" size="sm">
                          Bypass Multi-Station
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-sm font-bold text-stone-950 uppercase tracking-tight">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-stone-500 mt-1 font-medium flex flex-wrap items-center gap-1.5">
                      {isMachine ? (
                        <>
                          <span className="text-stone-700 font-semibold">
                            {item.machine_category || "GENERAL MACHINE"}
                          </span>
                          {item.manufacturer && (
                            <>
                              <span>·</span>
                              <span>Mfr: {item.manufacturer}</span>
                            </>
                          )}
                          {item.serial_number && (
                            <>
                              <span>·</span>
                              <span className="font-mono tabular-nums">
                                SN: {item.serial_number}
                              </span>
                            </>
                          )}
                          {item.spec && (
                            <>
                              <span>·</span>
                              <span>{item.spec}</span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {item.dimension && (
                            <>
                              <span>{item.dimension}</span>
                              <span>·</span>
                            </>
                          )}
                          <span>{item.spec || "Standard Spec"}</span>
                        </>
                      )}
                    </div>
                  </TableCell>

                  {/* Asset Class & Status */}
                  <TableCell>
                    {isMachine ? (
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/90 uppercase tracking-wider inline-flex items-center gap-1 font-mono">
                          <Cpu className="w-3 h-3" /> Machinery [MC]
                        </span>
                        <Badge
                          variant={
                            item.machine_status === "MAINTENANCE"
                              ? "warning"
                              : item.machine_status === "BROKEN"
                                ? "danger"
                                : item.assigned_operator
                                  ? "success"
                                  : "default"
                          }
                          size="sm"
                        >
                          {item.assigned_operator
                            ? `ACTIVE · Op: ${item.assigned_operator}`
                            : "INACTIVE · Unassigned"}
                        </Badge>
                      </div>
                    ) : isFinishGood ? (
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/90 uppercase tracking-wider inline-flex items-center gap-1 font-mono">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />{" "}
                          Finished Goods [FG]
                        </span>
                        <Badge
                          variant={
                            freeStock <= 0
                              ? "default"
                              : freeStock < 5
                                ? "warning"
                                : "success"
                          }
                          size="sm"
                        >
                          {freeStock <= 0
                            ? "Out of Stock"
                            : freeStock < 5
                              ? "Low Stock"
                              : "Ready for Sale"}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 items-start">
                        <Badge variant="outline" size="sm">
                          {item.type || "RAW"}
                        </Badge>
                        <Badge
                          variant={
                            freeStock <= 0
                              ? "default"
                              : freeStock < 5
                                ? "warning"
                                : "success"
                          }
                          size="sm"
                        >
                          {freeStock <= 0
                            ? "Out of Stock"
                            : freeStock < 5
                              ? "Low Stock"
                              : "In Stock"}
                        </Badge>
                      </div>
                    )}
                  </TableCell>

                  {/* Stock Balances */}
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <div
                        className={cn(
                          "text-lg font-bold font-mono tabular-nums leading-none",
                          freeStock <= 0
                            ? "text-stone-400"
                            : freeStock < 5
                              ? "text-amber-600"
                              : "text-stone-950"
                        )}
                      >
                        {freeStock.toLocaleString("id-ID")}
                      </div>
                      <span className="text-[9px] text-stone-400 font-bold uppercase tracking-widest mt-1 leading-none">
                        FREE {item.uom || (isMachine ? "UNIT" : "PCS")}
                      </span>
                      <div className="text-[10px] text-stone-400 mt-1 font-mono tabular-nums">
                        Phys: {physicalStock.toLocaleString("id-ID")} · Res:{" "}
                        {allocatedStock.toLocaleString("id-ID")}
                      </div>
                    </div>
                  </TableCell>

                  {/* Action Protocol */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {isMachine ? (
                        <>
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => onOpenLabelModal(item)}
                            title="Print Machine QR Tag"
                          >
                            <QrCode className="w-4 h-4" />
                          </Button>
                          <span className="text-[9.5px] font-bold text-stone-400 bg-stone-100 px-2 py-1 rounded-md tracking-wider">
                            READ-ONLY
                          </span>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => onOpenLabelModal(item)}
                            title="Print Barcode / QR Label"
                          >
                            <QrCode className="w-4 h-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="secondary"
                            disabled={!canWarehouseAction}
                            onClick={() => onOpenAdjustModal(item)}
                            title="Adjust Physical Stock Count (Warehouse Authority Only)"
                          >
                            <Sliders className="w-4 h-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="secondary"
                            disabled={
                              !canWarehouseAction &&
                              user?.role !== "ENGINEERING" &&
                              !hasPermission(user, Action.MANAGE_BOM) &&
                              !(user?.role === "SALES" && isFinishGood)
                            }
                            onClick={() => onOpenEditModal(item)}
                            title={
                              user?.role === "SALES" && isFinishGood
                                ? "Edit Finished Good Specifications"
                                : "Edit Item Master Specifications"
                            }
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>

                          <Button
                            size="icon"
                            variant="danger_soft"
                            disabled={!canWarehouseAction}
                            onClick={() => onDeleteItem(item.id, item.item_code)}
                            title="Delete Item / SKU (Warehouse Authority Only)"
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </>
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
  );
});
