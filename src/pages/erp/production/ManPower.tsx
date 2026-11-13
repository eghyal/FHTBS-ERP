import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  ShieldCheck,
  Edit3,
  Trash2,
  LayoutGrid,
  List,
  FileText,
  Wrench,
  Eye,
  Phone,
  Mail,
  X,
  UserCheck,
  Award,
  HardHat,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { generatePDF } from "@/lib/pdfGenerator";
import { cn } from "@/lib/utils";
import { Action, hasPermission } from "@/utils/pbac";

export interface HrisCandidate {
  id: string;
  username: string;
  name: string;
  role: string;
  level: string;
  status: string;
  created_at?: string;
  linked_manpower_id?: string;
  linked_nik?: string;
  linked_role_title?: string;
  linked_status?: string;
}

export interface ManpowerItem {
  id: string;
  user_username?: string;
  nik: string;
  name: string;
  role_title: string;
  skill_level: "MASTER" | "SENIOR" | "JUNIOR" | "APPRENTICE";
  specialization?: string;
  shift?: string;
  status: "AVAILABLE" | "ON_DUTY" | "ON_LEAVE" | "REST";
  phone?: string;
  email?: string;
  hourly_rate: number;
  certifications: string[];
  total_hours_worked: number;
  completed_tasks_count: number;
  efficiency_rating: number;
  notes?: string;
  created_at: string;
}

export interface ManpowerStats {
  total: number;
  onDuty: number;
  available: number;
  onLeave: number;
  rest: number;
  totalHours: number;
  avgEfficiency: number;
}

const SKILL_TIERS = [
  { value: "MASTER", label: "Master Craftsman", badgeColor: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "SENIOR", label: "Senior Operator", badgeColor: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "JUNIOR", label: "Junior Operator", badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "APPRENTICE", label: "Apprentice / Trainee", badgeColor: "bg-stone-100 text-stone-700 border-stone-200" }
];

export function ManPower() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const [manpowerList, setManpowerList] = useState<ManpowerItem[]>([]);
  const [stats, setStats] = useState<ManpowerStats | null>(null);
  const [hrisCandidates, setHrisCandidates] = useState<HrisCandidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingHris, setIsSyncingHris] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Filters & Views
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<"hris" | "manual">("hris");
  const [selectedHrisUser, setSelectedHrisUser] = useState<string>("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManpowerItem | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<ManpowerItem | null>(null);

  // PDF Export
  const [isExportingRoster, setIsExportingRoster] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    user_username?: string;
    nik: string;
    name: string;
    role_title: string;
    skill_level: "MASTER" | "SENIOR" | "JUNIOR" | "APPRENTICE";
    status: "AVAILABLE" | "ON_DUTY" | "ON_LEAVE" | "REST";
    phone: string;
    email: string;
    hourly_rate: number;
    certifications: string[];
    notes: string;
    newCertInput: string;
  }>({
    user_username: "",
    nik: "",
    name: "",
    role_title: "",
    skill_level: "SENIOR",
    status: "AVAILABLE",
    phone: "",
    email: "",
    hourly_rate: 55000,
    certifications: [],
    notes: "",
    newCertInput: ""
  });

  const canManage = hasPermission(user, Action.VIEW_PRODUCTION);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const [mpRes, statsRes, hrisRes] = await Promise.all([
        apiFetch("/api/production/manpower", {}, user?.username),
        apiFetch("/api/production/manpower/stats", {}, user?.username),
        apiFetch("/api/production/manpower/hris-candidates", {}, user?.username)
      ]);

      if (mpRes.ok && Array.isArray(mpRes.data)) {
        setManpowerList(mpRes.data);
      }
      if (statsRes.ok && statsRes.data) {
        setStats(statsRes.data);
      }
      if (hrisRes.ok && Array.isArray(hrisRes.data)) {
        setHrisCandidates(hrisRes.data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load workforce data", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync HRIS
  const handleSyncHris = async () => {
    setIsSyncingHris(true);
    try {
      const res = await apiFetch("/api/production/manpower/sync-hris", { method: "POST" }, user?.username);
      if (res.ok) {
        showToast(res.data?.message || "HRIS Sync completed!", "success");
        await loadData();
      } else {
        showToast(res.error || "Failed to sync with HRIS", "error");
      }
    } catch (e) {
      showToast("Failed to synchronize with HRIS", "error");
    } finally {
      setIsSyncingHris(false);
    }
  };

  // Reset Defaults
  const handleResetDefaults = async () => {
    setIsResetting(true);
    try {
      const res = await apiFetch("/api/production/manpower/reset-defaults", { method: "POST" }, user?.username);
      if (res.ok) {
        showToast("Manpower data reset to default!", "success");
        setShowResetConfirm(false);
        await loadData();
      } else {
        showToast(res.error || "Failed to reset Manpower data", "error");
      }
    } catch (e) {
      showToast("Failed to reset data", "error");
    } finally {
      setIsResetting(false);
    }
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return manpowerList.filter((item) => {
      return (
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.nik.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.role_title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  }, [manpowerList, searchQuery]);

  const getSkillTierBadge = (skill: string) => {
    const tier = SKILL_TIERS.find((t) => t.value === skill) || SKILL_TIERS[1];
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wider", tier.badgeColor)}>
        <ShieldCheck className="w-3 h-3" />
        <span>{tier.label}</span>
      </span>
    );
  };

  const handleOpenAdd = () => {
    const nextNik = `MP-${new Date().getFullYear()}-${String(manpowerList.length + 1).padStart(3, "0")}`;
    setAddMode("hris");
    setSelectedHrisUser("");
    setFormData({
      user_username: "",
      nik: nextNik,
      name: "",
      role_title: "",
      skill_level: "SENIOR",
      status: "AVAILABLE",
      phone: "",
      email: "",
      hourly_rate: 55000,
      certifications: ["HSE Production Safety Certified"],
      notes: "",
      newCertInput: ""
    });
    setShowAddModal(true);
  };

  const handleSelectHrisCandidate = (username: string) => {
    setSelectedHrisUser(username);
    const candidate = hrisCandidates.find((c) => c.username === username);
    if (candidate) {
      let roleTitle = "Production Technician";
      const generatedNik = candidate.linked_nik || `MP-${new Date().getFullYear()}-${String(manpowerList.length + 1).padStart(3, "0")}`;

      setFormData((prev) => ({
        ...prev,
        user_username: candidate.username,
        name: candidate.name,
        nik: generatedNik,
        role_title: candidate.linked_role_title || roleTitle,
        skill_level: candidate.level === "MANAGER" ? "MASTER" : "SENIOR",
        email: `${candidate.username}@factory.local`,
        phone: "+62 812-" + Math.floor(1000 + Math.random() * 9000) + "-" + Math.floor(1000 + Math.random() * 9000),
        notes: `Employee integrated from HRIS (${candidate.role} - ${candidate.level}).`
      }));
    }
  };

  const handleOpenEdit = (item: ManpowerItem) => {
    setSelectedOperator(item);
    setFormData({
      user_username: item.user_username || "",
      nik: item.nik,
      name: item.name,
      role_title: item.role_title,
      skill_level: item.skill_level,
      status: item.status || "AVAILABLE",
      phone: item.phone || "",
      email: item.email || "",
      hourly_rate: item.hourly_rate || 50000,
      certifications: item.certifications || [],
      notes: item.notes || "",
      newCertInput: ""
    });
    setShowEditModal(true);
  };

  const handleOpenDetail = (item: ManpowerItem) => {
    setSelectedOperator(item);
    setShowDetailModal(true);
  };

  const handleAddCert = (e: React.KeyboardEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!formData.newCertInput.trim()) return;
    if (formData.certifications.includes(formData.newCertInput.trim())) return;

    setFormData({
      ...formData,
      certifications: [...formData.certifications, formData.newCertInput.trim()],
      newCertInput: ""
    });
  };

  const handleRemoveCert = (cert: string) => {
    setFormData({
      ...formData,
      certifications: formData.certifications.filter((c) => c !== cert)
    });
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(
        "/api/production/manpower",
        {
          method: "POST",
          body: JSON.stringify({
            user_username: formData.user_username || undefined,
            nik: formData.nik,
            name: formData.name,
            role_title: formData.role_title,
            skill_level: formData.skill_level,
            specialization: "General",
            shift: "GENERAL",
            status: "AVAILABLE",
            phone: formData.phone,
            email: formData.email,
            hourly_rate: Number(formData.hourly_rate),
            certifications: formData.certifications,
            notes: formData.notes
          })
        },
        user?.username
      );

      if (res.ok) {
        showToast("Operator registered successfully", "success");
        setShowAddModal(false);
        loadData();
      } else {
        showToast(res.error || "Failed to save data", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperator) return;
    try {
      const res = await apiFetch(
        `/api/production/manpower/${selectedOperator.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            user_username: formData.user_username || undefined,
            nik: formData.nik,
            name: formData.name,
            role_title: formData.role_title,
            skill_level: formData.skill_level,
            specialization: selectedOperator.specialization || "General",
            shift: selectedOperator.shift || "GENERAL",
            status: selectedOperator.status || "AVAILABLE",
            phone: formData.phone,
            email: formData.email,
            hourly_rate: Number(formData.hourly_rate),
            certifications: formData.certifications,
            notes: formData.notes
          })
        },
        user?.username
      );

      if (res.ok) {
        showToast("Operator profile updated", "success");
        setShowEditModal(false);
        loadData();
      } else {
        showToast(res.error || "Failed to update data", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/production/manpower/${deleteTarget.id}`, { method: "DELETE" }, user?.username);
      if (res.ok) {
        showToast("Operator removed", "success");
        setDeleteTarget(null);
        loadData();
      } else {
        showToast(res.error || "Failed to delete", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error", "error");
    }
  };

  const handleExportRosterPdf = async () => {
    setIsExportingRoster(true);
    try {
      const printNode = document.createElement("div");
      printNode.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1c1917;">
          <div style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px;">
            <h1 style="font-size: 20px; font-weight: bold; margin: 0; text-transform: uppercase;">PT. FABRIKASI INDONESIA JAYA</h1>
            <p style="font-size: 14px; margin: 4px 0 0 0; color: #44403c;">PRODUCTION MANPOWER & OPERATOR PROFILE DIRECTORY</p>
            <p style="font-size: 11px; margin: 2px 0 0 0; color: #78716c;">Document Date: ${new Date().toLocaleDateString("en-US", { dateStyle: "long" })} | Total Personnel: ${manpowerList.length}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 15px;">
            <thead>
              <tr style="background-color: #f5f5f4; border-bottom: 1.5px solid #a8a29e;">
                <th style="padding: 8px; text-align: center; border: 1px solid #d6d3d1;">No</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #d6d3d1;">Employee ID</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #d6d3d1;">Operator Name</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #d6d3d1;">Role / Position</th>
                <th style="padding: 8px; text-align: center; border: 1px solid #d6d3d1;">Skill Level</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #d6d3d1;">Certifications</th>
              </tr>
            </thead>
            <tbody>
              ${filteredList
                .map(
                  (op, idx) => `
                <tr style="border-bottom: 1px solid #e7e5e4;">
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4; text-align: center;">${idx + 1}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4; font-family: monospace; font-weight: bold;">${op.nik}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4; font-weight: bold;">${op.name}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4;">${op.role_title}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4; text-align: center; font-weight: bold;">${op.skill_level}</td>
                  <td style="padding: 6px 8px; border: 1px solid #e7e5e4; font-size: 10px;">${(op.certifications || []).join(", ") || "-"}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;

      document.body.appendChild(printNode);
      await generatePDF(printNode, `Production_Manpower_Directory_${new Date().toISOString().split("T")[0]}.pdf`, {
        orientation: "portrait",
        format: "a4"
      });
      document.body.removeChild(printNode);
      showToast("Report downloaded", "success");
    } catch (e: any) {
      console.error(e);
      showToast("Failed to export document", "error");
    } finally {
      setIsExportingRoster(false);
    }
  };

  const totalSeniorMaster = useMemo(() => {
    return manpowerList.filter((i) => i.skill_level === "MASTER" || i.skill_level === "SENIOR").length;
  }, [manpowerList]);

  const totalHrisLinked = useMemo(() => {
    return manpowerList.filter((i) => i.user_username).length;
  }, [manpowerList]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      {/* HEADER SECTION */}
      <PageHeader
        title="Production Manpower Profiles"
        subtitle="Operators & shift roster"
        icon={<HardHat className="w-5 h-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button
                onClick={handleSyncHris}
                disabled={isSyncingHris}
                variant="secondary"
                size="sm"
                className="rounded-xl text-xs font-bold border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-amber-800 h-9 px-3 gap-1.5 shadow-2xs"
                title="Sync staff from HRIS"
              >
                <Users className={cn("w-3.5 h-3.5", isSyncingHris && "animate-spin")} />
                <span>{isSyncingHris ? "Syncing..." : "Sync HRIS"}</span>
                {hrisCandidates.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200/80 text-amber-900 font-mono">
                    {hrisCandidates.length}
                  </span>
                )}
              </Button>
            )}

            {canManage && (
              <Button
                onClick={() => setShowResetConfirm(true)}
                variant="secondary"
                size="sm"
                className="rounded-xl text-xs font-bold border-stone-200 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-stone-600 h-9 px-3 gap-1.5 shadow-2xs transition-colors"
                title="Reset manpower to standard default"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </Button>
            )}

            <Button
              onClick={handleExportRosterPdf}
              disabled={isExportingRoster || manpowerList.length === 0}
              variant="secondary"
              size="sm"
              className="rounded-xl text-xs font-bold border-stone-200 bg-white hover:bg-stone-100 text-stone-700 h-9 px-3 gap-1.5 shadow-2xs"
              title="Export workforce profiles PDF"
            >
              <FileText className="w-3.5 h-3.5 text-stone-500" />
              <span>{isExportingRoster ? "Exporting..." : "Export PDF"}</span>
            </Button>

            <Button
              type="button"
              onClick={loadData}
              variant="outline"
              size="icon"
              title="Refresh Data"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>

            {canManage && (
              <Button
                onClick={handleOpenAdd}
                size="sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Operator</span>
              </Button>
            )}
          </div>
        }
      />

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex-1 w-full">
            <Input
              type="text"
              placeholder="Search operator name, Employee ID, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex border border-stone-200 rounded-xl overflow-hidden bg-stone-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-1.5 rounded-lg transition-colors cursor-pointer",
                  viewMode === "grid" ? "bg-white text-stone-900 shadow-2xs font-bold" : "text-stone-400 hover:text-stone-600"
                )}
                title="Grid View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-1.5 rounded-lg transition-colors cursor-pointer",
                  viewMode === "list" ? "bg-white text-stone-900 shadow-2xs font-bold" : "text-stone-400 hover:text-stone-600"
                )}
                title="Table View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* OPERATOR PROFILES LIST / GRID */}
      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-stone-200 p-12 text-center">
          <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-stone-800">No matching manpower profiles found</h3>
          <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
            Try adjusting your search keywords.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredList.map((item) => {
            const initials = item.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase();

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between group hover:border-stone-300"
              >
                <div>
                  {/* Avatar + Info */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-stone-100 text-stone-800 border border-stone-200/90 flex items-center justify-center font-black text-sm tracking-wider shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-stone-900 truncate">
                          {item.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-medium flex-wrap">
                          <span className="font-mono">{item.nik}</span>
                          {item.user_username && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 text-[10px] font-mono border border-stone-200">
                              <Users className="w-2.5 h-2.5" />
                              {item.user_username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role Title */}
                  <div className="mt-3 text-xs font-semibold text-stone-800 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{item.role_title}</span>
                  </div>

                  {/* Badges: Skill Tier */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {getSkillTierBadge(item.skill_level)}
                  </div>

                  {/* Contact */}
                  <div className="mt-3.5 pt-3 border-t border-stone-100 text-xs">
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Contact</div>
                    <div className="text-[11px] text-stone-700 truncate mt-0.5 font-medium" title={item.phone || "-"}>
                      {item.phone || "-"}
                    </div>
                  </div>

                  {/* Certifications preview */}
                  {item.certifications && item.certifications.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {item.certifications.slice(0, 2).map((cert, i) => (
                        <span key={i} className="text-[10px] font-medium bg-stone-100 text-stone-700 px-2 py-0.5 rounded border border-stone-200/60 truncate max-w-[150px]">
                          {cert}
                        </span>
                      ))}
                      {item.certifications.length > 2 && (
                        <span className="text-[10px] font-bold text-stone-400 px-1 py-0.5">
                          +{item.certifications.length - 2}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-bold transition-colors cursor-pointer border border-stone-200"
                  >
                    <Eye className="w-3.5 h-3.5 text-stone-500" />
                    <span>Profile Details</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                        title="Edit Profile"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canManage && (
                      <Button
                        type="button"
                        variant="danger_soft"
                        size="icon-xs"
                        onClick={() => setDeleteTarget(item)}
                        title="Delete Operator"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-2xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Operator</TableHead>
                <TableHead>Skill Level</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredList.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-stone-100 text-stone-800 border border-stone-200/90 font-bold flex items-center justify-center text-xs shrink-0 font-mono">
                        {item.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-stone-900">{item.name}</div>
                        <div className="text-[10px] text-stone-400 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                          <span>{item.nik}</span>
                          <span>•</span>
                          <span>{item.role_title}</span>
                          {item.user_username && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 text-[10px] font-mono border border-stone-200">
                              <Users className="w-2.5 h-2.5" />
                              {item.user_username}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getSkillTierBadge(item.skill_level)}
                  </TableCell>
                  <TableCell className="text-stone-600">
                    <div className="font-mono tabular-nums">{item.phone || "-"}</div>
                    <div className="text-[10px] text-stone-400">{item.email || "-"}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDetail(item)}
                        title="Details"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canManage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(item)}
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          type="button"
                          variant="danger_soft"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(item)}
                          title="Delete Operator"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* MODAL: OPERATOR PROFILE DETAILS */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Manpower Profile Details"
        maxWidth="lg"
      >
        {selectedOperator && (
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-4 p-4 bg-stone-50 rounded-xl border border-stone-200">
              <div className="w-14 h-14 rounded-xl bg-stone-100 text-stone-800 border border-stone-200/90 flex items-center justify-center font-black text-xl shrink-0">
                {selectedOperator.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-stone-900">{selectedOperator.name}</h3>
                <div className="text-xs font-mono text-stone-500 mt-0.5">Employee ID: {selectedOperator.nik}</div>
                <div className="text-xs font-semibold text-stone-700 mt-1">{selectedOperator.role_title}</div>
                {selectedOperator.user_username && (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-stone-700 bg-stone-100 px-2 py-0.5 rounded border border-stone-200 font-mono">
                    <Users className="w-3 h-3" />
                    HRIS Account: {selectedOperator.user_username}
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-white border border-stone-200 rounded-xl text-xs">
              <div className="text-stone-400 font-bold uppercase text-[10px]">Skill Level</div>
              <div className="mt-1">{getSkillTierBadge(selectedOperator.skill_level)}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-1.5 text-stone-500 mb-1">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="font-bold uppercase text-[10px]">Phone / WhatsApp</span>
                </div>
                <div className="font-medium text-stone-800">{selectedOperator.phone || "-"}</div>
              </div>
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <div className="flex items-center gap-1.5 text-stone-500 mb-1">
                  <Mail className="w-3.5 h-3.5" />
                  <span className="font-bold uppercase text-[10px]">Email</span>
                </div>
                <div className="font-medium text-stone-800 truncate">{selectedOperator.email || "-"}</div>
              </div>
            </div>

            {selectedOperator.certifications && selectedOperator.certifications.length > 0 && (
              <div>
                <div className="text-xs font-bold text-stone-700 uppercase tracking-wider mb-2">Certifications & Qualifications</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedOperator.certifications.map((cert, idx) => (
                    <span key={idx} className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                      ✓ {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedOperator.notes && (
              <div className="p-3 bg-amber-50/50 border border-amber-200/80 rounded-xl text-xs text-amber-900">
                <span className="font-bold">Personnel Notes:</span> {selectedOperator.notes}
              </div>
            )}

            <div className="pt-3 border-t border-stone-200 flex justify-end">
              <Button onClick={() => setShowDetailModal(false)} variant="secondary" size="sm" className="rounded-xl">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: ADD NEW OPERATOR */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Register Production Operator"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitAdd} className="p-5 space-y-4 text-xs">
          {/* Mode Switcher: HRIS Sync / Manual Entry */}
          <div className="flex rounded-xl bg-stone-100 p-1 border border-stone-200 gap-1">
            <button
              type="button"
              onClick={() => setAddMode("hris")}
              className={cn(
                "flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                addMode === "hris" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-800"
              )}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Import from HRIS</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode("manual");
                setSelectedHrisUser("");
              }}
              className={cn(
                "flex-1 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                addMode === "manual" ? "bg-white text-stone-900 shadow-2xs" : "text-stone-500 hover:text-stone-800"
              )}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Manual Entry</span>
            </button>
          </div>

          {addMode === "hris" && (
            <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
              <Select
                label="Select Employee from HRIS"
                value={selectedHrisUser}
                onChange={(e) => handleSelectHrisCandidate(e.target.value)}
              >
                <option value="">-- Select HRIS Account --</option>
                {hrisCandidates.map((c) => (
                  <option key={c.username} value={c.username}>
                    {c.name} (@{c.username}) - {c.role} [{c.level}]
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-stone-500">
                Selecting an HRIS account links this operator profile directly with the company employee master record.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Employee ID *"
              type="text"
              required
              value={formData.nik}
              onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
              className="font-mono tabular-nums"
              placeholder="e.g. MP-2026-009"
            />

            <Input
              label="Full Name *"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Agus Pratama"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Role / Position *"
              type="text"
              required
              value={formData.role_title}
              onChange={(e) => setFormData({ ...formData, role_title: e.target.value })}
              placeholder="e.g. Senior TIG/MIG Welder"
            />

            <Select
              label="Skill Level *"
              value={formData.skill_level}
              onChange={(e) => setFormData({ ...formData, skill_level: e.target.value as any })}
            >
              {SKILL_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone / WhatsApp"
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+62 812-xxxx-xxxx"
            />

            <Input
              label="Employee Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="operator@factory.local"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-600 uppercase tracking-wider mb-1.5">
              Certifications &amp; Qualifications
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={formData.newCertInput}
                onChange={(e) => setFormData({ ...formData, newCertInput: e.target.value })}
                wrapperClassName="flex-1"
                placeholder="e.g. HSE Safety Certificate / Welding ASME IX"
              />
              <Button type="button" onClick={handleAddCert} variant="secondary" size="md">
                Add
              </Button>
            </div>

            {formData.certifications.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {formData.certifications.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 text-[11px] bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-lg">
                    {c}
                    <X className="w-3 h-3 text-stone-400 hover:text-stone-700 cursor-pointer" onClick={() => handleRemoveCert(c)} />
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
            <Button type="button" onClick={() => setShowAddModal(false)} variant="secondary" size="sm">
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary">
              Save Operator
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: EDIT OPERATOR PROFILE */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Operator Profile"
        maxWidth="lg"
      >
        <form onSubmit={handleSubmitEdit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Employee ID *"
              type="text"
              required
              value={formData.nik}
              onChange={(e) => setFormData({ ...formData, nik: e.target.value })}
              className="font-mono tabular-nums"
            />

            <Input
              label="Full Name *"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Role / Position *"
              type="text"
              required
              value={formData.role_title}
              onChange={(e) => setFormData({ ...formData, role_title: e.target.value })}
            />

            <Select
              label="Skill Level *"
              value={formData.skill_level}
              onChange={(e) => setFormData({ ...formData, skill_level: e.target.value as any })}
            >
              {SKILL_TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone / WhatsApp"
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />

            <Input
              label="Employee Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
            <Button type="button" onClick={() => setShowEditModal(false)} variant="secondary" size="sm">
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Operator Profile"
        message={`Are you sure you want to delete operator profile ${deleteTarget?.name} (${deleteTarget?.nik})?`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* CONFIRM RESET DEFAULT MODAL */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleResetDefaults}
        title="Reset Default Manpower Data"
        message="This will reset all manpower profiles to the factory default dataset."
        confirmText={isResetting ? "Resetting..." : "Yes, Reset Defaults"}
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
}

export default ManPower;
