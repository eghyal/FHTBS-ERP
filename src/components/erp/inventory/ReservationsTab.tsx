import React, { memo } from "react";
import { Lock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { cn } from "@/lib/utils";

interface WarehouseReservationsTabProps {
  reservations: any[];
  onAllocateReservation?: (reservationId: string) => void;
}

export const WarehouseReservationsTab: React.FC<WarehouseReservationsTabProps> = memo(
  function WarehouseReservationsTab({ reservations, onAllocateReservation }) {
    return (
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Project &amp; Work Order</TableHead>
            <TableHead>Material Specification</TableHead>
            <TableHead className="text-right">Reserved vs. Required</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reservations.length === 0 ? (
            <TableEmpty
              colSpan={5}
              message="No active project material reservations found."
            />
          ) : (
            reservations.map((res: any) => {
              const reqQty = Number(res.required_qty ?? res.qty ?? 0);
              const lockedQty = Number(res.reserved_qty ?? res.qty ?? 0);
              const shortageQty = Math.max(
                0,
                Number(res.shortage_qty ?? reqQty - lockedQty)
              );
              const isShortage =
                res.status === "SHORTAGE" ||
                res.status === "PARTIAL" ||
                shortageQty > 0;

              return (
                <TableRow key={res.id}>
                  <TableCell>
                    <div className="text-xs font-semibold text-stone-900">
                      {res.project_name || res.project_id}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono tabular-nums mt-0.5">
                      {res.spk_id || res.project_id}
                      {res.created_at
                        ? ` · ${new Date(res.created_at).toLocaleDateString(
                            "en-US",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-mono font-bold text-stone-900 tabular-nums">
                      {res.item_code || "BOM-MAT"}
                    </div>
                    <div className="text-xs text-stone-600 mt-0.5">
                      {res.item_name}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <div className="text-xs font-bold text-stone-900">
                      {lockedQty.toLocaleString("en-US")} /{" "}
                      {reqQty.toLocaleString("en-US")}{" "}
                      <span className="text-[10px] text-stone-500 uppercase">
                        {res.uom || "PCS"}
                      </span>
                    </div>
                    {shortageQty > 0 ? (
                      <div className="text-[11px] text-rose-700 font-semibold mt-0.5">
                        Shortage: {shortageQty.toLocaleString("en-US")}{" "}
                        {res.uom || "PCS"}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                        100% Reserved
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border",
                        isShortage
                          ? "bg-amber-50/70 text-amber-800 border-amber-200/60"
                          : "bg-emerald-50/70 text-emerald-800 border-emerald-200/60"
                      )}
                    >
                      {isShortage ? (
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      )}
                      {res.status || (isShortage ? "SHORTAGE" : "RESERVED")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {isShortage && onAllocateReservation ? (
                      <Button
                        size="xs"
                        variant="primary"
                        lockKey={`allocate-res-${res.id}`}
                        onClick={() => onAllocateReservation(res.id)}
                        leftIcon={<Lock className="w-3 h-3" />}
                      >
                        Allocate Stock
                      </Button>
                    ) : (
                      <span className="text-[11px] font-mono text-stone-500">
                        Allocated
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    );
  }
);
