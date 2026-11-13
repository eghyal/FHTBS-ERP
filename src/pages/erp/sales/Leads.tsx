import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserCheck, RefreshCw, Sliders } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/utils/api";
import { formatIDR } from "@/lib/utils";
import { PotentialCustomer, StatsSummary, PotentialCustomerStatus } from "@/types/scout";
import { PotentialCustomersStats } from "@/components/erp/sales/LeadStats";
import { PotentialCustomersFilters } from "@/components/erp/sales/LeadFilters";
import { PotentialCustomersTable } from "@/components/erp/sales/LeadTable";
import { LeadScoutDetailModal } from "@/components/erp/sales/LeadDetailModal";
import { ScoutICPModal } from "@/components/erp/sales/ScoutICPModal";

export default function PotentialCustomers() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Primary Data State
  const [leads, setLeads] = useState<PotentialCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedLead, setSelectedLead] = useState<PotentialCustomer | null>(null);

  // Filters State
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [consentFilter, setConsentFilter] = useState("ALL");

  // Operational State
  const [scoutingIds, setScoutingIds] = useState<string[]>([]);
  const [isBulkScouting, setIsBulkScouting] = useState(false);
  const [isICPModalOpen, setIsICPModalOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<PotentialCustomer | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // Summary Metrics
  const [stats, setStats] = useState<StatsSummary>({
    total_leads: 0,
    grade_a_count: 0,
    grade_b_count: 0,
    grade_c_count: 0,
    grade_d_count: 0,
    scouted_count: 0,
    consented_count: 0,
    total_cart_pipeline_value: 0,
    converted_count: 0,
    contacted_count: 0,
  });

  // Fetch Potential Customers
  const fetchLeads = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        if (gradeFilter !== "ALL") params.append("grade", gradeFilter);

        const res = await apiFetch(`/api/sales/potential-customers?${params.toString()}`, {}, user?.username);
        if (res.ok && res.data?.success) {
          setLeads(res.data.data || []);
          if (res.data.stats) setStats(res.data.stats);
        } else {
          showToast("Failed to load potential customers", "error");
        }
      } catch (err) {
        console.error("Failed to load potential customers:", err);
        showToast("Connection failed while loading leads", "error");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [search, gradeFilter, showToast, user?.username]
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Client-side filtering for status and consent
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (statusFilter !== "ALL" && lead.status !== statusFilter) return false;
      const hasConsent = Boolean(lead.profiling_consent || (lead.consents && lead.consents.length > 0));
      if (consentFilter === "CONSENTED" && !hasConsent) return false;
      if (consentFilter === "NO_CONSENT" && hasConsent) return false;
      return true;
    });
  }, [leads, statusFilter, consentFilter]);

  // Handle Select All
  const handleSelectAll = useCallback(() => {
    if (selectedIds.length === filteredLeads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
    }
  }, [filteredLeads, selectedIds.length]);

  // Handle Toggle Single Selection
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // Single Lead AI Scout
  const handleScoutLead = useCallback(
    async (leadId: string) => {
      setScoutingIds((prev) => [...prev, leadId]);

      try {
        const res = await apiFetch(`/api/sales/potential-customers/${leadId}/scout`, {
          method: "POST",
        }, user?.username);

        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.error || "Failed to generate Scout AI dossier");
        }

        showToast("Lead dossier generated successfully", "success");

        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, ...res.data.data } : lead))
        );

        setSelectedLead((prev) =>
          prev && prev.id === leadId ? { ...prev, ...res.data.data } : prev
        );
      } catch (err: any) {
        showToast(err.message || "Scout analysis failed", "error");
      } finally {
        setScoutingIds((prev) => prev.filter((id) => id !== leadId));
      }
    },
    [showToast, user?.username]
  );

  // Bulk AI Scout
  const handleBulkScout = useCallback(async () => {
    if (selectedIds.length === 0 || isBulkScouting) return;
    setIsBulkScouting(true);
    try {
      const res = await apiFetch("/api/sales/potential-customers/bulk-scout", {
        method: "POST",
        body: JSON.stringify({ customer_ids: selectedIds }),
      }, user?.username);

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error || "Failed to process bulk analysis");
      }

      showToast(`Bulk profiling completed for ${selectedIds.length} leads`, "success");
      setSelectedIds([]);
      fetchLeads(true);
    } catch (err: any) {
      showToast(err.message || "Bulk profiling failed", "error");
    } finally {
      setIsBulkScouting(false);
    }
  }, [selectedIds, isBulkScouting, showToast, fetchLeads, user?.username]);

  // Delete Single Potential Customer Profile
  const handleConfirmDeleteProfile = useCallback(async () => {
    if (!leadToDelete) return;
    try {
      const res = await apiFetch(
        `/api/sales/potential-customers/${leadToDelete.id}`,
        { method: "DELETE" },
        user?.username
      );

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error || "Failed to delete potential customer profile");
      }

      showToast(`Profile "${leadToDelete.customer_name}" deleted permanently`, "success");
      setLeads((prev) => prev.filter((l) => l.id !== leadToDelete.id));
      setSelectedIds((prev) => prev.filter((id) => id !== leadToDelete.id));
      if (selectedLead?.id === leadToDelete.id) {
        setSelectedLead(null);
      }
      setLeadToDelete(null);
      fetchLeads(true);
    } catch (err: any) {
      showToast(err.message || "Failed to delete profile", "error");
    }
  }, [leadToDelete, selectedLead?.id, showToast, fetchLeads, user?.username]);

  // Bulk Delete Potential Customer Profiles
  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await apiFetch(
        "/api/sales/potential-customers/bulk-delete",
        {
          method: "POST",
          body: JSON.stringify({ customer_ids: selectedIds }),
        },
        user?.username
      );

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.error || "Failed to delete selected profiles");
      }

      showToast(`${selectedIds.length} potential customer profile(s) deleted`, "success");
      if (selectedLead && selectedIds.includes(selectedLead.id)) {
        setSelectedLead(null);
      }
      setSelectedIds([]);
      setIsBulkDeleteOpen(false);
      fetchLeads(true);
    } catch (err: any) {
      showToast(err.message || "Bulk profile deletion failed", "error");
    }
  }, [selectedIds, selectedLead, showToast, fetchLeads, user?.username]);

  // Open Lead Detail Modal
  const handleOpenLeadDetail = useCallback(async (lead: PotentialCustomer) => {
    setSelectedLead(lead);
    try {
      const res = await apiFetch(`/api/sales/potential-customers/${lead.id}`, {}, user?.username);
      if (res.ok && res.data?.success && res.data?.data) {
        setSelectedLead(res.data.data);
      }
    } catch (err) {
      console.warn("Could not fetch detailed activities:", err);
    }
  }, [user?.username]);

  // Quick WhatsApp Outreach
  const handleQuickWhatsApp = useCallback(
    (customer: PotentialCustomer) => {
      if (!customer.phone) {
        showToast("Phone / WhatsApp number is not available", "error");
        return;
      }
      const cleanPhone = customer.phone.replace(/[^0-9]/g, "");
      const formattedPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
      const productNames = customer.cart_snapshot?.map((i) => i.name).slice(0, 2).join(", ");
      const text = encodeURIComponent(
        `Hello ${customer.customer_name}, thank you for browsing our catalog and showing interest in (${productNames || "our products"}). We are ready to assist with technical specifications and direct pricing. Is there an active project procurement timeline we can support?`
      );
      const a = document.createElement("a");
      a.href = `https://wa.me/${formattedPhone}?text=${text}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [showToast]
  );

  // Convert to Formal Quotation
  const handleConvertToQuotation = useCallback(
    async (customer: PotentialCustomer) => {
      try {
        const res = await apiFetch(`/api/sales/potential-customers/${customer.id}/convert-to-quotation`, {
          method: "POST",
        }, user?.username);

        if (res.ok && res.data?.success) {
          showToast(`Successfully converted to Quotation (${res.data.quotation_number})`, "success");
          setSelectedLead(null);
          fetchLeads(true);
          navigate(`/quotations`);
        } else {
          showToast(res.data?.error || res.error || "Failed to convert to Quotation", "error");
        }
      } catch (err: any) {
        showToast(err.message || "Error occurred during quotation conversion", "error");
      }
    },
    [showToast, fetchLeads, navigate, user?.username]
  );

  // Update Lead Status
  const handleUpdateStatus = useCallback(
    async (id: string, status: PotentialCustomerStatus) => {
      try {
        const res = await apiFetch(`/api/sales/potential-customers/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }, user?.username);

        if (res.ok) {
          setLeads((prev) =>
            prev.map((l) => (l.id === id ? { ...l, status } : l))
          );
          if (selectedLead && selectedLead.id === id) {
            setSelectedLead({ ...selectedLead, status });
          }
          showToast(`Lead status updated to ${status}`, "success");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      }
    },
    [selectedLead, showToast, user?.username]
  );

  // Save Sales Notes
  const handleSaveNotes = useCallback(
    async (id: string, notes: string) => {
      try {
        const res = await apiFetch(`/api/sales/potential-customers/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ sales_notes: notes }),
        }, user?.username);

        if (res.ok) {
          setLeads((prev) =>
            prev.map((l) => (l.id === id ? { ...l, sales_notes: notes } : l))
          );
          if (selectedLead && selectedLead.id === id) {
            setSelectedLead({ ...selectedLead, sales_notes: notes });
          }
          showToast("Internal sales notes saved", "success");
        }
      } catch (err: any) {
        showToast(err.message, "error");
      }
    },
    [selectedLead, showToast, user?.username]
  );

  // Send Outreach Log
  const handleSendOutreach = useCallback(
    async (id: string, note: string) => {
      try {
        const res = await apiFetch("/api/sales/outreach", {
          method: "POST",
          body: JSON.stringify({
            customer_id: id,
            channel: "WHATSAPP",
            custom_note: note,
          }),
        }, user?.username);

        if (res.ok) {
          showToast("Follow-up activity recorded", "success");
          if (selectedLead && selectedLead.id === id) {
            const newOut = {
              id: res.data?.outreach_id || `OUT-${Date.now()}`,
              customer_id: id,
              channel: "WHATSAPP",
              template_id: "CUSTOM",
              custom_note: note,
              sent_by: user?.username || "Sales Representative",
              sent_at: new Date().toISOString(),
              status: "SENT",
            };
            setSelectedLead({
              ...selectedLead,
              outreach: [newOut, ...(selectedLead.outreach || [])],
            });
          }
        }
      } catch (err: any) {
        showToast(err.message, "error");
      }
    },
    [selectedLead, showToast, user?.username]
  );

  // Submit AI Feedback
  const handleFeedback = useCallback(
    async (reportId: string, flag: "HELPFUL" | "WRONG_INFO", note: string) => {
      if (!selectedLead) return;
      try {
        const res = await apiFetch("/api/sales/feedback", {
          method: "POST",
          body: JSON.stringify({
            customer_id: selectedLead.id,
            field: "DEEP_OSINT",
            flag,
            note,
          }),
        }, user?.username);

        if (res.ok) {
          showToast("Feedback submitted to improve accuracy", "success");
        }
      } catch (e) {
        console.warn("Feedback submission error:", e);
      }
    },
    [selectedLead, showToast, user?.username]
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Top Page Header */}
      <PageHeader
        title="Potential Customers"
        subtitle="Sales leads & prospects"
        icon={<UserCheck className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsICPModalOpen(true)}
              leftIcon={<Sliders className="w-3.5 h-3.5" />}
            >
              ICP Settings
            </Button>

            <Button
              variant="secondary"
              size="icon-sm"
              onClick={() => fetchLeads(true)}
              disabled={isRefreshing}
              title="Refresh Data"
              aria-label="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />

      {/* Filters & Actions Bar */}
      <PotentialCustomersFilters
        searchQuery={search}
        onSearchChange={setSearch}
        gradeFilter={gradeFilter}
        onGradeChange={setGradeFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        consentFilter={consentFilter}
        onConsentChange={setConsentFilter}
        selectedCount={selectedIds.length}
        onBulkScout={handleBulkScout}
        isBulkScouting={isBulkScouting}
        onBulkDelete={() => setIsBulkDeleteOpen(true)}
      />

      {/* Main Customers Table */}
      <PotentialCustomersTable
        customers={filteredLeads}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onToggleSelect={handleToggleSelect}
        onViewDetail={handleOpenLeadDetail}
        onScoutSingle={handleScoutLead}
        scoutingIds={scoutingIds}
        onQuickWhatsApp={handleQuickWhatsApp}
        onConvertToQuotation={handleConvertToQuotation}
        onDeleteProfile={(customer) => setLeadToDelete(customer)}
      />

      {/* Prospect Intelligence & Activity Detail Modal */}
      <LeadScoutDetailModal
        customer={selectedLead}
        onClose={() => setSelectedLead(null)}
        onScout={handleScoutLead}
        isScouting={selectedLead ? scoutingIds.includes(selectedLead.id) : false}
        onUpdateStatus={handleUpdateStatus}
        onSaveNotes={handleSaveNotes}
        onSendOutreach={handleSendOutreach}
        onConvertToQuotation={handleConvertToQuotation}
        onFeedback={handleFeedback}
        onDeleteProfile={(customer) => setLeadToDelete(customer)}
      />

      {/* Ideal Customer Profile (ICP) Config Modal */}
      <ScoutICPModal
        isOpen={isICPModalOpen}
        onClose={() => setIsICPModalOpen(false)}
        onSaveSuccess={() => fetchLeads(true)}
      />

      {/* Single Profile Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={!!leadToDelete}
        title="Delete Potential Customer Profile"
        message={
          leadToDelete ? (
            <div className="space-y-3 text-left">
              <p className="text-sm text-stone-600 text-center">
                Are you sure you want to permanently delete this potential customer profile and all associated intelligence, consent, and outreach logs?
              </p>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1">
                <div className="font-bold text-stone-900">{leadToDelete.customer_name}</div>
                <div className="text-stone-500">
                  {leadToDelete.company ? `${leadToDelete.company} · ` : ""}
                  {leadToDelete.phone || leadToDelete.email || "No contact info"}
                </div>
                <div className="text-stone-500 font-mono tabular-nums">
                  Cart Pipeline: {formatIDR(leadToDelete.cart_total_value)} ({leadToDelete.cart_total_items || 0} items)
                </div>
              </div>
            </div>
          ) : (
            ""
          )
        }
        confirmText="Delete Profile"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleConfirmDeleteProfile}
        onCancel={() => setLeadToDelete(null)}
      />

      {/* Bulk Profile Deletion Confirmation Modal */}
      <ConfirmModal
        isOpen={isBulkDeleteOpen}
        title={`Delete ${selectedIds.length} Selected Profile(s)`}
        message={`Are you sure you want to permanently delete ${selectedIds.length} selected potential customer profile(s) along with their Scout AI dossiers and activity logs? This action cannot be undone.`}
        confirmText={`Delete ${selectedIds.length} Profile(s)`}
        cancelText="Cancel"
        isDestructive
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />
    </div>
  );
}
