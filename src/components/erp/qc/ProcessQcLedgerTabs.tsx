import React, { memo } from "react";
import {
  FileCheck2,
  AlertOctagon,
  Search,
  CheckCircle2,
  PackagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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
import { cn, formatIDR } from "@/lib/utils";
import { LedgerMode, QcProjectItem } from "./qcTypes";

interface ProcessQcLedgerTabsProps {
  ledgerMode: LedgerMode;
  setLedgerMode: (mode: LedgerMode) => void;
  projectInspections: any[];
  filteredNcrs: any[];
  projects: QcProjectItem[];
  searchNcrQuery: string;
  setSearchNcrQuery: (val: string) => void;
  ncrStatusFilter: string;
  setNcrStatusFilter: (val: string) => void;
  onResolveNcr: (ncrId: string, ncrNumber: string) => void;
}

export const ProcessQcLedgerTabs = memo(function ProcessQcLedgerTabs({
  ledgerMode,
  setLedgerMode,
  projectInspections,
  filteredNcrs,
  projects,
  searchNcrQuery,
  setSearchNcrQuery,
  ncrStatusFilter,
  setNcrStatusFilter,
  onResolveNcr,
}: ProcessQcLedgerTabsProps) {
  return (
    <div className="w-full bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden">
      {/* Strictly Single-Line Header Bar */}
      <div className="h-14 px-4 border-b border-stone-200/80 bg-stone-50/50 flex items-center justify-between gap-3 flex-nowrap overflow-x-auto">
        <div className="inline-flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200/80 shrink-0">
          <button
            type="button"
            onClick={() => setLedgerMode("MEASUREMENTS")}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border focus:outline-none",
              ledgerMode === "MEASUREMENTS"
                ? "bg-white text-stone-900 border-stone-200/80 shadow-2xs"
                : "bg-transparent border-transparent text-stone-600 hover:text-stone-900"
            )}
          >
            <FileCheck2
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                ledgerMode === "MEASUREMENTS"
                  ? "text-emerald-600"
                  : "text-stone-500"
              )}
            />
            <span>BOP Tolerance Measurements</span>
            <span className="font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 leading-none">
              {projectInspections.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setLedgerMode("NCR_CAPA")}
            className={cn(
              "h-8 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 border focus:outline-none",
              ledgerMode === "NCR_CAPA"
                ? "bg-white text-stone-900 border-stone-200/80 shadow-2xs"
                : "bg-transparent border-transparent text-stone-600 hover:text-stone-900"
            )}
          >
            <AlertOctagon
              className={cn(
                "w-3.5 h-3.5 shrink-0",
                ledgerMode === "NCR_CAPA" ? "text-rose-600" : "text-stone-500"
              )}
            />
            <span>NCR, Rework &amp; CAPA Registry</span>
            <span
              className={cn(
                "font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded leading-none",
                filteredNcrs.length > 0
                  ? "bg-rose-50 text-rose-700"
                  : "bg-stone-100 text-stone-700"
              )}
            >
              {filteredNcrs.length}
            </span>
          </button>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 shrink-0 flex-nowrap transition-opacity",
            ledgerMode === "NCR_CAPA"
              ? "opacity-100"
              : "invisible pointer-events-none select-none"
          )}
        >
          <div className="w-52 shrink-0">
            <Input
              type="text"
              placeholder="Search NCR..."
              value={searchNcrQuery}
              onChange={(e) => setSearchNcrQuery(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
              className="h-8 text-xs"
            />
          </div>
          <div className="w-36 shrink-0">
            <Select
              value={ncrStatusFilter}
              onChange={(e) => setNcrStatusFilter(e.target.value)}
              className="h-8 text-xs"
              options={[
                { value: "ALL", label: "All Status" },
                { value: "OPEN", label: "Open Only" },
                { value: "RESOLVED", label: "Resolved" },
              ]}
            />
          </div>
        </div>
      </div>

      {ledgerMode === "MEASUREMENTS" ? (
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHead>Date &amp; Gate</TableHead>
              <TableHead>BOP Step &amp; Station</TableHead>
              <TableHead>Parameter &amp; Tolerance Spec</TableHead>
              <TableHead>Actual Measurement</TableHead>
              <TableHead className="text-center">
                Sample / Pass / Defect
              </TableHead>
              <TableHead className="text-center">Disposition</TableHead>
              <TableHead>Inspector</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectInspections.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message="No BOP station measurements recorded for this project yet."
              />
            ) : (
              projectInspections.map((insp) => (
                <TableRow key={insp.id}>
                  <TableCell>
                    <Badge
                      variant={
                        insp.inspection_type === "FAI"
                          ? "info"
                          : insp.inspection_type === "FINAL_GATE"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {insp.inspection_type}
                    </Badge>
                    <div className="text-[11px] font-mono tabular-nums text-stone-500 mt-1">
                      {new Date(insp.inspected_at).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-bold text-stone-900">
                      {insp.process_name}
                    </div>
                    <div className="text-[11px] font-mono text-stone-500">
                      {insp.station_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-semibold text-stone-800">
                      {insp.parameter_name}
                    </div>
                    <div className="text-[11px] font-mono text-stone-500">
                      {insp.nominal_spec} ({insp.tolerance_spec})
                    </div>
                  </TableCell>
                  <TableCell className="font-mono tabular-nums text-xs font-bold text-stone-900">
                    {insp.measured_value || "Conforms"}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs tabular-nums">
                    <span className="font-bold text-stone-900">
                      {insp.sample_size}
                    </span>{" "}
                    /{" "}
                    <span className="text-emerald-700 font-bold">
                      {insp.passed_qty}P
                    </span>{" "}
                    /{" "}
                    <span className="text-rose-600 font-bold">
                      {insp.defect_qty}D
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={
                        insp.disposition === "PASSED"
                          ? "success"
                          : insp.disposition === "CONDITIONAL"
                            ? "warning"
                            : "danger"
                      }
                    >
                      {insp.disposition}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-stone-700">
                    <div className="font-semibold">{insp.inspector_name}</div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow hoverable={false}>
              <TableHead>NCR No.</TableHead>
              <TableHead>Project &amp; Station</TableHead>
              <TableHead>Defect &amp; Severity</TableHead>
              <TableHead className="text-center">Qty / Action</TableHead>
              <TableHead className="text-right">Est. COPQ</TableHead>
              <TableHead>Root Cause, CAPA &amp; PPIC Link</TableHead>
              <TableHead className="text-right">Resolution</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredNcrs.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message="No Non-Conformance Reports (NCR) found."
              />
            ) : (
              filteredNcrs.map((ncr) => {
                const proj = projects.find((p) => p.id === ncr.project_id);
                return (
                  <TableRow key={ncr.id}>
                    <TableCell>
                      <div className="font-mono tabular-nums text-xs font-bold text-stone-900">
                        {ncr.ncr_number}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-stone-500">
                        {new Date(ncr.created_at).toLocaleDateString("en-GB")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-bold text-stone-900">
                        {proj?.name || ncr.project_id}
                      </div>
                      <div className="text-[11px] font-mono text-stone-500">
                        {ncr.station_name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          ncr.severity === "CRITICAL"
                            ? "danger"
                            : ncr.severity === "MAJOR"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {ncr.severity}
                      </Badge>
                      <div className="text-xs font-semibold text-stone-800 mt-1">
                        {String(ncr.defect_category || "").replace(/_/g, " ")}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="font-mono tabular-nums text-xs font-bold text-rose-700">
                        {ncr.defect_qty} PCS
                      </div>
                      <Badge
                        variant={
                          ncr.disposition_action === "SCRAP"
                            ? "danger"
                            : "warning"
                        }
                      >
                        {ncr.disposition_action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-stone-900">
                      {formatIDR(Number(ncr.cost_of_poor_quality || 0))}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="text-xs text-stone-800 line-clamp-1">
                        <strong>Cause:</strong> {ncr.root_cause || "-"}
                      </div>
                      <div className="text-[11px] text-stone-500 line-clamp-1">
                        <strong>CAPA:</strong> {ncr.corrective_action || "-"}
                      </div>
                      {ncr.replacement_pr_number && (
                        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono tabular-nums font-bold">
                          <PackagePlus className="w-3 h-3" />
                          PR: {ncr.replacement_pr_number}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {ncr.status === "OPEN" ? (
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => onResolveNcr(ncr.id, ncr.ncr_number)}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white"
                        >
                          Resolve &amp; Unlock
                        </Button>
                      ) : (
                        <Badge variant="success">RESOLVED</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
});
