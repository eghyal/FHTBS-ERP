import { apiFetch } from "@/utils/api";
import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  Button,
  Card,
  CardHeader,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
  Select,
  Input,
  StatCard,
  Tabs,
  EmptyState,
} from "@/components/ui";
import {
  Shield,
  Briefcase,
  UserCheck,
  Users,
  Trash2,
  Edit2,
  Save,
  X,
  ShieldCheck,
  AlertTriangle,
  Search,
  Clock,
  RotateCw,
  KeyRound,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  hasGodMode,
  hasPermission,
  Action,
  ACTIONS_REQUIRING_MANAGER,
  ACTIONS_REQUIRING_SUPERVISOR_OR_MANAGER,
  getEffectiveActionsForRoleAndLevel,
} from "@/utils/pbac";
import {
  ERP_DEPARTMENT_OPTIONS,
  normalizeDepartmentToRole,
} from "@/constants/rbac";

interface Account {
  id: string;
  username: string;
  name: string;
  role: string;
  level: string;
  status: string;
  created_at: string;
}

const ALL_ERP_ROLES = ERP_DEPARTMENT_OPTIONS.map((d) => ({
  value: d.value,
  label: `${d.value} — ${d.label}`,
}));

export default function ManageAccounts() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [pendingAccounts, setPendingAccounts] = useState<Account[]>([]);
  const [activeAccounts, setActiveAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<string>("");
  const [editLevel, setEditLevel] = useState<string>("STAFF");
  const [editPassword, setEditPassword] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"directory" | "pending" | "pbac">(
    "directory",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
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

  const canManageAccounts =
    hasGodMode(user) || hasPermission(user, Action.MANAGE_ACCOUNTS);

  useEffect(() => {
    if (!canManageAccounts) {
      navigate("/erp");
      return;
    }
    fetchData();
  }, [user, canManageAccounts, navigate]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [pendingRes, activeRes] = await Promise.all([
        apiFetch("/api/auth/pending", {}, user?.username),
        apiFetch("/api/users/all", {}, user?.username),
      ]);

      if (pendingRes.ok) setPendingAccounts(pendingRes.data || []);
      if (activeRes.ok) setActiveAccounts(activeRes.data || []);
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch accounts", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (id: string, action: "approve" | "reject") => {
    try {
      const endpoint =
        action === "approve" ? "/api/auth/approve" : "/api/auth/reject";
      const res = await apiFetch(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({ id }),
        },
        user?.username,
      );

      if (res.ok) {
        showToast(
          `Account ${action === "approve" ? "approved" : "rejected"} successfully`,
          "success",
        );
        fetchData();
      } else {
        showToast(res.error || `Failed to ${action} account`, "error");
      }
    } catch (err) {
      console.error(err);
      showToast(`Error ${action}ing account`, "error");
    }
  };

  const startEdit = (acc: Account) => {
    setEditingId(acc.id);
    setEditRole(normalizeDepartmentToRole(acc.role));
    setEditLevel(acc.level || "STAFF");
    setEditPassword("");
  };

  const saveEdit = async (id: string) => {
    try {
      const res = await apiFetch(
        `/api/users/${id}/role`,
        {
          method: "PUT",
          body: JSON.stringify({
            role: editRole,
            level: editLevel,
            newPassword: editPassword.trim() || undefined,
          }),
        },
        user?.username,
      );
      if (res.ok) {
        showToast(
          editPassword.trim()
            ? "Role, Level & Bcrypt-12 Passcode updated successfully"
            : "Role & Level updated successfully",
          "success",
        );
        setEditingId(null);
        setEditPassword("");
        fetchData();
      } else {
        showToast(res.error || "Failed to update credentials", "error");
      }
    } catch (_e) {
      showToast("Error updating credentials", "error");
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Account",
      message:
        "Are you sure you want to delete this account? This action cannot be undone.",
      onConfirm: async () => {
        try {
          const res = await apiFetch(
            `/api/users/${id}`,
            { method: "DELETE" },
            user?.username,
          );
          if (res.ok) {
            showToast("Account deleted successfully", "success");
            fetchData();
          } else {
            showToast(res.error || "Failed to delete account", "error");
          }
        } catch (_e) {
          showToast("Error deleting account", "error");
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const filteredActiveAccounts = useMemo(() => {
    return activeAccounts.filter((acc) => {
      if (
        roleFilter !== "ALL" &&
        normalizeDepartmentToRole(acc.role) !== roleFilter
      )
        return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          acc.name?.toLowerCase().includes(q) ||
          acc.username?.toLowerCase().includes(q) ||
          acc.role?.toLowerCase().includes(q) ||
          acc.level?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [activeAccounts, roleFilter, searchQuery]);

  const stats = useMemo(() => {
    const managersAndSupervisors = activeAccounts.filter(
      (a) => a.level === "MANAGER" || a.level === "SUPERVISOR",
    ).length;
    const fcCount = activeAccounts.filter((a) => a.role === "FC").length;
    return {
      activeCount: activeAccounts.length,
      pendingCount: pendingAccounts.length,
      managersAndSupervisors,
      fcCount,
    };
  }, [activeAccounts, pendingAccounts]);

  if (!canManageAccounts) return null;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Access Control & PBAC Directory"
        subtitle="User accounts, roles, and access permissions"
        icon={<ShieldCheck className="w-5 h-5" />}
        actions={
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={fetchData}
            disabled={isLoading}
            title="Refresh Directory"
            aria-label="Refresh Directory"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      {/* Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          activeId={activeTab}
          onChange={setActiveTab}
          mobileColumns={3}
          items={[
            {
              id: "directory",
              label: "Active Directory",
              icon: <UserCheck className="w-3.5 h-3.5" />,
              badge: stats.activeCount,
            },
            {
              id: "pending",
              label: "Pending Approvals",
              icon: <Shield className="w-3.5 h-3.5" />,
              badge: stats.pendingCount,
            },
            {
              id: "pbac",
              label: "PBAC Policy Matrix",
              icon: <KeyRound className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>

      {isLoading ? (
        <Loader text="Loading accounts directory..." className="py-20" />
      ) : (
        <div className="space-y-6">
          {/* Pending Approvals View */}
          {(activeTab === "pending" ||
            (activeTab === "directory" && pendingAccounts.length > 0)) && (
            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-200/80 flex items-center justify-between gap-3">
                <CardHeader
                  title="Pending Account Registrations"
                  subtitle="Review and authorize new employee access requests"
                  icon={<Shield className="w-4 h-4" />}
                  className="mb-0"
                />
                <Badge
                  variant={pendingAccounts.length > 0 ? "warning" : "neutral"}
                  dot
                >
                  {pendingAccounts.length} Pending
                </Badge>
              </div>

              {pendingAccounts.length === 0 ? (
                <EmptyState
                  icon={<Shield className="w-6 h-6" />}
                  title="No pending requests"
                  description="All registration requests have been reviewed and processed."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Applicant Details</TableHead>
                      <TableHead>Requested Role & Tier</TableHead>
                      <TableHead className="text-center">Registered Date</TableHead>
                      <TableHead className="text-right">Authorization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-600 shrink-0">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-stone-900 text-xs sm:text-sm truncate">
                                {account.name}
                              </div>
                              <div className="text-[11px] text-stone-500 font-mono truncate">
                                @{account.username}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant="neutral">{account.role}</Badge>
                            {account.role !== "FC" && (
                              <Badge variant="outline" size="sm">
                                {account.level || "STAFF"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono text-stone-500 tabular-nums">
                          {new Date(account.created_at).toLocaleDateString("en-US")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="xs"
                              variant="danger_soft"
                              onClick={() => handleAction(account.id, "reject")}
                            >
                              Reject
                            </Button>
                            <Button
                              size="xs"
                              variant="success_soft"
                              onClick={() => handleAction(account.id, "approve")}
                            >
                              Approve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Active Directory View */}
          {activeTab === "directory" && (
            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <CardHeader
                  title="Active Personnel Directory"
                  subtitle="Configured personnel with authenticated system access"
                  icon={<UserCheck className="w-4 h-4" />}
                  className="mb-0"
                />
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
                  <div className="w-full sm:w-64">
                    <Input
                      type="text"
                      placeholder="Search name, @username, role..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      icon={<Search className="w-3.5 h-3.5" />}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      icon={<Briefcase className="w-3.5 h-3.5" />}
                    >
                      <option value="ALL">All Departments ({activeAccounts.length})</option>
                      {ALL_ERP_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.value}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Personnel Details</TableHead>
                    <TableHead>Department & Authority Level</TableHead>
                    <TableHead className="text-center">Account Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredActiveAccounts.length === 0 ? (
                    <TableEmpty
                      colSpan={4}
                      message="No active personnel found matching your filter criteria."
                    />
                  ) : (
                    filteredActiveAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-stone-100 border border-stone-200/80 flex items-center justify-center text-stone-600 shrink-0">
                              <UserCheck className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-stone-900 text-xs sm:text-sm truncate">
                                {account.name}
                              </div>
                              <div className="text-[11px] text-stone-500 font-mono truncate">
                                @{account.username}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {editingId === account.id ? (
                            <div className="space-y-2.5 max-w-md py-1">
                              <Select
                                value={editRole}
                                onChange={(e) => {
                                  const r = e.target.value;
                                  setEditRole(r);
                                  if (r === "FC") {
                                    setEditLevel("MANAGER");
                                  }
                                }}
                                icon={<Briefcase className="w-3.5 h-3.5" />}
                                options={ALL_ERP_ROLES}
                              />

                              {editRole !== "FC" && (
                                <Select
                                  value={editLevel}
                                  onChange={(e) => setEditLevel(e.target.value)}
                                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                                  options={[
                                    {
                                      value: "STAFF",
                                      label: "Staff (Operational & Draft)",
                                    },
                                    {
                                      value: "SUPERVISOR",
                                      label:
                                        "Supervisor (Full Operational & Tier-1 Approval)",
                                    },
                                    {
                                      value: "MANAGER",
                                      label:
                                        "Manager (Full Department Approval)",
                                    },
                                  ]}
                                />
                              )}

                              <Input
                                type="password"
                                placeholder="New Passcode (Optional · Bcrypt-12 Hash)"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                icon={<KeyRound className="w-3.5 h-3.5" />}
                              />

                              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80">
                                <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                  <span>PBAC Policy Preview</span>
                                  {editLevel === "MANAGER" && editRole !== "FC" && (
                                    <Badge variant="success" size="sm">
                                      Manager Authority
                                    </Badge>
                                  )}
                                  {editLevel === "SUPERVISOR" && editRole !== "FC" && (
                                    <Badge variant="warning" size="sm">
                                      Supervisor Authority
                                    </Badge>
                                  )}
                                  {editRole === "FC" && (
                                    <Badge variant="primary" size="sm">
                                      FC · God-Mode
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {getEffectiveActionsForRoleAndLevel(
                                    editRole,
                                    editLevel,
                                  ).map((action) => {
                                    const isManagerAction =
                                      ACTIONS_REQUIRING_MANAGER.includes(
                                        action as Action,
                                      );
                                    const isSupervisorAction =
                                      ACTIONS_REQUIRING_SUPERVISOR_OR_MANAGER.includes(
                                        action as Action,
                                      );

                                    return (
                                      <Badge
                                        key={action}
                                        size="sm"
                                        variant={
                                          isManagerAction
                                            ? "success"
                                            : isSupervisorAction
                                              ? "warning"
                                              : "outline"
                                        }
                                      >
                                        {action.replace(/_/g, " ")}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  account.role === "FC" ? "primary" : "neutral"
                                }
                              >
                                {account.role}
                              </Badge>
                              {account.role !== "FC" && (
                                <Badge
                                  variant={
                                    account.level === "MANAGER"
                                      ? "success"
                                      : account.level === "SUPERVISOR"
                                        ? "warning"
                                        : "default"
                                  }
                                  size="sm"
                                >
                                  {account.level || "STAFF"}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              account.status === "APPROVED" ||
                              account.status === "ACTIVE"
                                ? "success"
                                : "neutral"
                            }
                            dot
                          >
                            {account.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {editingId === account.id ? (
                              <>
                                <Button
                                  size="xs"
                                  variant="success_soft"
                                  onClick={() => saveEdit(account.id)}
                                  title="Save"
                                >
                                  <Save className="w-3.5 h-3.5" /> Save
                                </Button>
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={() => setEditingId(null)}
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" /> Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="xs"
                                  variant="secondary"
                                  onClick={() => startEdit(account)}
                                  disabled={
                                    account.role === "FC" &&
                                    account.username !== user?.username &&
                                    user?.username?.toLowerCase() !== "eghy" &&
                                    user?.username?.toLowerCase() !== "ludy"
                                  }
                                  title="Edit Role"
                                >
                                  <Edit2 className="w-3.5 h-3.5" /> Edit
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="danger_soft"
                                  onClick={() => handleDelete(account.id)}
                                  disabled={account.username === user?.username}
                                  title="Delete Account"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* PBAC Reference Matrix View */}
          {activeTab === "pbac" && (
            <Card padding="none">
              <div className="p-4 sm:p-5 border-b border-stone-200/80">
                <CardHeader
                  title="Departmental PBAC Policy Matrix"
                  subtitle="Effective capability distribution across Staff, Supervisor, and Manager levels"
                  icon={<KeyRound className="w-4 h-4" />}
                  className="mb-0"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department Role</TableHead>
                    <TableHead>Staff Capabilities</TableHead>
                    <TableHead>Supervisor & Manager Capabilities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ALL_ERP_ROLES.filter((r) => r.value !== "FC").map((role) => {
                    const staffActions = getEffectiveActionsForRoleAndLevel(
                      role.value,
                      "STAFF",
                    );
                    const managerActions = getEffectiveActionsForRoleAndLevel(
                      role.value,
                      "MANAGER",
                    );
                    const elevatedActions = managerActions.filter(
                      (a) => !staffActions.includes(a),
                    );
                    return (
                      <TableRow key={role.value}>
                        <TableCell className="align-top">
                          <Badge variant="neutral">{role.value}</Badge>
                          <p className="text-[11px] text-stone-500 mt-1">
                            {role.label}
                          </p>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1">
                            {staffActions.map((act) => (
                              <Badge key={act} variant="outline" size="sm">
                                {act.replace(/_/g, " ")}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1">
                            {elevatedActions.length === 0 ? (
                              <span className="text-xs text-stone-400">
                                Full operational parity
                              </span>
                            ) : (
                              elevatedActions.map((act) => (
                                <Badge key={act} variant="success" size="sm">
                                  {act.replace(/_/g, " ")}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        confirmText={confirmModal.title.includes("Reset") ? "Reset" : "Delete"}
        isDestructive
      />

      {/* Danger Zone */}
      {hasGodMode(user) && (
        <Card className="border-rose-200/80 bg-rose-50/20">
          <CardHeader
            title="Danger Zone"
            subtitle="Irreversible system maintenance actions (FC Authority Only)"
            icon={<AlertTriangle className="w-4 h-4 text-rose-600" />}
          />
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
            <div>
              <h4 className="font-bold text-stone-900 text-sm">
                Full Factory Reset (ERP & HRIS)
              </h4>
              <p className="text-stone-500 text-xs mt-0.5">
                Wipes all projects, transactions, inventory, social feeds, and HRIS data while preserving user accounts.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: "Full Factory Reset",
                  message:
                    "CRITICAL: This will permanently delete ALL transactional, master, and HR data from the entire system. ONLY user accounts will remain. This action is IRREVERSIBLE. Are you absolutely certain?",
                  onConfirm: async () => {
                    try {
                      const resFactory = await apiFetch(
                        "/api/admin/reset-factory",
                        { method: "POST" },
                        user?.username,
                      );
                      const resHr = await apiFetch(
                        "/api/admin/reset-hris",
                        { method: "POST" },
                        user?.username,
                      );

                      if (resFactory.ok && resHr.ok) {
                        showToast(
                          "Full Factory reset successful. System is now clean.",
                          "success",
                        );
                        setTimeout(() => window.location.reload(), 2000);
                      } else {
                        showToast(
                          resFactory.error ||
                            resHr.error ||
                            "Failed to perform reset",
                          "error",
                        );
                      }
                    } catch (_e) {
                      showToast("Error performing reset", "error");
                    } finally {
                      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
                    }
                  },
                });
              }}
            >
              <AlertTriangle className="w-4 h-4" /> Reset All Data
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
