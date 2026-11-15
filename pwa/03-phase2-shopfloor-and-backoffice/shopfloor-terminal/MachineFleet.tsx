import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Cpu,
  Cog,
  Search,
  Plus,
  RefreshCw,
  Workflow,
  Wrench,
  QrCode,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Activity,
  Layers,
  Filter,
  Sliders,
  UserCheck,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Action, hasPermission, hasGodMode } from "@/utils/pbac";
import { cn } from "@/lib/utils";
import {
  MachineRegisterModal,
  MachineData,
} from "@/components/erp/production/machines/MachineRegisterModal";
import { MachineBopModal } from "@/components/erp/inventory/MachineBopModal";
import { WarehouseLabelModal } from "@/components/erp/inventory/LabelModal";

export default function MachineFleet() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modals state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<MachineData | null>(null);
  const [showBopModal, setShowBopModal] = useState(false);
  const [selectedMachineForBop, setSelectedMachineForBop] = useState<any | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedMachineForLabel, setSelectedMachineForLabel] = useState<any | null>(null);
  const [deletingMachine, setDeletingMachine] = useState<MachineData | null>(null);

  // Fetch machines from inventory items endpoint
  const fetchMachines = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/inventory/items?type=MACHINE");
      if (res.ok && Array.isArray(res.data)) {
        const machineItems = res.data.filter(
          (item: any) =>
            item.type === "MACHINE" ||
            item.item_type === "MACHINE" ||
            Boolean(item.machine_category) ||
            (item.item_code && String(item.item_code).toUpperCase().startsWith("MC"))
        );
        setMachines(machineItems);
      } else {
        // Fallback: fetch all items and filter client side
        const fallbackRes = await apiFetch("/api/inventory/items");
        if (fallbackRes.ok && Array.isArray(fallbackRes.data)) {
          const filtered = fallbackRes.data.filter(
            (item: any) =>
              item.type === "MACHINE" ||
              item.item_type === "MACHINE" ||
              Boolean(item.machine_category) ||
              (item.item_code && String(item.item_code).toUpperCase().startsWith("MC"))
          );
          setMachines(filtered);
        }
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load machine fleet data", "error");
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  // Statistics calculation
  const stats = useMemo(() => {
    const total = machines.length;
    const active = machines.filter(
      (m) => (m.operational_status || "ACTIVE") === "ACTIVE"
    ).length;
    const maintenance = machines.filter(
      (m) => m.operational_status === "MAINTENANCE"
    ).length;
    const offline = machines.filter(
      (m) => m.operational_status === "OFFLINE"
    ).length;
    const totalCap = machines.reduce(
      (acc, m) => acc + (Number(m.capacity_per_hour) || 0),
      0
    );

    return { total, active, maintenance, offline, totalCap };
  }, [machines]);

  // Filtered machines
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      // Category filter
      if (categoryFilter !== "ALL") {
        if (
          (m.machine_category || "GENERAL").toUpperCase() !==
          categoryFilter.toUpperCase()
        ) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== "ALL") {
        const opStatus = (m.operational_status || "ACTIVE").toUpperCase();
        if (opStatus !== statusFilter.toUpperCase()) {
          return false;
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const code = (m.item_code || "").toLowerCase();
        const name = (m.name || "").toLowerCase();
        const cat = (m.machine_category || "").toLowerCase();
        const op = (m.assigned_operator || "").toLowerCase();
        const sn = (m.serial_number || "").toLowerCase();
        const mfg = (m.manufacturer || "").toLowerCase();
        return (
          code.includes(q) ||
          name.includes(q) ||
          cat.includes(q) ||
          op.includes(q) ||
          sn.includes(q) ||
          mfg.includes(q)
        );
      }

      return true;
    });
  }, [machines, categoryFilter, statusFilter, searchQuery]);

  // Quick toggle status handler
  const handleQuickStatusToggle = async (machine: MachineData) => {
    const current = machine.operational_status || "ACTIVE";
    const next: "ACTIVE" | "MAINTENANCE" | "OFFLINE" =
      current === "ACTIVE"
        ? "MAINTENANCE"
        : current === "MAINTENANCE"
        ? "OFFLINE"
        : "ACTIVE";

    try {
      const res = await apiFetch(`/api/inventory/items/${machine.id}`, {
        method: "PUT",
        body: JSON.stringify({
          operational_status: next,
          machine_status:
            next === "ACTIVE"
              ? "AVAILABLE"
              : next === "MAINTENANCE"
              ? "MAINTENANCE"
              : "OFFLINE",
        }),
      });

      if (res.ok) {
        showToast(
          `Machine [${machine.item_code}] status updated to ${next}`,
          "success"
        );
        fetchMachines();
      } else {
        showToast(res.error || "Failed to update status", "error");
      }
    } catch (e: any) {
      showToast("Error updating operational status", "error");
    }
  };

  // Delete machine handler
  const handleConfirmDelete = async () => {
    if (!deletingMachine?.id) return;
    try {
      const res = await apiFetch(`/api/inventory/items/${deletingMachine.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast(`Machine [${deletingMachine.item_code}] removed`, "success");
        setDeletingMachine(null);
        fetchMachines();
      } else {
        showToast(res.error || "Failed to delete machine", "error");
      }
    } catch (e: any) {
      showToast("Network error deleting machine", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Machine Fleet"
        subtitle="Equipment parameters & workstation assignment"
        icon={<Cog className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            {(hasGodMode(user) ||
              hasPermission(user, Action.CONFIGURE_MACHINE) ||
              hasPermission(user, Action.MANAGE_PRODUCTION_CONFIG)) && (
              <Button
                variant="primary"
                size="xs"
                onClick={() => {
                  setEditingMachine(null);
                  setShowRegisterModal(true);
                }}
                title="Register New Machine Asset"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Register Machine
              </Button>
            )}
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchMachines}
              disabled={isLoading}
              title="Refresh Fleet Data"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              />
            </Button>
          </div>
        }
      />

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Fleet Units"
          value={stats.total}
          subtitle="Active equipment in plant"
          icon={<Cpu className="w-5 h-5" />}
          variant="default"
        />
        <StatCard
          label="Active & Ready"
          value={stats.active}
          subtitle="Available for production"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          variant="success"
        />
        <StatCard
          label="In Maintenance"
          value={stats.maintenance}
          subtitle={stats.offline > 0 ? `${stats.offline} offline / decommissioned` : "Preventive check or repairs"}
          icon={<Wrench className="w-5 h-5 text-amber-600" />}
          variant="warning"
        />
        <StatCard
          label="Cumulative Capacity"
          value={`${stats.totalCap.toLocaleString()} u/h`}
          subtitle="Total rated equipment throughput"
          icon={<Zap className="w-5 h-5 text-indigo-600" />}
          variant="indigo"
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="card-elegant p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="w-full md:w-80">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code, model, operator..."
            leftIcon={<Search className="w-4 h-4" />}
            className="h-9 text-xs"
            wrapperClassName="w-full"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            wrapperClassName="w-full sm:w-48 shrink-0"
            className="h-9 text-xs"
          >
            <option value="ALL">All Categories</option>
            <option value="CUTTING">Cutting &amp; Shearing</option>
            <option value="BENDING">Bending &amp; Folding</option>
            <option value="PRESS">Stamping &amp; Press</option>
            <option value="CNC">CNC Milling &amp; Lathe</option>
            <option value="WELDING">Welding &amp; Fabrication</option>
            <option value="COATING">Painting &amp; Coating</option>
            <option value="ASSEMBLY">Sub-Assembly</option>
            <option value="PACKAGING">Packaging</option>
            <option value="GENERAL">General Industrial</option>
          </Select>

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            wrapperClassName="w-full sm:w-40 shrink-0"
            className="h-9 text-xs"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active Only</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="OFFLINE">Offline Only</option>
          </Select>
        </div>
      </div>

      {/* Machine Fleet Table */}
      <div className="card-elegant rounded-2xl overflow-hidden">
        {isLoading && machines.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center">
            <Loader text="Loading manufacturing machine fleet..." className="min-h-[160px]" />
          </div>
        ) : filteredMachines.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <Cpu className="w-10 h-10 text-stone-300 mx-auto" />
            <div className="text-sm font-bold text-stone-700">No Machines Found</div>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              {searchQuery || categoryFilter !== "ALL" || statusFilter !== "ALL"
                ? "No machine matches your search or filter parameters."
                : "No equipment registered in the manufacturing fleet yet. Click Register Machine to add your first machine."}
            </p>
            {!searchQuery && categoryFilter === "ALL" && statusFilter === "ALL" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingMachine(null);
                  setShowRegisterModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Register Machine
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Machine Code</TableHead>
                <TableHead>Machine Name &amp; Model</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Rated Cap/Hr</TableHead>
                <TableHead>Dedicated Operator</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">BOP Routing</TableHead>
                <TableHead className="text-center w-[160px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMachines.map((m) => {
                const opStatus = (m.operational_status || "ACTIVE").toUpperCase();
                return (
                  <TableRow key={m.id || m.item_code} className="hover:bg-stone-50/70 transition-colors">
                    {/* Machine Code */}
                    <TableCell className="font-mono font-bold text-stone-900 text-xs">
                      {m.item_code}
                    </TableCell>

                    {/* Machine Name & Details */}
                    <TableCell>
                      <div className="font-bold text-stone-900 text-xs">
                        {m.name}
                      </div>
                      <div className="text-[10px] text-stone-400 font-medium mt-0.5 flex items-center gap-2">
                        {m.manufacturer && <span>Mfg: {m.manufacturer}</span>}
                        {m.serial_number && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">SN: {m.serial_number}</span>
                          </>
                        )}
                        {m.spec && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate max-w-[200px]" title={m.spec}>
                              {m.spec}
                            </span>
                          </>
                        )}
                      </div>
                    </TableCell>

                    {/* Category */}
                    <TableCell>
                      <span className="inline-block px-2 py-0.5 rounded-lg bg-stone-100 border border-stone-200/80 text-[10px] font-bold text-stone-700 tracking-wide">
                        {m.machine_category || "GENERAL"}
                      </span>
                    </TableCell>

                    {/* Capacity */}
                    <TableCell className="text-right font-mono font-bold text-xs tabular-nums text-stone-900">
                      {Number(m.capacity_per_hour || 0).toLocaleString()}{" "}
                      <span className="text-[10px] text-stone-400 font-normal">u/h</span>
                    </TableCell>

                    {/* Dedicated Operator */}
                    <TableCell>
                      {m.assigned_operator ? (
                        <div className="flex items-center gap-1.5 text-xs text-stone-800 font-medium">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[140px]">{m.assigned_operator}</span>
                        </div>
                      ) : (
                        <span className="text-stone-400 italic text-[11px]">Unassigned</span>
                      )}
                    </TableCell>

                    {/* Operational Status with quick click toggle */}
                    <TableCell className="text-center">
                      <button
                        type="button"
                        onClick={() => handleQuickStatusToggle(m)}
                        title="Click to toggle status (ACTIVE / MAINTENANCE / OFFLINE)"
                        className="cursor-pointer transition-transform hover:scale-105 active:scale-95 inline-block"
                      >
                        {opStatus === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            ACTIVE
                          </span>
                        ) : opStatus === "MAINTENANCE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            MAINTENANCE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                            OFFLINE
                          </span>
                        )}
                      </button>
                    </TableCell>

                    {/* BOP Routing Bypass */}
                    <TableCell className="text-center">
                      {m.bypass_multi_station ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200" title="Bypasses multi-station queue in single direct pass">
                          <Zap className="w-3 h-3 text-indigo-600" />
                          Bypass
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400 font-medium font-mono">
                          Standard
                        </span>
                      )}
                    </TableCell>

                    {/* Action Buttons */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Link to BOP */}
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedMachineForBop(m);
                            setShowBopModal(true);
                          }}
                          title="Configure BOP Routing Linkages"
                        >
                          <Workflow className="w-3.5 h-3.5 text-blue-600" />
                        </Button>

                        {/* Print QR Tag */}
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedMachineForLabel(m);
                            setShowLabelModal(true);
                          }}
                          title="Print Machine QR Tag"
                        >
                          <QrCode className="w-3.5 h-3.5 text-stone-700" />
                        </Button>

                        {/* Edit Parameters */}
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingMachine(m);
                            setShowRegisterModal(true);
                          }}
                          title="Edit Machine Specifications & Parameters"
                        >
                          <Pencil className="w-3.5 h-3.5 text-stone-700" />
                        </Button>

                        {/* Delete Machine */}
                        <Button
                          size="icon-sm"
                          variant="danger_soft"
                          onClick={() => setDeletingMachine(m)}
                          title="Delete Machine Asset"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modals */}
      {/* 1. Register / Edit Machine Modal */}
      <MachineRegisterModal
        isOpen={showRegisterModal}
        onClose={() => {
          setShowRegisterModal(false);
          setEditingMachine(null);
        }}
        machineToEdit={editingMachine}
        existingMachines={machines}
        onSuccess={fetchMachines}
      />

      {/* 2. Machine BOP Linkage Modal */}
      <MachineBopModal
        isOpen={showBopModal}
        onClose={() => {
          setShowBopModal(false);
          setSelectedMachineForBop(null);
        }}
        machine={selectedMachineForBop}
        onSuccess={fetchMachines}
      />

      {/* 3. Print QR Tag Modal */}
      <WarehouseLabelModal
        isOpen={showLabelModal}
        onClose={() => {
          setShowLabelModal(false);
          setSelectedMachineForLabel(null);
        }}
        selectedLabelItem={selectedMachineForLabel}
      />

      {/* 4. Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deletingMachine)}
        onCancel={() => setDeletingMachine(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Machine Record"
        message={
          <>
            Are you sure you want to remove machine{" "}
            <strong>[{deletingMachine?.item_code}] {deletingMachine?.name}</strong> from the fleet? This operation is permanent.
          </>
        }
      />
    </div>
  );
}
