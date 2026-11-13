import React from "react";
import {
  CheckSquare,
  Square,
  Loader2,
  ExternalLink,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Award,
  TrendingUp,
  UserCheck,
  UserSearch,
  Trash2,
} from "lucide-react";
import { PotentialCustomer } from "@/types/scout";
import { formatIDR, cn } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface PotentialCustomersTableProps {
  customers: PotentialCustomer[];
  selectedIds: string[];
  onSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onViewDetail: (customer: PotentialCustomer) => void;
  onScoutSingle: (id: string) => void;
  scoutingIds: string[];
  onQuickWhatsApp: (customer: PotentialCustomer) => void;
  onConvertToQuotation: (customer: PotentialCustomer) => void;
  onDeleteProfile: (customer: PotentialCustomer) => void;
}

export function PotentialCustomersTable({
  customers,
  selectedIds,
  onSelectAll,
  onToggleSelect,
  onViewDetail,
  onScoutSingle,
  scoutingIds,
  onQuickWhatsApp,
  onConvertToQuotation,
  onDeleteProfile,
}: PotentialCustomersTableProps) {
  const isAllSelected = customers.length > 0 && selectedIds.length === customers.length;

  return (
    <Table>
      <TableHeader>
        <TableRow hoverable={false}>
          <TableHead className="w-10 text-center">
            <button
              type="button"
              onClick={onSelectAll}
              aria-label="Select All"
              className="text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
            >
              {isAllSelected ? (
                <CheckSquare className="w-4 h-4 text-stone-900" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          </TableHead>
          <TableHead>Lead / Customer</TableHead>
          <TableHead>Priority Grade</TableHead>
          <TableHead className="text-right">Cart Value</TableHead>
          <TableHead>Scout Status</TableHead>
          <TableHead>Privacy Consent</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.length === 0 ? (
          <TableEmpty
            colSpan={7}
            icon={<UserSearch className="w-8 h-8 text-stone-300" />}
            message="No Potential Customers Found"
          />
        ) : (
          customers.map((c) => {
            const isSelected = selectedIds.includes(c.id);
            const isScouting = scoutingIds.includes(c.id);

            return (
              <TableRow
                key={c.id}
                className={isSelected ? "bg-stone-100/70" : ""}
              >
                <TableCell className="text-center">
                  <button
                    type="button"
                    onClick={() => onToggleSelect(c.id)}
                    aria-label={`Select ${c.customer_name}`}
                    className="text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-stone-900" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-xs shrink-0">
                      {c.avatar_url ? (
                        <img
                          src={c.avatar_url}
                          alt={c.customer_name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        c.customer_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onViewDetail(c)}
                        className="font-bold text-stone-900 hover:text-stone-600 transition-colors text-left block truncate max-w-[200px] sm:max-w-xs cursor-pointer"
                      >
                        {c.customer_name}
                      </button>
                      <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                        {c.phone && <span className="font-mono tabular-nums">{c.phone}</span>}
                        {c.phone && c.email && <span>·</span>}
                        {c.email && <span className="truncate max-w-[140px]">{c.email}</span>}
                      </div>
                      {c.company && (
                        <div className="text-[10px] text-stone-400 font-medium mt-0.5 truncate">
                          {c.company}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        c.lead_grade === "A"
                          ? "bg-amber-500"
                          : c.lead_grade === "B"
                            ? "bg-stone-600"
                            : c.lead_grade === "C"
                              ? "bg-stone-400"
                              : "bg-stone-300"
                      )}
                    />
                    Grade {c.lead_grade || "D"}
                  </span>
                  <div className="text-[10px] text-stone-400 mt-1 font-mono tabular-nums">
                    Score: {c.potential_score || 0}/100
                  </div>
                </TableCell>

                <TableCell className="text-right">
                  <span className="font-mono tabular-nums font-bold text-stone-900 block">
                    {formatIDR(c.cart_total_value)}
                  </span>
                  <span className="text-[11px] text-stone-400 font-mono tabular-nums">
                    {c.cart_total_items || 0} items
                  </span>
                </TableCell>

                <TableCell>
                  {isScouting ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                      <Loader2 className="w-3 h-3 animate-spin text-stone-500" />
                      Profiling...
                    </span>
                  ) : c.scout_status === "SCOUTED" ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Profiled
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0" />
                      Pending
                    </span>
                  )}
                  {c.scouted_at && (
                    <span className="block text-[10px] text-stone-400 mt-0.5 font-mono tabular-nums">
                      {new Date(c.scouted_at).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </TableCell>

                <TableCell>
                  {c.profiling_consent ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      Consented
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-400 shrink-0" />
                      First-Party Only
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      onClick={() => onScoutSingle(c.id)}
                      disabled={isScouting}
                      title="Run Scout AI Analysis"
                    >
                      {isScouting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5 text-stone-600" />
                      )}
                    </Button>

                    {c.phone && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-xs"
                        onClick={() => onQuickWhatsApp(c)}
                        title="Contact via WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-xs"
                      onClick={() => onConvertToQuotation(c)}
                      title="Convert to Official Quotation"
                    >
                      <FileText className="w-3.5 h-3.5 text-stone-600" />
                    </Button>

                    <Button
                      type="button"
                      variant="danger_soft"
                      size="icon-xs"
                      onClick={() => onDeleteProfile(c)}
                      title="Delete Customer Profile"
                      aria-label={`Delete profile ${c.customer_name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      onClick={() => onViewDetail(c)}
                      rightIcon={<ExternalLink className="w-3 h-3" />}
                    >
                      Details
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

