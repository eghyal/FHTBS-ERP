import React from "react";
import { QrCode, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface WarehouseHistoryTabProps {
  movements: any[];
  movementPage: number;
  totalMovements: number;
  setMovementPage: React.Dispatch<React.SetStateAction<number>>;
  setSelectedLabelItem: React.Dispatch<React.SetStateAction<any>>;
  setShowLabelModal: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenPoLabel?: (mov: any) => void;
}

export const WarehouseHistoryTab: React.FC<WarehouseHistoryTabProps> = ({
  movements,
  movementPage,
  totalMovements,
  setMovementPage,
  setSelectedLabelItem,
  setShowLabelModal,
  onOpenPoLabel,
}) => {
  return (
    <div className="p-5 space-y-4">
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>Temporal Marker</TableHead>
            <TableHead>Material Asset</TableHead>
            <TableHead className="text-center">Movement Type</TableHead>
            <TableHead>Operational Nexus</TableHead>
            <TableHead>Initiator</TableHead>
            <TableHead className="text-right">Delta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.length === 0 ? (
            <TableEmpty
              colSpan={6}
              message="No logistical records detected in the local repository."
            />
          ) : (
            movements.map((mov) => (
              <TableRow key={mov.id}>
                <TableCell>
                  <div className="text-xs font-bold text-stone-900 font-mono tabular-nums uppercase">
                    {new Date(mov.created_at).toLocaleDateString("en-US", {
                      timeZone: "Asia/Jakarta",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-[10px] font-bold text-stone-400 tracking-wider uppercase mt-0.5 font-mono tabular-nums">
                    {new Date(mov.created_at).toLocaleTimeString([], {
                      timeZone: "Asia/Jakarta",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-xs font-bold font-mono tabular-nums text-stone-900 uppercase mb-0.5">
                    {mov.item_code}
                  </div>
                  <div className="text-[11px] text-stone-500 font-semibold uppercase truncate max-w-[200px]">
                    {mov.item_name}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={
                      mov.type === "GRN"
                        ? "success"
                        : mov.type === "CONSUMPTION"
                          ? "warning"
                          : mov.type === "RECLAIM"
                            ? "danger"
                            : "default"
                    }
                    size="sm"
                  >
                    {mov.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-stone-800 uppercase mb-0.5">
                      {mov.project_name || "CENTRAL REPOSITORY"}
                    </span>
                    <span className="text-[10px] text-stone-400 font-bold tracking-wider uppercase font-mono tabular-nums">
                      {mov.id.slice(0, 8)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-800 font-bold text-xs uppercase">
                      {(mov.recorded_by || "S").charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-stone-800 uppercase">
                      {mov.recorded_by || "SYSTEM AUTH"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div className="flex flex-col items-end">
                      <div
                        className={cn(
                          "text-sm font-bold font-mono tabular-nums leading-none",
                          mov.qty > 0 ? "text-emerald-600" : "text-stone-900",
                        )}
                      >
                        {mov.qty > 0 ? "+" : ""}
                        {mov.qty}
                      </div>
                      <span className="text-[9px] font-bold tracking-wider uppercase text-stone-400 mt-1 leading-none">
                        {mov.uom}
                      </span>
                    </div>
                    {mov.type === "GRN" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-xs"
                          variant="secondary"
                          onClick={() => {
                            setSelectedLabelItem(mov);
                            setShowLabelModal(true);
                          }}
                          title="Print Item QR Label"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </Button>
                        {onOpenPoLabel && (
                          <Button
                            size="icon-xs"
                            variant="amber_soft"
                            onClick={() => onOpenPoLabel(mov)}
                            title="Print PO Intake Label"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-stone-200/80 pt-4">
        <div className="text-[11px] font-bold tracking-wider text-stone-500 uppercase font-mono tabular-nums">
          Showing {movements.length > 0 ? movementPage * 100 + 1 : 0} to{" "}
          {Math.min((movementPage + 1) * 100, totalMovements)} of {totalMovements}
        </div>
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setMovementPage((p) => Math.max(0, p - 1))}
            disabled={movementPage === 0}
          >
            Previous
          </Button>
          <Button
            size="xs"
            variant="secondary"
            onClick={() => setMovementPage((p) => p + 1)}
            disabled={(movementPage + 1) * 100 >= totalMovements}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
