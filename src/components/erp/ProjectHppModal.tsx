import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calculator,
  Package,
  Users,
  Cpu,
  RefreshCw,
  TrendingUp,
  Info,
  CheckCircle2,
  Copy,
  Check,
  Search,
  Layers,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { formatIDR } from "@/lib/utils";

interface ProjectMaterialItem {
  id: string;
  source: "PR_ITEM" | "BOM_ITEM";
  item_code?: string;
  item_name: string;
  qty: number;
  uom: string;
  unit_price: number;
  total_price: number;
  pr_number?: string;
  po_number?: string;
  supplier_name?: string;
}

interface ProjectLaborEntry {
  source: "ATTENDANCE" | "OVERTIME_SCHEDULE" | "MANPOWER_ASSIGNMENT";
  name: string;
  date: string;
  shift?: string;
  hours: number;
  overtimeHours: number;
  hourlyRate: number;
  cost: number;
  status: string;
}

interface ProjectHppData {
  projectId: string;
  projectName: string;
  projectQty: number;
  totalRevenue: number;
  lastUpdated: string;

  // Option 1: HPP Murni
  materialOnly: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    materialCount: number;
  };

  // Option 2: HPP Komprehensif
  fullCosting: {
    totalHpp: number;
    unitHpp: number;
    grossProfit: number;
    grossMarginPct: number;
    totalMaterialCost: number;
    totalLaborCost: number;
    totalOverheadCost: number;
    materialPercentage: number;
    laborPercentage: number;
    overheadPercentage: number;
  };

  // Direct backwards-compatible fields
  totalBomCost: number;
  totalLaborCost: number;
  totalOverheadCost: number;
  totalHpp: number;
  unitHpp: number;
  grossProfit: number;
  grossMarginPct: number;

  materialBreakdown?: {
    totalMaterialCost: number;
    itemCount: number;
    sourceType: "ACTUAL_PR_PO" | "BOM_ESTIMATE";
    items: ProjectMaterialItem[];
  };

  laborBreakdown?: {
    totalLaborCost: number;
    regularHours: number;
    overtimeHours: number;
    regularLaborCost: number;
    overtimeLaborCost: number;
    attendanceLaborCost: number;
    overtimeSchedulesCost: number;
    assignmentsCost: number;
    entries: ProjectLaborEntry[];
  };
}

interface ProjectHppModalProps {
  projectId: string;
  projectName?: string;
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "MATERIAL_ONLY" | "FULL_COSTING";
}

export const ProjectHppModal: React.FC<ProjectHppModalProps> = ({
  projectId,
  projectName = "Project",
  isOpen,
  onClose,
  initialMode = "MATERIAL_ONLY",
}) => {
  const [costMode, setCostMode] = useState<"MATERIAL_ONLY" | "FULL_COSTING">(initialMode);
  const [data, setData] = useState<ProjectHppData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"summary" | "materials" | "labor" | "overhead">("summary");
  const [searchMaterial, setSearchMaterial] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const loadHppData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/hpp`);
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to load project HPP data:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const handleRecalculate = useCallback(async () => {
    try {
      setRecalculating(true);
      const res = await fetch(`/api/projects/${projectId}/recalculate-hpp`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to recalculate project HPP:", err);
    } finally {
      setRecalculating(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen && projectId) {
      loadHppData();
    }
  }, [isOpen, projectId, loadHppData]);

  const materialItems = data?.materialBreakdown?.items || [];
  const filteredMaterials = useMemo(() => {
    const q = searchMaterial.toLowerCase();
    if (!q) return materialItems;
    return materialItems.filter(
      (item) =>
        (item.item_name || "").toLowerCase().includes(q) ||
        (item.item_code || "").toLowerCase().includes(q) ||
        (item.pr_number || "").toLowerCase().includes(q) ||
        (item.supplier_name || "").toLowerCase().includes(q)
    );
  }, [materialItems, searchMaterial]);

  if (!isOpen) return null;

  const currentMaterialHpp = data?.materialOnly?.totalHpp ?? data?.totalBomCost ?? 0;
  const currentMaterialUnit = data?.materialOnly?.unitHpp ?? Math.round(currentMaterialHpp / Math.max(1, data?.projectQty || 1));
  const currentMaterialProfit = data?.materialOnly?.grossProfit ?? ((data?.totalRevenue || 0) - currentMaterialHpp);
  const currentMaterialMargin = data?.materialOnly?.grossMarginPct ?? (data?.totalRevenue ? Number(((currentMaterialProfit / data.totalRevenue) * 100).toFixed(2)) : 0);

  const currentFullHpp = data?.fullCosting?.totalHpp ?? data?.totalHpp ?? 0;
  const currentFullUnit = data?.fullCosting?.unitHpp ?? Math.round(currentFullHpp / Math.max(1, data?.projectQty || 1));
  const currentFullProfit = data?.fullCosting?.grossProfit ?? ((data?.totalRevenue || 0) - currentFullHpp);
  const currentFullMargin = data?.fullCosting?.grossMarginPct ?? (data?.totalRevenue ? Number(((currentFullProfit / data.totalRevenue) * 100).toFixed(2)) : 0);

  const isMaterialOnly = costMode === "MATERIAL_ONLY";
  const activeHpp = isMaterialOnly ? currentMaterialHpp : currentFullHpp;
  const activeUnit = isMaterialOnly ? currentMaterialUnit : currentFullUnit;
  const activeProfit = isMaterialOnly ? currentMaterialProfit : currentFullProfit;
  const activeMargin = isMaterialOnly ? currentMaterialMargin : currentFullMargin;

  const handleCopySummary = () => {
    const text = `
=== COGS ANALYSIS: ${data?.projectName || projectName} ===
Project ID: ${projectId}
Quantity: ${data?.projectQty || 1} Units
Total Revenue: ${formatIDR(data?.totalRevenue || 0)}

--- OPTION 1: DIRECT MATERIAL ONLY ---
Total Material COGS: ${formatIDR(currentMaterialHpp)}
COGS per Unit (Material): ${formatIDR(currentMaterialUnit)}
Gross Profit (Material Only): ${formatIDR(currentMaterialProfit)} (${currentMaterialMargin}%)
Component Count: ${data?.materialOnly?.materialCount || materialItems.length} items

--- OPTION 2: COMPREHENSIVE COGS (+ LABOR & OVERHEAD) ---
Material Cost: ${formatIDR(currentMaterialHpp)} (${data?.fullCosting?.materialPercentage || 0}%)
Direct Labor Cost (DL): ${formatIDR(data?.totalLaborCost || 0)} (${data?.fullCosting?.laborPercentage || 0}%)
Factory Overhead Cost (FOH): ${formatIDR(data?.totalOverheadCost || 0)} (${data?.fullCosting?.overheadPercentage || 0}%)
Total Comprehensive COGS: ${formatIDR(currentFullHpp)}
COGS per Unit (Comprehensive): ${formatIDR(currentFullUnit)}
Gross Profit: ${formatIDR(currentFullProfit)} (${currentFullMargin}%)
Last Calculated: ${data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString("en-US") : "-"}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="6xl"
      title={
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-stone-100 text-stone-800 border border-stone-200 shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-stone-900">
                Project COGS &amp; Cost Analysis
              </h3>
              <span className="px-2 py-0.5 text-[11px] font-mono font-bold rounded-md bg-stone-100 border border-stone-200 text-stone-700">
                {projectId}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {data?.projectName || projectName} &bull; Target:{" "}
              <span className="font-mono tabular-nums font-semibold text-stone-700">
                {data?.projectQty || 1}
              </span>{" "}
              Units
            </p>
          </div>
        </div>
      }
      contentClassName="p-0 flex flex-col min-h-0"
      footer={
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="text-[11px] text-stone-500">
            Last calculated:{" "}
            <span className="font-mono font-medium text-stone-700">
              {data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString("en-US") : "-"}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {/* Top Action & Mode Bar */}
      <div className="px-6 py-3.5 bg-stone-50 border-b border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
            COGS Calculation Mode
          </span>
          <p className="text-xs text-stone-600 mt-0.5">
            Select analysis mode to isolate direct raw materials or include direct labor &amp; factory overhead.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 bg-white border border-stone-200 rounded-xl">
            <button
              id="toggle-hpp-material-only-btn"
              type="button"
              onClick={() => setCostMode("MATERIAL_ONLY")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isMaterialOnly
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Option 1: Direct Material Only</span>
            </button>

            <button
              id="toggle-hpp-full-costing-btn"
              type="button"
              onClick={() => setCostMode("FULL_COSTING")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                !isMaterialOnly
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Option 2: Comprehensive (+ Labor &amp; Overhead)</span>
            </button>
          </div>

          <Button
            id="hpp-modal-recalculate-btn"
            variant="secondary"
            size="sm"
            onClick={handleRecalculate}
            disabled={recalculating}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${recalculating ? "animate-spin" : ""}`} />}
          >
            {recalculating ? "Calculating..." : "Recalculate"}
          </Button>

          <Button
            id="hpp-modal-copy-btn"
            variant="secondary"
            size="sm"
            onClick={handleCopySummary}
            leftIcon={copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      {/* Modal Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5">
        {loading ? (
          <div className="py-16 text-center text-stone-500">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-stone-600 mb-3" />
            <p className="text-sm font-medium">Loading COGS analysis data...</p>
          </div>
        ) : (
          <>

            {/* 4 PRIMARY METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Total HPP */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="font-semibold">
                    {isMaterialOnly ? "Total Material COGS" : "Total Comprehensive COGS"}
                  </span>
                  <Package className="w-4 h-4 text-stone-600" />
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-stone-900 tracking-tight">
                  {formatIDR(activeHpp)}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  {isMaterialOnly
                    ? `${data?.materialBreakdown?.itemCount || 0} material component types`
                    : `Mat + Labor (${formatIDR(data?.totalLaborCost || 0)}) + Overhead`}
                </div>
              </div>

              {/* 2. Unit HPP */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="font-semibold">COGS per Unit</span>
                  <Calculator className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 tracking-tight">
                  {formatIDR(activeUnit)}
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  Across {data?.projectQty || 1} target production units
                </div>
              </div>

              {/* 3. Gross Profit */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="font-semibold">
                    {isMaterialOnly ? "Gross Profit (Material)" : "Gross Profit (Comprehensive)"}
                  </span>
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums tracking-tight ${
                    activeProfit >= 0 ? "text-stone-900" : "text-rose-600"
                  }`}
                >
                  {formatIDR(activeProfit)}
                </div>
                <div className="text-[11px] text-stone-500 font-mono tabular-nums mt-1">
                  Revenue: {formatIDR(data?.totalRevenue || 0)}
                </div>
              </div>

              {/* 4. Gross Margin % */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="font-semibold">Gross Margin %</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums tracking-tight ${
                    activeMargin >= 20
                      ? "text-emerald-700"
                      : activeMargin > 0
                      ? "text-amber-700"
                      : "text-rose-600"
                  }`}
                >
                  {activeMargin}%
                </div>
                <div className="text-[11px] text-stone-500 mt-1">
                  {isMaterialOnly ? "Based on Direct Materials" : "Based on Full Costing"}
                </div>
              </div>
            </div>

            {/* COST COMPARISON TABLE (SIDE BY SIDE: MURNI VS KOMPREHENSIF) */}
            <div className="rounded-xl border border-stone-200 overflow-hidden">
              <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-stone-600" />
                  Side-by-Side Costing Comparison
                </h4>
                <span className="text-[11px] font-mono text-stone-500">
                  Currency: IDR (Rupiah)
                </span>
              </div>

              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-stone-50 border-b border-stone-200">
                      <TableHead className="py-2.5 px-4">Cost Component</TableHead>
                      <TableHead className="py-2.5 px-4 text-right">
                        Option 1: Direct Material
                      </TableHead>
                      <TableHead className="py-2.5 px-4 text-right">
                        Option 2: Comprehensive (+ Var)
                      </TableHead>
                      <TableHead className="py-2.5 px-4 text-right">
                        Variance (+ Other Costs)
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-stone-100">
                    {/* Direct Material */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800 flex items-center gap-2">
                        <Package className="w-3.5 h-3.5 text-stone-600" />
                        Direct Raw Materials
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-stone-900">
                        {formatIDR(currentMaterialHpp)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-stone-900">
                        {formatIDR(currentMaterialHpp)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-400">
                        Rp 0 (Equal)
                      </TableCell>
                    </TableRow>

                    {/* Direct Labor */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800 flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        Direct Labor (Shift &amp; Overtime)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-400 italic">
                        Rp 0 (Excluded)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatIDR(data?.totalLaborCost || 0)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        +{formatIDR(data?.totalLaborCost || 0)}
                      </TableCell>
                    </TableRow>

                    {/* Factory Overhead */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800 flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-amber-600" />
                        Factory Overhead (Machine &amp; Process Routing)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-400 italic">
                        Rp 0 (Excluded)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-stone-900">
                        {formatIDR(data?.totalOverheadCost || 0)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-700 font-medium">
                        +{formatIDR(data?.totalOverheadCost || 0)}
                      </TableCell>
                    </TableRow>

                    {/* TOTAL HPP */}
                    <TableRow className="bg-stone-100/70 font-bold border-t border-stone-200">
                      <TableCell className="py-3 px-4 text-stone-900">
                        TOTAL COGS
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right font-mono tabular-nums text-stone-900">
                        {formatIDR(currentMaterialHpp)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right font-mono tabular-nums text-stone-900">
                        {formatIDR(currentFullHpp)}
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right font-mono tabular-nums text-stone-800">
                        +{formatIDR(currentFullHpp - currentMaterialHpp)}
                      </TableCell>
                    </TableRow>

                    {/* UNIT HPP */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800">
                        COGS per Unit (Target: {data?.projectQty || 1} Units)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-stone-900">
                        {formatIDR(currentMaterialUnit)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-stone-900">
                        {formatIDR(currentFullUnit)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-stone-600">
                        +{formatIDR(currentFullUnit - currentMaterialUnit)}
                      </TableCell>
                    </TableRow>

                    {/* GROSS PROFIT */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800">
                        Gross Profit
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatIDR(currentMaterialProfit)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatIDR(currentFullProfit)}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600">
                        -{formatIDR(currentMaterialProfit - currentFullProfit)}
                      </TableCell>
                    </TableRow>

                    {/* GROSS MARGIN % */}
                    <TableRow className="hover:bg-stone-50/50">
                      <TableCell className="py-2.5 px-4 font-medium text-stone-800">
                        Gross Margin (%)
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {currentMaterialMargin}%
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {currentFullMargin}%
                      </TableCell>
                      <TableCell className="py-2.5 px-4 text-right font-mono tabular-nums text-rose-600">
                        {(currentFullMargin - currentMaterialMargin).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* TABS FOR DEEP-DIVE BREAKDOWN */}
            <div className="space-y-3">
              <div className="flex border-b border-stone-200 gap-2 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setActiveTab("materials")}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === "materials"
                      ? "border-stone-900 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  Material Breakdown ({materialItems.length})
                </button>

                <button
                  onClick={() => setActiveTab("labor")}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === "labor"
                      ? "border-stone-900 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  Direct Labor Breakdown ({data?.laborBreakdown?.entries?.length || 0})
                </button>

                <button
                  onClick={() => setActiveTab("overhead")}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === "overhead"
                      ? "border-stone-900 text-stone-900"
                      : "border-transparent text-stone-500 hover:text-stone-800"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  Factory Overhead Breakdown
                </button>
              </div>

              {/* TAB CONTENT: MATERIAL ITEMS */}
              {activeTab === "materials" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-stone-400" />
                      <input
                        type="text"
                        value={searchMaterial}
                        onChange={(e) => setSearchMaterial(e.target.value)}
                        placeholder="Search component or PR number..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white focus:outline-none focus:border-stone-900"
                      />
                    </div>
                    <span className="text-xs text-stone-500">
                      Data source:{" "}
                      <span className="font-semibold text-stone-800">
                        {data?.materialBreakdown?.sourceType === "ACTUAL_PR_PO"
                          ? "Actual PR/PO Procurement"
                          : "Project BOM Budget Estimate"}
                      </span>
                    </span>
                  </div>

                  <div className="max-h-72 overflow-auto rounded-xl border border-stone-200">
                    <Table className="text-xs min-w-[680px]">
                      <TableHeader className="sticky top-0 bg-stone-50 z-10">
                        <TableRow className="border-b border-stone-200">
                          <TableHead className="py-2 px-3">Code / Item</TableHead>
                          <TableHead className="py-2 px-3 text-right">Qty</TableHead>
                          <TableHead className="py-2 px-3 text-right">Unit Price</TableHead>
                          <TableHead className="py-2 px-3 text-right">Total Cost</TableHead>
                          <TableHead className="py-2 px-3">Ref PR / PO</TableHead>
                          <TableHead className="py-2 px-3">Supplier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-stone-100">
                        {filteredMaterials.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-stone-400">
                              No material items found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredMaterials.map((item, idx) => (
                            <TableRow key={idx} className="hover:bg-stone-50/50">
                              <TableCell className="py-2 px-3">
                                <div className="font-medium text-stone-900">
                                  {item.item_name}
                                </div>
                                {item.item_code && (
                                  <div className="text-[10px] font-mono text-stone-400">{item.item_code}</div>
                                )}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                                {item.qty} {item.uom}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-stone-600">
                                {formatIDR(item.unit_price)}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-stone-900">
                                {formatIDR(item.total_price)}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-[11px] font-mono text-stone-500">
                                {item.pr_number || "-"}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-[11px] text-stone-500 truncate max-w-[120px]">
                                {item.supplier_name || "-"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: LABOR ENTRIES */}
              {activeTab === "labor" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <span className="text-stone-600">Regular Work Hours</span>
                      <div className="text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                        {data?.laborBreakdown?.regularHours || 0} Hrs
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-emerald-700">
                        {formatIDR(data?.laborBreakdown?.regularLaborCost || 0)}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <span className="text-stone-600">Overtime Hours</span>
                      <div className="text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                        {data?.laborBreakdown?.overtimeHours || 0} Hrs
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-amber-700">
                        {formatIDR(data?.laborBreakdown?.overtimeLaborCost || 0)}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                      <span className="text-stone-600">Total Direct Labor Cost</span>
                      <div className="text-base font-bold font-mono tabular-nums text-stone-900 mt-0.5">
                        {formatIDR(data?.totalLaborCost || 0)}
                      </div>
                      <span className="text-[11px] text-stone-500">
                        {isMaterialOnly ? "Excluded in Option 1" : "Included in Option 2"}
                      </span>
                    </div>
                  </div>

                  <div className="max-h-72 overflow-auto rounded-xl border border-stone-200">
                    <Table className="text-xs min-w-[680px]">
                      <TableHeader className="sticky top-0 bg-stone-50 z-10">
                        <TableRow className="border-b border-stone-200">
                          <TableHead className="py-2 px-3">Worker / Operator Name</TableHead>
                          <TableHead className="py-2 px-3">Date / Shift</TableHead>
                          <TableHead className="py-2 px-3 text-right">Regular Hrs</TableHead>
                          <TableHead className="py-2 px-3 text-right">Overtime Hrs</TableHead>
                          <TableHead className="py-2 px-3 text-right">Rate / Hr</TableHead>
                          <TableHead className="py-2 px-3 text-right">Total Wage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-stone-100">
                        {!data?.laborBreakdown?.entries?.length ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-stone-400">
                              No shift attendance or manpower assignments recorded yet
                            </TableCell>
                          </TableRow>
                        ) : (
                          data.laborBreakdown.entries.map((entry, idx) => (
                            <TableRow key={idx} className="hover:bg-stone-50/50">
                              <TableCell className="py-2 px-3 font-medium text-stone-900">
                                {entry.name}
                              </TableCell>
                              <TableCell className="py-2 px-3 font-mono text-stone-500">
                                {entry.date} {entry.shift ? `(${entry.shift})` : ""}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                                {entry.hours} Hrs
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums font-medium text-amber-700">
                                {entry.overtimeHours} Hrs
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums text-stone-500">
                                {formatIDR(entry.hourlyRate)}
                              </TableCell>
                              <TableCell className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-stone-900">
                                {formatIDR(entry.cost)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: OVERHEAD (BOP) */}
              {activeTab === "overhead" && (
                <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-stone-700" />
                      <h5 className="text-xs font-bold text-stone-900">
                        Factory Overhead Cost (Standard Overhead Rate)
                      </h5>
                    </div>
                    <span className="text-xs font-bold font-mono tabular-nums text-stone-900">
                      Total: {formatIDR(data?.totalOverheadCost || 0)}
                    </span>
                  </div>

                  <p className="text-xs text-stone-600">
                    Factory overhead is allocated based on standard machine/process routing hours recorded in the Bill of Process (BOP) multiplied by the standard operational overhead rate (Rp 25,000 / machine hour).
                  </p>

                  <div className="p-3 bg-white rounded-lg border border-stone-200 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Allocation Status:</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-md ${
                        isMaterialOnly
                          ? "bg-stone-100 text-stone-600"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {isMaterialOnly
                        ? "Excluded (Direct Material Mode Active)"
                        : "Absorbed into COGS (Comprehensive Mode Active)"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
