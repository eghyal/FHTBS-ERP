import React, { memo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatIDR } from "@/lib/utils";
import { canViewDocFinancials, ConfidentialBadge } from "@/utils/rbacFinancials";

interface PrDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPrDetails: any;
}

export const PrDetailsModal = memo(function PrDetailsModal({
  isOpen,
  onClose,
  selectedPrDetails,
}: PrDetailsModalProps) {
  const { user } = useAuth();
  if (!selectedPrDetails) return null;

  const canViewPrPrices = canViewDocFinancials(user, "PR");
  const estimatedCost = Number(selectedPrDetails.total_estimated_cost || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      title={
        <div>
          <Badge variant="success" size="sm" className="mb-1">
            Official Purchase Request
          </Badge>
          <div className="text-base font-mono font-bold text-stone-900 tracking-tight">
            {selectedPrDetails.pr_number}
          </div>
        </div>
      }
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-5">
        {/* PR Information Block */}
        <div className="bg-stone-50/70 border border-stone-200/80 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              Project Name
            </span>
            <div className="text-xs font-bold text-stone-900 uppercase">
              {selectedPrDetails.project_name || "-"}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              Expected Delivery Date
            </span>
            <div className="text-xs font-bold text-emerald-700 font-mono tabular-nums">
              {selectedPrDetails.expected_delivery_date || "As soon as possible"}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              Estimated Cost
            </span>
            <div className="text-xs font-bold text-stone-900 font-mono tabular-nums">
              {canViewPrPrices ? (
                estimatedCost > 0 ? formatIDR(estimatedCost) : "-"
              ) : (
                <ConfidentialBadge size="xs" />
              )}
            </div>
          </div>
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">
              Document Status
            </span>
            <div>
              <Badge
                variant={selectedPrDetails.status === "ORDERED" || selectedPrDetails.status === "AUTHORIZED" ? "success" : "warning"}
                size="sm"
              >
                {selectedPrDetails.status}
              </Badge>
            </div>
          </div>

          {selectedPrDetails.drawing_reference && (
            <div className="sm:col-span-4 pt-3 border-t border-stone-200/60 flex items-center justify-between">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                Technical Drawing Attachment
              </span>
              <a
                href={selectedPrDetails.drawing_reference}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              >
                <FileText className="w-3.5 h-3.5" /> View Drawing
              </a>
            </div>
          )}
        </div>

        {/* PR Items Table Card */}
        <div>
          <h4 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-2">
            Requested Materials & Components
          </h4>
          <div className="overflow-x-auto border border-stone-200 rounded-xl">
            <Table compact className="min-w-[580px]">
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Material Item</TableHead>
                <TableHead>Expected Delivery</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedPrDetails.items &&
                selectedPrDetails.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-mono font-bold text-stone-900 text-xs tabular-nums">
                        {item.item_code}
                      </div>
                      <div className="text-xs font-semibold text-stone-800 mt-0.5">
                        {item.item_name}
                      </div>
                      {(item.dimension || item.spec) && (
                        <div className="text-[10px] text-stone-500 font-mono mt-0.5 leading-snug">
                          {[item.dimension, item.spec]
                            .filter(Boolean)
                            .join(" • ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-semibold text-stone-600 font-mono tabular-nums">
                        {item.expected_delivery_date || "Consolidated"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-stone-900 text-xs font-mono tabular-nums">
                      {item.qty}{" "}
                      <span className="text-[10px] text-stone-500 font-sans tracking-wider ml-0.5 uppercase">
                        {item.uom}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>
    </Modal>
  );
});
