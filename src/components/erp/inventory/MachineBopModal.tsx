import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import {
  Cpu,
  Workflow,
  Link2,
  Unlink,
  Clock,
  Timer,
  Wrench,
  Building2,
  CheckCircle2,
  AlertCircle,
  Plus,
  ShieldCheck,
  RefreshCw,
  Layers,
  GitFork,
  Check
} from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { cn } from "@/lib/utils";

interface MachineBopModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: any | null;
  onSuccess?: () => void;
}

export function MachineBopModal({
  isOpen,
  onClose,
  machine,
  onSuccess
}: MachineBopModalProps) {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [availableBops, setAvailableBops] = useState<any[]>([]);

  // Form State for new link
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedBopId, setSelectedBopId] = useState<string>("");
  const [cycleTime, setCycleTime] = useState<number>(30);
  const [setupTime, setSetupTime] = useState<number>(10);
  const [teardownTime, setTeardownTime] = useState<number>(5);
  const [forceBypass, setForceBypass] = useState<boolean>(false);

  const loadAssignments = async () => {
    if (!machine?.id) return;
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/production/machines/${machine.id}/bop-assignments`);
      if (res.ok && res.data) {
        setAssignments(res.data.assignments || []);
        setActiveProjects(res.data.activeProjects || []);
        setAvailableBops(res.data.availableBops || []);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load machine BOP linkages", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && machine) {
      setSelectedProjectId("");
      setSelectedBopId("");
      setForceBypass(Boolean(machine.bypass_multi_station));
      loadAssignments();
    }
  }, [isOpen, machine]);

  if (!isOpen || !machine) return null;

  // Filter available BOPs by selected project if project is chosen
  const filteredAvailableBops = selectedProjectId
    ? availableBops.filter((b) => b.project_id === selectedProjectId)
    : availableBops;

  const handleLinkMachine = async () => {
    if (!selectedBopId) {
      showToast("Please select a target BOP process node", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/production/machines/${machine.id}/link-bop`, {
        method: "POST",
        body: JSON.stringify({
          bop_id: selectedBopId,
          cycle_time_minutes: cycleTime,
          setup_time_minutes: setupTime,
          teardown_time_minutes: teardownTime,
          force_bypass: forceBypass
        })
      });

      if (res.ok) {
        showToast(res.data?.message || `Machine ${machine.name} linked to BOP process`, "success");
        setSelectedBopId("");
        loadAssignments();
        if (onSuccess) onSuccess();
      } else {
        showToast(res.data?.error || "Failed to link machine to BOP", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error linking machine to BOP", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkMachine = async (bopId: string, processName: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/api/production/machines/${machine.id}/unlink-bop`, {
        method: "POST",
        body: JSON.stringify({ bop_id: bopId })
      });

      if (res.ok) {
        showToast(`Unlinked ${machine.name} from ${processName}`, "success");
        loadAssignments();
        if (onSuccess) onSuccess();
      } else {
        showToast(res.data?.error || "Failed to unlink machine", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error unlinking machine", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Warehouse Machine — BOP Integration"
      description={`Manage process routing & project bill-of-process linkages for ${machine.name}`}
      maxWidth="3xl"
    >
      <div className="p-6 space-y-6">
        {/* Machine Identity Header Banner */}
        <div className="p-4 rounded-2xl bg-stone-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-blue-300 px-2 py-0.5 rounded bg-blue-950 border border-blue-800">
                  {machine.item_code}
                </span>
                <span className="text-xs font-semibold text-stone-300">
                  {machine.machine_category || "GENERAL MACHINE"}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">{machine.name}</h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider",
                machine.machine_status === "ASSIGNED"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                  : machine.machine_status === "MAINTENANCE"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              )}
            >
              {machine.machine_status || machine.operational_status || "AVAILABLE"}
            </span>

            {machine.bypass_multi_station ? (
              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Multi-Station Bypass
              </span>
            ) : null}
          </div>
        </div>

        {/* Section 1: Active BOP Assignments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-stone-700 dark:text-stone-300 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-blue-600" />
              Active BOP Process Assignments ({assignments.length})
            </h4>
            <Button
              size="xs"
              variant="secondary"
              onClick={loadAssignments}
              disabled={isLoading}
              className="text-[11px] gap-1"
            >
              <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {assignments.length > 0 ? (
            <div className="divide-y divide-stone-200 dark:divide-stone-800 border border-stone-200 dark:border-stone-800 rounded-2xl overflow-hidden bg-white dark:bg-stone-900 shadow-2xs">
              {assignments.map((item) => (
                <div
                  key={item.bop_id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded border border-stone-200 dark:border-stone-700">
                        {item.spk_number || "SPK-PRJ"}
                      </span>
                      <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
                        {item.project_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400">
                      <GitFork className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-bold text-stone-900 dark:text-stone-200">
                        Step {item.step_sequence}: {item.process_name}
                      </span>
                      {item.work_center_name && (
                        <span className="text-stone-400">({item.work_center_name})</span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-stone-500 font-mono pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-stone-400" /> {item.cycle_time_minutes || 0} min/pc
                      </span>
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3 text-stone-400" /> Setup: {item.setup_time_minutes || 0}m
                      </span>
                      <span className="flex items-center gap-1">
                        <Wrench className="w-3 h-3 text-stone-400" /> Teardown: {item.teardown_time_minutes || 0}m
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                      {item.bop_status || "PENDING"}
                    </span>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => handleUnlinkMachine(item.bop_id, item.process_name)}
                      disabled={isSubmitting}
                      className="text-rose-600 hover:text-rose-700 border-rose-200 hover:bg-rose-50 text-[11px] gap-1"
                    >
                      <Unlink className="w-3 h-3" />
                      Unlink
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center rounded-2xl border border-dashed border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/30 space-y-2">
              <Workflow className="w-8 h-8 text-stone-300 mx-auto" />
              <p className="text-xs font-bold text-stone-600 dark:text-stone-400">
                No active BOP process steps linked to this machine
              </p>
              <p className="text-[11px] text-stone-400">
                You can assign this machine to an unassigned BOP process step in active projects below.
              </p>
            </div>
          )}
        </div>

        {/* Section 2: Link Machine to Active BOP Process */}
        <div className="p-5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/40 space-y-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 dark:text-stone-200 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-emerald-600" />
            Link Machine to Project BOP Process
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Filter by Project */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-stone-600 dark:text-stone-300 uppercase">
                Filter Active Project (Optional)
              </label>
              <Select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setSelectedBopId("");
                }}
                className="text-xs font-medium rounded-xl border-stone-200 dark:border-stone-700"
              >
                <option value="">-- All Manufacturing Projects --</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.spk_number || p.id}] {p.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Target BOP Process */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-stone-600 dark:text-stone-300 uppercase">
                Target BOP Process Step <span className="text-rose-500">*</span>
              </label>
              <Select
                value={selectedBopId}
                onChange={(e) => setSelectedBopId(e.target.value)}
                className="text-xs font-medium rounded-xl border-stone-200 dark:border-stone-700"
              >
                <option value="">-- Select Unassigned Process Node --</option>
                {filteredAvailableBops.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.project_name}] Step {b.step_sequence}: {b.process_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Timing Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                Cycle Time (min/pc)
              </label>
              <input
                type="number"
                min={1}
                value={cycleTime}
                onChange={(e) => setCycleTime(Math.max(1, Number(e.target.value)))}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
                <Timer className="w-3.5 h-3.5 text-stone-400" />
                Setup Time (min)
              </label>
              <input
                type="number"
                min={0}
                value={setupTime}
                onChange={(e) => setSetupTime(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase text-stone-500 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5 text-stone-400" />
                Teardown Time (min)
              </label>
              <input
                type="number"
                min={0}
                value={teardownTime}
                onChange={(e) => setTeardownTime(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-stone-300 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-200 dark:border-stone-800">
            <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-400 cursor-pointer">
              <input
                type="checkbox"
                checked={forceBypass}
                onChange={(e) => setForceBypass(e.target.checked)}
                className="rounded border-stone-300 accent-stone-900 w-4 h-4"
              />
              <span>Force multi-station bypass (allow concurrent multi-project assignment)</span>
            </label>

            <Button
              onClick={handleLinkMachine}
              disabled={isSubmitting || !selectedBopId}
              className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold gap-2 self-end sm:self-auto px-5 rounded-xl shadow-xs"
            >
              <Link2 className="w-4 h-4 text-emerald-400" />
              {isSubmitting ? "Linking..." : "Link Machine to BOP Process"}
            </Button>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex justify-end pt-2 border-t border-stone-200 dark:border-stone-800">
          <Button variant="secondary" onClick={onClose} className="rounded-xl text-xs font-bold">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
