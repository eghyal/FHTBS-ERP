import React, { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  Workflow,
  Network,
  Clock,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  SplitSquareHorizontal,
  Zap,
  SlidersHorizontal,
  Play,
  RefreshCw,
  ShieldCheck,
  FileCheck2,
  Flame,
  KeyRound,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { WORKFLOW_SIGNER_OPTIONS } from "@/constants/rbac";
import { hasGodMode } from "@/utils/pbac";
import {
  Button,
  Card,
  CardHeader,
  Badge,
  StatCard,
  Tabs,
  Modal,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Select,
  Input,
  EmptyState,
} from "@/components/ui";

import WorkflowVisualizer from "@/components/erp/WorkflowVisualizer";

const DOCUMENT_TYPES = [
  "Purchase Request",
  "Purchase Order",
  "Quotation",
  "General Request",
  "Workspace Document",
];

export default function WorkflowSettings() {
  const [activeTab, setActiveTab] = useState<
    "QUEUE" | "MATRIX" | "SLA" | "HEIJUNKA" | "AUDIT" | "VISUAL"
  >("QUEUE");
  const { showToast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [evaluatingSla, setEvaluatingSla] = useState(false);

  const [activeApprovals, setActiveApprovals] = useState<any[]>([]);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [slas, setSlas] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [heijunkaThreshold, setHeijunkaThreshold] = useState<string>("5000000");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("ALL");

  // Direct Step Approval Modal state
  const [approvalModal, setApprovalModal] = useState<{
    isOpen: boolean;
    item: any | null;
    note: string;
    pin: string;
    fastTrackAll: boolean;
    submitting: boolean;
  }>({
    isOpen: false,
    item: null,
    note: "",
    pin: "",
    fastTrackAll: false,
    submitting: false,
  });

  const [confirmModalOptions, setConfirmModalOptions] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const isExecutiveOrAdmin =
    hasGodMode(user) ||
    ["FC", "DIRECTOR", "BOD", "ADMIN", "SUPERADMIN"].includes(user?.role || "");

  const fetchActiveQueue = useCallback(async () => {
    try {
      const res = await apiFetch(
        "/api/workflow/active-approvals",
        {},
        user?.username,
      );
      if (res.ok) {
        setActiveApprovals(res.data?.data || []);
      }
    } catch (e) {
      console.error("Failed to fetch active workflow approvals:", e);
    }
  }, [user?.username]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await apiFetch(
        "/api/workflow/audit_logs",
        {},
        user?.username,
      );
      if (res.ok) setAuditLogs(res.data || []);
    } catch (e) {
      console.error(e);
    }
  }, [user?.username]);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const [mRes, sRes, hRes] = await Promise.all([
        apiFetch("/api/workflow/matrices", {}, user?.username),
        apiFetch("/api/workflow/slas", {}, user?.username),
        apiFetch("/api/lean/heijunka/threshold", {}, user?.username),
      ]);

      if (mRes.ok) setMatrices(mRes.data || []);
      if (sRes.ok) setSlas(sRes.data || []);
      if (hRes.ok && hRes.data?.threshold !== undefined) {
        setHeijunkaThreshold(hRes.data.threshold.toString());
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to load workflow configuration", "error");
    } finally {
      setLoading(false);
    }
  }, [user?.username, showToast]);

  useEffect(() => {
    fetchActiveQueue();
    fetchRules();
    fetchAudit();
  }, [fetchActiveQueue, fetchRules, fetchAudit]);

  const handleRunSlaSweep = async () => {
    try {
      setEvaluatingSla(true);
      const res = await apiFetch(
        "/api/workflow/evaluate-slas",
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast(
          res.data?.message || "SLA evaluation & auto-escalation completed.",
          res.data?.newlyEscalatedCount > 0 ? "warning" : "success",
        );
        await fetchActiveQueue();
        await fetchAudit();
      } else {
        showToast(res.error || "Failed to evaluate SLAs", "error");
      }
    } catch (err) {
      showToast("An error occurred while evaluating SLAs", "error");
    } finally {
      setEvaluatingSla(false);
    }
  };

  const handleConfirmStepApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvalModal.item) return;

    try {
      setApprovalModal((prev) => ({ ...prev, submitting: true }));
      const res = await apiFetch(
        "/api/workflow/approve-step",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            document_type: approvalModal.item.document_type,
            document_id: approvalModal.item.document_id,
            note: approvalModal.note.trim() || undefined,
            pin: approvalModal.pin.trim() || undefined,
            fast_track_all: approvalModal.fastTrackAll,
          }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          res.data?.message || "Authorization step approved successfully!",
          "success",
        );
        setApprovalModal({
          isOpen: false,
          item: null,
          note: "",
          pin: "",
          fastTrackAll: false,
          submitting: false,
        });
        await fetchActiveQueue();
        await fetchAudit();
      } else {
        showToast(res.error || "Failed to approve document step", "error");
        setApprovalModal((prev) => ({ ...prev, submitting: false }));
      }
    } catch (err) {
      showToast("Failed to process document approval", "error");
      setApprovalModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const addMatrix = () => {
    setMatrices([
      {
        id: `MATRIX-${Date.now().toString().slice(-6)}`,
        document_type: "Purchase Order",
        min_amount: 0,
        max_amount: 25000000,
        roles: ["SUPERVISOR", "PURCHASING_MANAGER"],
        is_parallel: 0,
        is_new: true,
      },
      ...matrices,
    ]);
  };

  const removeMatrix = async (id: string, isNew?: boolean) => {
    setConfirmModalOptions({
      isOpen: true,
      title: "Delete Matrix Rule",
      message: "Are you sure you want to delete this Dynamic Approval Matrix rule?",
      onConfirm: async () => {
        setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }));
        if (isNew) {
          setMatrices(matrices.filter((m) => m.id !== id));
          return;
        }
        try {
          const res = await apiFetch(
            `/api/workflow/matrices/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Matrix rule deleted successfully", "success");
            fetchRules();
            fetchAudit();
          }
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const addSla = () => {
    setSlas([
      {
        id: `SLA-${Date.now().toString().slice(-6)}`,
        document_type: "Purchase Order",
        step: "SUPERVISOR",
        sla_hours: 12,
        escalate_to: "PURCHASING_MANAGER",
        is_new: true,
      },
      ...slas,
    ]);
  };

  const removeSla = async (id: string, isNew?: boolean) => {
    setConfirmModalOptions({
      isOpen: true,
      title: "Delete SLA Rule",
      message: "Are you sure you want to delete this SLA & Escalation rule?",
      onConfirm: async () => {
        setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }));
        if (isNew) {
          setSlas(slas.filter((s) => s.id !== id));
          return;
        }
        try {
          const res = await apiFetch(
            `/api/workflow/slas/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("SLA rule deleted successfully", "success");
            fetchRules();
            fetchAudit();
          }
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const saveSettings = async () => {
    if (!isExecutiveOrAdmin) {
      showToast("Only Executive / FC / Admin accounts can modify global matrix rules.", "error");
      return;
    }

    for (const m of matrices) {
      const res = await apiFetch(
        "/api/workflow/matrices",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(m),
        },
        user?.username,
      );
      if (!res.ok) {
        showToast("Failed to save some matrix rules", "error");
        return;
      }
    }

    for (const s of slas) {
      const res = await apiFetch(
        "/api/workflow/slas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        },
        user?.username,
      );
      if (!res.ok) {
        showToast("Failed to save SLA rules", "error");
        return;
      }
    }

    try {
      const parsedThreshold = parseInt(heijunkaThreshold.replace(/\D/g, ""), 10) || 0;
      await apiFetch(
        "/api/lean/heijunka/threshold",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threshold: parsedThreshold }),
        },
        user?.username,
      );
    } catch (e) {
      console.error("Failed to save heijunka threshold", e);
    }

    showToast(
      "Dynamic Approval Matrix & SLA Auto-Escalation configuration updated successfully.",
      "success",
    );
    fetchRules();
    fetchActiveQueue();
    fetchAudit();
  };

  const filteredQueue = activeApprovals.filter(
    (item) => docTypeFilter === "ALL" || item.document_type === docTypeFilter,
  );

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Workflow & Automation Engine"
        subtitle="Approval matrix, SLA monitor, and auto-escalation"
        icon={<Workflow className="w-6 h-6" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handleRunSlaSweep}
              disabled={evaluatingSla}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", evaluatingSla && "animate-spin")} />
              <span>Evaluate SLA & Auto-Escalate</span>
            </Button>
            {isExecutiveOrAdmin && (
              <Button
                variant="primary"
                onClick={saveSettings}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Engine Configuration</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        activeId={activeTab}
        onChange={setActiveTab}
        mobileColumns={3}
        items={[
          {
            id: "QUEUE",
            label: "Live Approval & SLA Queue",
            icon: <Play className="w-3.5 h-3.5" />,
            badge: activeApprovals.length,
          },
          {
            id: "MATRIX",
            label: "Dynamic Approval Matrix",
            icon: <Network className="w-3.5 h-3.5" />,
            badge: matrices.length,
          },
          {
            id: "SLA",
            label: "SLA & Escalation Rules",
            icon: <Clock className="w-3.5 h-3.5" />,
            badge: slas.length,
          },
          {
            id: "HEIJUNKA",
            label: "Heijunka Fast-Track",
            icon: <Zap className="w-3.5 h-3.5" />,
          },
          {
            id: "VISUAL",
            label: "BPMN Canvas",
            icon: <Network className="w-3.5 h-3.5" />,
          },
          {
            id: "AUDIT",
            label: "Audit Trail",
            icon: <ShieldAlert className="w-3.5 h-3.5" />,
            badge: auditLogs.length,
          },
        ]}
      />

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.15 }}
      >
        {activeTab === "QUEUE" ? (
          <div className="space-y-6">
            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Multi-Tier Authorization Queue & Real-Time SLA Monitoring
                  </h3>
                  <p className="text-xs text-stone-500">
                    Documents automatically route through Supervisor → Manager → FC stages based on transaction value and SLA rules.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={docTypeFilter}
                    onChange={(e) => setDocTypeFilter(e.target.value)}
                    className="py-1.5 text-xs min-w-[180px]"
                  >
                    <option value="ALL">All Document Types</option>
                    {DOCUMENT_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {dt}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document & Department</TableHead>
                    <TableHead>Transaction Value</TableHead>
                    <TableHead>Multi-Tier Matrix Stages (Multi-Step)</TableHead>
                    <TableHead>SLA & Escalation Status</TableHead>
                    <TableHead className="text-right">Authorization Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((item) => {
                    const isBreached = item.sla_status === "BREACHED";
                    const isWarning = item.sla_status === "WARNING";
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-black text-stone-900">
                                {item.document_number}
                              </span>
                              <Badge variant="neutral" size="sm">
                                {item.document_type}
                              </Badge>
                              <Badge variant="default" size="sm">
                                {item.department}
                              </Badge>
                            </div>
                            <p className="text-xs text-stone-600 line-clamp-1">
                              {item.document_title}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="font-mono text-xs font-bold text-stone-900 tabular-nums whitespace-nowrap">
                          {item.amount > 0
                            ? `Rp ${Number(item.amount).toLocaleString("en-US")}`
                            : "Non-Financial"}
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(item.required_roles || []).map((role: string, idx: number) => {
                              const isDone = idx < item.current_step_index;
                              const isCurrent = idx === item.current_step_index;
                              return (
                                <React.Fragment key={`${item.id}-${role}-${idx}`}>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border flex items-center gap-1 whitespace-nowrap",
                                      isDone
                                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                        : isCurrent
                                          ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                                          : "bg-stone-50 text-stone-400 border-stone-200",
                                    )}
                                  >
                                    {isDone && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                    <span>
                                      T{idx + 1}: {role}
                                    </span>
                                  </span>
                                  {idx < (item.required_roles || []).length - 1 && (
                                    <ArrowRight className="w-3 h-3 text-stone-300 shrink-0" />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                          {item.approved_steps?.length > 0 && (
                            <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                              Last approved by:{" "}
                              {item.approved_steps[item.approved_steps.length - 1]?.approved_by_name} (
                              {item.approved_steps[item.approved_steps.length - 1]?.required_role})
                            </p>
                          )}
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1.5 min-w-[180px]">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <Badge
                                variant={
                                  isBreached
                                    ? "danger"
                                    : isWarning
                                      ? "warning"
                                      : "success"
                                }
                                size="sm"
                              >
                                {isBreached
                                  ? "SLA BREACHED"
                                  : isWarning
                                    ? "NEAR SLA"
                                    : "ON TRACK"}
                              </Badge>
                              <span className="font-mono text-[10px] font-bold text-stone-600 tabular-nums">
                                {item.elapsed_hours}h / {item.sla_hours}h ({item.sla_percentage}%)
                              </span>
                            </div>

                            <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isBreached
                                    ? "bg-rose-600"
                                    : isWarning
                                      ? "bg-amber-500"
                                      : "bg-emerald-500",
                                )}
                                style={{
                                  width: `${Math.min(100, Math.max(6, item.sla_percentage))}%`,
                                }}
                              />
                            </div>

                            {item.escalated && item.escalated_to && (
                              <div className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>Auto-Escalated to: {item.escalated_to}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-right">
                          {item.can_current_user_approve ? (
                            <Button
                              size="xs"
                              variant="primary"
                              onClick={() =>
                                setApprovalModal({
                                  isOpen: true,
                                  item,
                                  note: "",
                                  pin: "",
                                  fastTrackAll: false,
                                  submitting: false,
                                })
                              }
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve Step ({item.current_step_role})</span>
                            </Button>
                          ) : (
                            <span className="text-[11px] font-mono text-stone-400">
                              Awaiting {item.current_step_role}
                              {item.escalated_to ? ` / ${item.escalated_to}` : ""}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredQueue.length === 0 && (
                    <TableEmpty
                      colSpan={5}
                      message="No documents are currently awaiting approval in the active queue."
                    />
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        ) : activeTab === "MATRIX" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Value-Based Hierarchy Rules"
                subtitle="Configure transaction value thresholds (Min/Max IDR) and required signer sequence"
                icon={<SlidersHorizontal className="w-4 h-4" />}
                actions={
                  isExecutiveOrAdmin ? (
                    <Button variant="secondary" size="xs" onClick={addMatrix}>
                      <Plus className="w-3.5 h-3.5" /> Add Matrix Rule
                    </Button>
                  ) : undefined
                }
              />

              <div className="space-y-4">
                {matrices.map((matrix, idx) => (
                  <div
                    key={matrix.id}
                    className="grid grid-cols-12 gap-3 items-center bg-stone-50 border border-stone-200/70 p-4 rounded-xl"
                  >
                    <div className="col-span-12 md:col-span-3">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                        ERP Document Type
                      </label>
                      <Select
                        value={matrix.document_type}
                        disabled={!isExecutiveOrAdmin}
                        onChange={(e) => {
                          const newM = [...matrices];
                          newM[idx] = {
                            ...newM[idx],
                            document_type: e.target.value,
                          };
                          setMatrices(newM);
                        }}
                        className="py-1 text-xs"
                      >
                        {DOCUMENT_TYPES.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </Select>
                    </div>

                    <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                          Min Value (Rp)
                        </label>
                        <Input
                          type="number"
                          disabled={!isExecutiveOrAdmin}
                          value={matrix.min_amount}
                          onChange={(e) => {
                            const newM = [...matrices];
                            newM[idx] = {
                              ...newM[idx],
                              min_amount: parseFloat(e.target.value) || 0,
                            };
                            setMatrices(newM);
                          }}
                          className="py-1 text-xs font-mono tabular-nums"
                        />
                      </div>
                      <span className="mt-5 text-stone-400 font-bold">-</span>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 mb-1 block">
                          Max Value (Rp)
                        </label>
                        <Input
                          type="text"
                          disabled={!isExecutiveOrAdmin}
                          value={
                            matrix.max_amount === null || matrix.max_amount === undefined
                              ? "Unlimited"
                              : matrix.max_amount
                          }
                          onChange={(e) => {
                            const newM = [...matrices];
                            newM[idx] = {
                              ...newM[idx],
                              max_amount:
                                e.target.value === "Unlimited" ||
                                e.target.value === ""
                                  ? null
                                  : parseFloat(e.target.value),
                            };
                            setMatrices(newM);
                          }}
                          className="py-1 text-xs font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] uppercase font-bold tracking-wider text-stone-500 block">
                          Multi-Tier Signer Sequence
                        </label>
                        <label className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!isExecutiveOrAdmin}
                            checked={matrix.is_parallel === 1}
                            onChange={(e) => {
                              const newM = [...matrices];
                              newM[idx] = {
                                ...newM[idx],
                                is_parallel: e.target.checked ? 1 : 0,
                              };
                              setMatrices(newM);
                            }}
                            className="rounded text-emerald-600"
                          />
                          Parallel
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-1.5 items-center">
                        {(matrix.roles || []).map(
                          (role: string, rIdx: number) => (
                            <React.Fragment key={`${role}-${rIdx}`}>
                              <span className="text-[11px] font-bold bg-white text-stone-800 border border-stone-200 px-2 py-1 rounded-md whitespace-nowrap flex items-center gap-1.5 shadow-2xs">
                                {role}
                                {isExecutiveOrAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newM = [...matrices];
                                      const newRoles = [...newM[idx].roles];
                                      newRoles.splice(rIdx, 1);
                                      newM[idx] = {
                                        ...newM[idx],
                                        roles: newRoles,
                                      };
                                      setMatrices(newM);
                                    }}
                                    className="text-rose-500 hover:text-rose-700 p-0.5 rounded hover:bg-rose-50 cursor-pointer transition-colors"
                                    title="Remove Role"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-600" />
                                  </button>
                                )}
                              </span>
                              {rIdx !== (matrix.roles || []).length - 1 &&
                                (matrix.is_parallel === 1 ? (
                                  <SplitSquareHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <ArrowRight className="w-3 h-3 text-stone-400" />
                                ))}
                            </React.Fragment>
                          ),
                        )}
                        {isExecutiveOrAdmin && (
                          <div className="w-36">
                            <Select
                              className="h-7 py-0 text-xs font-bold"
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  const newM = [...matrices];
                                  newM[idx] = {
                                    ...newM[idx],
                                    roles: [
                                      ...(newM[idx].roles || []),
                                      e.target.value,
                                    ],
                                  };
                                  setMatrices(newM);
                                  e.target.value = "";
                                }
                              }}
                            >
                              <option value="">+ Role</option>
                              {WORKFLOW_SIGNER_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-1 flex justify-end">
                      {isExecutiveOrAdmin && (
                        <Button
                          size="icon-sm"
                          variant="danger_soft"
                          onClick={() => removeMatrix(matrix.id, matrix.is_new)}
                          title="Remove Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}

                {matrices.length === 0 && (
                  <EmptyState
                    icon={<ShieldAlert className="w-6 h-6" />}
                    title="No matrix rules configured"
                    description="Add a Dynamic Approval Matrix rule to govern multi-tier authorization."
                    action={
                      isExecutiveOrAdmin ? (
                        <Button size="xs" variant="primary" onClick={addMatrix}>
                          <Plus className="w-3.5 h-3.5" /> Add First Rule
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </Card>
          </div>
        ) : activeTab === "HEIJUNKA" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Threshold Configuration"
                subtitle="Fast-Track nominal value threshold (IDR)"
                icon={<Zap className="w-4 h-4" />}
              />
              <div className="max-w-md space-y-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-stone-600 block mb-1.5">
                    Fast-Track Approval Limit (IDR)
                  </label>
                  <Input
                    type="text"
                    disabled={!isExecutiveOrAdmin}
                    value={parseInt(heijunkaThreshold.replace(/\D/g, "") || "0", 10).toLocaleString("en-US")}
                    onChange={(e) => setHeijunkaThreshold(e.target.value)}
                    icon={<span className="text-xs font-bold text-stone-500">Rp</span>}
                    className="font-mono text-base font-bold tabular-nums"
                  />
                </div>

                <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-stone-900">Current Active Limit</p>
                    <p className="text-[11px] text-stone-500">Automated fast-track approval below this value</p>
                  </div>
                  <Badge variant="warning" className="tabular-nums font-mono">
                    ≤ Rp {parseInt(heijunkaThreshold.replace(/\D/g, "") || "0", 10).toLocaleString("en-US")}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>
        ) : activeTab === "SLA" ? (
          <div className="space-y-6">
            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Auto-Escalation Timeouts
                  </h3>
                  <p className="text-xs text-stone-500">
                    Configure maximum SLA hours per document stage and automatic escalation target
                  </p>
                </div>
                {isExecutiveOrAdmin && (
                  <Button size="xs" variant="secondary" onClick={addSla}>
                    <Plus className="w-3.5 h-3.5" /> Add SLA Rule
                  </Button>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Type</TableHead>
                    <TableHead>Target Stage (Step)</TableHead>
                    <TableHead>Time Limit (SLA)</TableHead>
                    <TableHead>Auto-Escalate To</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slas.map((sla, idx) => (
                    <TableRow key={sla.id}>
                      <TableCell>
                        <Select
                          className="py-1 text-xs"
                          disabled={!isExecutiveOrAdmin}
                          value={sla.document_type}
                          onChange={(e) => {
                            const newSlas = [...slas];
                            newSlas[idx] = {
                              ...newSlas[idx],
                              document_type: e.target.value,
                            };
                            setSlas(newSlas);
                          }}
                        >
                          {DOCUMENT_TYPES.map((dt) => (
                            <option key={dt} value={dt}>
                              {dt}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          className="py-1 text-xs"
                          disabled={!isExecutiveOrAdmin}
                          value={sla.step}
                          onChange={(e) => {
                            const newSlas = [...slas];
                            newSlas[idx] = {
                              ...newSlas[idx],
                              step: e.target.value,
                            };
                            setSlas(newSlas);
                          }}
                        >
                          <option value={sla.step}>{sla.step}</option>
                          {WORKFLOW_SIGNER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 max-w-[130px]">
                          <Input
                            type="number"
                            disabled={!isExecutiveOrAdmin}
                            className="py-1 text-xs font-mono tabular-nums text-right"
                            value={sla.sla_hours}
                            onChange={(e) => {
                              const newSlas = [...slas];
                              newSlas[idx] = {
                                ...newSlas[idx],
                                sla_hours: parseFloat(e.target.value) || 1,
                              };
                              setSlas(newSlas);
                            }}
                          />
                          <span className="text-xs text-stone-500 font-bold">hrs</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 max-w-[220px]">
                          <ArrowRight className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <Select
                            className="py-1 text-xs font-bold text-rose-700"
                            disabled={!isExecutiveOrAdmin}
                            value={sla.escalate_to}
                            onChange={(e) => {
                              const newSlas = [...slas];
                              newSlas[idx] = {
                                ...newSlas[idx],
                                escalate_to: e.target.value,
                              };
                              setSlas(newSlas);
                            }}
                          >
                            <option value={sla.escalate_to}>{sla.escalate_to}</option>
                            {WORKFLOW_SIGNER_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isExecutiveOrAdmin && (
                          <Button
                            size="icon-sm"
                            variant="danger_soft"
                            onClick={() => removeSla(sla.id, sla.is_new)}
                            title="Remove SLA Rule"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {slas.length === 0 && (
                    <TableEmpty colSpan={5} message="No SLA & Auto-Escalation rules configured yet." />
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        ) : activeTab === "VISUAL" ? (
          <Card>
            <CardHeader
              title="BPMN Process Visualizer"
              subtitle="Live rendered directed acyclic graph (DAG) of the workflow pipeline"
              icon={<Network className="w-4 h-4" />}
            />
            <WorkflowVisualizer matrices={matrices} />
          </Card>
        ) : (
          <Card padding="none">
            <div className="p-4 sm:p-5 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">
                Workflow & SLA Escalation Audit Trail
              </h3>
              <p className="text-xs text-stone-500">
                Immutable audit log of all multi-step approvals, matrix changes, and automatic SLA escalations
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target Document</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs text-stone-500 tabular-nums whitespace-nowrap">
                      {new Date(
                        log.created_at?.endsWith("Z") ? log.created_at : `${log.created_at}Z`,
                      ).toLocaleString("en-US")}
                    </TableCell>
                    <TableCell className="font-bold text-stone-800 text-xs">
                      {log.username}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action?.includes("APPROVED") || log.action === "CREATE"
                            ? "success"
                            : log.action?.includes("ESCALATION")
                              ? "danger"
                              : "warning"
                        }
                        size="sm"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-stone-700 font-bold">
                      {log.target_type} · {log.target_id}
                    </TableCell>
                    <TableCell className="text-xs text-stone-500 max-w-md truncate font-mono">
                      {log.changes}
                    </TableCell>
                  </TableRow>
                ))}
                {auditLogs.length === 0 && (
                  <TableEmpty colSpan={5} message="No workflow audit logs recorded yet." />
                )}
              </TableBody>
            </Table>
          </Card>
        )}
      </motion.div>

      {/* Step Approval Modal */}
      <Modal
        isOpen={approvalModal.isOpen && !!approvalModal.item}
        onClose={() =>
          setApprovalModal((prev) => ({ ...prev, isOpen: false }))
        }
        title="Authorize Document Step"
        description={
          approvalModal.item
            ? `${approvalModal.item.document_number} · ${approvalModal.item.document_type}`
            : undefined
        }
        maxWidth="md"
      >
        {approvalModal.item && (
          <form onSubmit={handleConfirmStepApproval} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Current Stage:</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  Tier {approvalModal.item.current_step_index + 1} (
                  {approvalModal.item.current_step_role})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Transaction Value:</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  Rp{" "}
                  {Number(approvalModal.item.amount || 0).toLocaleString(
                    "en-US",
                  )}
                </span>
              </div>
              {approvalModal.item.escalated && (
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>SLA Escalation Status:</span>
                  <span>Escalated to {approvalModal.item.escalated_to}</span>
                </div>
              )}
            </div>

            <Input
              label="Approval Note (Optional)"
              type="text"
              placeholder="Example: Specifications & budget verified, proceed..."
              value={approvalModal.note}
              onChange={(e) =>
                setApprovalModal((prev) => ({ ...prev, note: e.target.value }))
              }
            />

            <Input
              label="6-Digit Daily Authorization PIN (Optional)"
              type="text"
              maxLength={6}
              icon={<KeyRound className="w-3.5 h-3.5 text-stone-400" />}
              placeholder="Enter 6-digit Daily Auth Key if required"
              value={approvalModal.pin}
              onChange={(e) =>
                setApprovalModal((prev) => ({ ...prev, pin: e.target.value }))
              }
              className="font-mono tracking-widest tabular-nums"
            />

            {isExecutiveOrAdmin &&
              approvalModal.item.current_step_index <
                approvalModal.item.required_roles.length - 1 && (
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs font-bold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={approvalModal.fastTrackAll}
                    onChange={(e) =>
                      setApprovalModal((prev) => ({
                        ...prev,
                        fastTrackAll: e.target.checked,
                      }))
                    }
                    className="rounded text-amber-600"
                  />
                  <span>
                    Executive Override: Complete all remaining matrix stages at once
                  </span>
                </label>
              )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setApprovalModal((prev) => ({ ...prev, isOpen: false }))
                }
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={approvalModal.submitting}
                disabled={approvalModal.submitting}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {approvalModal.submitting
                    ? "Processing..."
                    : "Confirm Authorization"}
                </span>
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmModalOptions.isOpen}
        title={confirmModalOptions.title}
        message={confirmModalOptions.message}
        onConfirm={confirmModalOptions.onConfirm}
        onCancel={() =>
          setConfirmModalOptions((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}
