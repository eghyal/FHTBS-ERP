import { safeFetchJson, apiFetch } from "@/utils/api";
import React, { useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Search,
  Mail,
  Phone,
  MapPin,
  X,
  Award,
  TrendingUp,
  CheckCircle2,
  FileText,
  Eye,
  Edit2,
  Trash2,
  Receipt,
  DollarSign,
  Clock,
  ExternalLink,
} from "lucide-react";
import { cn, formatIDR } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { Loader } from "@/components/shared/Loader";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/Table";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Action, hasPermission } from "@/utils/pbac";
import { useCustomersLocal } from "@/hooks/useCustomersLocal";
import { CreateQuotationModal } from "@/components/erp/CreateQuotationModal";
import { QuotationPreviewModal } from "@/components/erp/QuotationPreviewModal";
import {
  formatSequence3,
  getNextEntitySequence,
  generateSmartCustomerCode,
} from "@/utils/autoCoding";

interface Customer {
  id: string;
  name: string;
  code: string;
  contact_person?: string;
  email: string;
  phone: string;
  address: string;
  npwp?: string;
  customer_segment?: "B2B" | "B2C" | "OMNICHANNEL";
  credit_limit?: number;
  payment_terms_days?: number;
  active_ar_exposure?: number;
  b2c_orders_count?: number;
  delivered_count?: number;
  pending_count?: number;
  total_deliveries?: number;
  total_quotations?: number;
  total_quotation_value?: number;
  pending_quotations_count?: number;
}

interface Lead {
  id: string;
  name: string;
  contact_info: string;
  intent: string;
  status: string;
  created_at: string;
}

export default function Customers() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    customers: localCustomers,
    isLoading,
    addCustomerLocal,
    updateCustomerLocal,
    deleteCustomerLocal,
    refreshCloud,
  } = useCustomersLocal(user);
  const customers = localCustomers as Customer[];

  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canModify = hasPermission(user, Action.MANAGE_CUSTOMERS);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [deleteLeadConfirm, setDeleteLeadConfirm] = useState<{id: string; name: string} | null>(null);

  // Customer Profile Details & Quotations Integration State
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [customerDetails, setCustomerDetails] = useState<{
    customer: any;
    quotations: any[];
    deliveries: any[];
    invoices: any[];
    projects: any[];
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<"quotations" | "deliveries" | "invoices">("quotations");

  const [showCreateQuoModal, setShowCreateQuoModal] = useState(false);
  const [selectedQuoToPreview, setSelectedQuoToPreview] = useState<any | null>(null);
  const [schemaAudit, setSchemaAudit] = useState<any | null>(null);
  const [showAuditPanel, setShowAuditPanel] = useState(true);

  const fetchCustomerDetails = async (customerId: string) => {
    setLoadingDetails(true);
    try {
      const res = await apiFetch(`/api/sales/customers/${customerId}/details`, {}, user?.username);
      if (res.ok && res.data) {
        setCustomerDetails({
          customer: res.data.customer,
          quotations: res.data.quotations || [],
          deliveries: res.data.deliveries || [],
          invoices: res.data.invoices || [],
          projects: res.data.projects || [],
        });
      } else {
        setCustomerDetails(null);
      }
    } catch (err) {
      console.error(err);
      setCustomerDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleOpenCustomerProfile = (customer: Customer) => {
    setSelectedProfileCustomer(customer);
    fetchCustomerDetails(customer.id);
  };

  const fetchCustomersAndLeads = async () => {
    try {
      // Refresh cloud data
      refreshCloud();

      // Fetch leads and business schema audit telemetry
      const [resLeads, resAudit] = await Promise.all([
        apiFetch("/api/sales/leads", {}, user?.username),
        apiFetch("/api/sales/business-schema-audit", {}, user?.username),
      ]);
      if (resLeads.ok)
        setLeads(Array.isArray(resLeads.data) ? resLeads.data : []);
      if (resAudit.ok && resAudit.data)
        setSchemaAudit(resAudit.data.data || resAudit.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomersAndLeads();
  }, [user]);

  const handleConvertLead = async (leadId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/leads/${leadId}/convert`,
        { method: "POST" },
        user?.username,
      );
      if (res.ok) {
        showToast("Lead successfully converted to Customer!", "success");
        fetchCustomersAndLeads();
      } else {
        showToast(res.error || "Failed to convert lead", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error converting lead", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteLead = async (leadId: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/leads/${leadId}`,
        { method: "DELETE" },
        user?.username,
      );
      if (res.ok) {
        showToast("Lead deleted", "success");
        fetchCustomersAndLeads();
      } else {
        showToast(res.error || "Failed to delete lead", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting lead", "error");
    } finally {
      setIsSubmitting(false);
      setDeleteLeadConfirm(null);
    }
  };

  const handleDeleteLead = (leadId: string, leadName: string) => {
    setDeleteLeadConfirm({ id: leadId, name: leadName });
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/customers/${editingCustomer.id}`,
        {
          method: "PUT",
          body: JSON.stringify(editingCustomer),
        },
        user?.username,
      );
      if (res.ok) {
        setShowEditModal(false);
        setEditingCustomer(null);
        fetchCustomersAndLeads();
        showToast("Customer profile updated successfully", "success");
      } else {
        showToast(res.error || "Failed to update customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/sales/customers/${id}`,
        {
          method: "DELETE",
        },
        user?.username,
      );
      if (res.ok) {
        setDeleteConfirm(null);
        fetchCustomersAndLeads();
        showToast("Customer profile deleted successfully", "success");
      } else {
        showToast(res.error || "Failed to delete customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error deleting customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    code: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    npwp: "",
    customer_segment: "B2B" as "B2B" | "B2C" | "OMNICHANNEL",
    credit_limit: 50000000,
    payment_terms_days: 30,
  });

  const nextCustomerSeq = React.useMemo(
    () => getNextEntitySequence("CUS", customers),
    [customers],
  );

  const computedCustomerCode = React.useMemo(
    () => generateSmartCustomerCode(newCustomer.name, nextCustomerSeq),
    [newCustomer.name, nextCustomerSeq],
  );

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...newCustomer,
        code: generateSmartCustomerCode(newCustomer.name, nextCustomerSeq),
      };
      const res = await apiFetch(
        "/api/sales/customers",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        user?.username,
      );
      if (res.ok) {
        const assignedCode = (res.data as any)?.code || payload.code;
        setShowAddModal(false);
        setNewCustomer({
          name: "",
          code: "",
          contact_person: "",
          email: "",
          phone: "",
          address: "",
          npwp: "",
          customer_segment: "B2B",
          credit_limit: 50000000,
          payment_terms_days: 30,
        });
        fetchCustomersAndLeads();
        showToast(`Customer profile ${assignedCode} added successfully`, "success");
      } else {
        showToast(res.error || "Failed to add customer", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Error adding customer", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = React.useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.code && c.code.toLowerCase().includes(searchQuery.toLowerCase())),
    );
  }, [customers, searchQuery]);

  const [selectedFilter, setSelectedFilter] = useState<
    "ALL" | "VIP" | "ACTIVE" | "LEADS"
  >("ALL");

  const totalCust = customers.length;
  const tierACust = customers.filter((c) => {
    const del = c.delivered_count || 0;
    const tot = c.total_deliveries || 0;
    return tot > 0 && del / tot >= 0.95;
  }).length;
  const totalCompletedDeliveries = customers.reduce(
    (acc, c) => acc + (c.delivered_count || 0),
    0,
  );
  const activePipelines = customers.reduce(
    (acc, c) => acc + (c.pending_count || 0),
    0,
  );
  const totalLeads = leads.filter((l) => l.status !== "CONVERTED").length;

  const displayedCustomers = filteredCustomers.filter((c) => {
    if (selectedFilter === "VIP") {
      const del = c.delivered_count || 0;
      const tot = c.total_deliveries || 0;
      return tot > 0 && del / tot >= 0.95;
    }
    if (selectedFilter === "ACTIVE") {
      return (c.pending_count || 0) > 0;
    }
    return true;
  });

  const displayedLeads = leads.filter(
    (l) =>
      l.status !== "CONVERTED" &&
      l.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4 sm:space-y-5 pb-20 animate-in fade-in duration-500">
      <PageHeader
        title="Customer Directory"
        subtitle="B2B & B2C customer accounts"
        icon={<Building2 className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            {canModify && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddModal(true)}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Corporate Client
              </Button>
            )}
          </div>
        }
      />

      {/* Filter and Workspace Control */}
      <div className="bg-white border border-stone-200/80 rounded-2xl p-3 sm:p-3.5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="max-w-sm w-full">
          <Input
            type="text"
            placeholder="Filter by customer name or lot reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
          />
        </div>

        <div className="flex gap-1.5 bg-stone-100 border border-stone-200/70 p-1 rounded-xl overflow-x-auto">
          <Button
            variant={selectedFilter === "LEADS" ? "primary" : "ghost"}
            size="xs"
            onClick={() => setSelectedFilter("LEADS")}
          >
            CRM Leads ({totalLeads})
          </Button>
          <Button
            variant={selectedFilter === "ALL" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setSelectedFilter("ALL")}
          >
            Clients
          </Button>
          <Button
            variant={selectedFilter === "VIP" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setSelectedFilter("VIP")}
            leftIcon={<Award className="w-3.5 h-3.5" />}
          >
            VIP ({tierACust})
          </Button>
          <Button
            variant={selectedFilter === "ACTIVE" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setSelectedFilter("ACTIVE")}
          >
            Pending ({activePipelines})
          </Button>
        </div>
      </div>

      {/* CRM Customer List Layout (Table) */}
      <div className="bg-white border border-stone-200/80 rounded-2xl shadow-2xs overflow-hidden">
        <Table>
          <TableHeader>
            {selectedFilter === "LEADS" ? (
              <TableRow>
                <TableHead>Lead Info</TableHead>
                <TableHead>Intent / Status</TableHead>
                <TableHead>Generated At</TableHead>
                <TableHead>Contact</TableHead>
                {canModify && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            ) : (
              <TableRow>
                <TableHead>Customer Info</TableHead>
                <TableHead>Tier / Code</TableHead>
                <TableHead>Quotations & Offers</TableHead>
                <TableHead>Fulfillment Score</TableHead>
                <TableHead>Contact & Logistics</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableEmpty colSpan={canModify ? 6 : 5} message="Loading global registry..." />
            ) : selectedFilter === "LEADS" ? (
              displayedLeads.length === 0 ? (
                <TableEmpty
                  colSpan={canModify ? 5 : 4}
                  icon={<Building2 className="w-8 h-8 text-stone-300" />}
                  message="No matching leads records"
                />
              ) : (
                displayedLeads.map((lead) => (
                  <TableRow key={lead.id} className="group">
                    <TableCell className="align-top">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-600 shrink-0 mt-0.5 border border-stone-200">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-stone-900">
                            {lead.name}
                          </div>
                          <div className="text-[10px] text-stone-400 uppercase tracking-widest mt-1 font-bold">
                            Unconverted Lead
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="text-xs font-semibold text-stone-800">
                        {lead.intent}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs font-mono tabular-nums text-stone-500">
                      {new Date(lead.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="align-top text-xs text-stone-600 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate max-w-[200px] font-semibold text-stone-800">
                          {lead.contact_info || "-"}
                        </span>
                      </div>
                    </TableCell>
                    {canModify && (
                      <TableCell className="align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            size="xs"
                            variant="primary"
                            disabled={isSubmitting}
                            onClick={() => handleConvertLead(lead.id)}
                          >
                            Convert to Customer
                          </Button>
                          <Button
                            size="xs"
                            variant="danger_soft"
                            disabled={isSubmitting}
                            onClick={() => handleDeleteLead(lead.id, lead.name)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )
            ) : displayedCustomers.length === 0 ? (
              <TableEmpty
                colSpan={6}
                icon={<Building2 className="w-8 h-8 text-stone-300" />}
                message="No matching customer records"
              />
            ) : (
              displayedCustomers.map((cus) => {
                const delivered = cus.delivered_count || 0;
                const pending = cus.pending_count || 0;
                const totalDeliveries = cus.total_deliveries || 0;

                let grade = "NEW";
                let badgeVariant: "default" | "success" | "warning" | "danger" = "default";
                let rate = 0;

                if (totalDeliveries > 0) {
                  rate = delivered / totalDeliveries;
                  if (rate >= 0.95) {
                    grade = "A";
                    badgeVariant = "success";
                  } else if (rate >= 0.8) {
                    grade = "B";
                    badgeVariant = "default";
                  } else if (rate >= 0.6) {
                    grade = "C";
                    badgeVariant = "warning";
                  } else {
                    grade = "D";
                    badgeVariant = "danger";
                  }
                }

                const percentFulfill =
                  totalDeliveries > 0
                    ? Math.round((delivered / totalDeliveries) * 100)
                    : 0;

                return (
                  <TableRow key={cus.id} className="group">
                    <TableCell className="align-top">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0 mt-0.5">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <button
                            onClick={() => handleOpenCustomerProfile(cus)}
                            className="text-sm font-bold text-stone-900 hover:text-stone-600 transition-colors text-left flex items-center gap-1 group/title"
                          >
                            <span>{cus.name}</span>
                            <ExternalLink className="w-3 h-3 text-stone-400 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                          </button>
                          {cus.contact_person && (
                            <div className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
                              <span className="text-stone-300">·</span>{" "}
                              {cus.contact_person} (Liaison)
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs font-mono tabular-nums text-stone-500">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className="font-bold text-stone-800">
                          {cus.code || "NO-REF-GEN"}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono">
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                grade === "A"
                                  ? "bg-amber-500"
                                  : grade === "B"
                                    ? "bg-stone-600"
                                    : grade === "C"
                                      ? "bg-stone-400"
                                      : "bg-stone-300"
                              )}
                            />
                            {grade === "NEW" ? "Lead" : `Tier ${grade}`}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border border-stone-200/80 bg-white text-stone-700">
                            {cus.customer_segment || "B2B"}
                          </span>
                        </div>
                        {(cus.credit_limit || 0) > 0 && (
                          <span className="text-[10px] text-stone-500 font-mono tabular-nums">
                            Limit: {formatIDR(cus.credit_limit || 0)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleOpenCustomerProfile(cus)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-900 hover:text-stone-600 transition-colors font-mono tabular-nums"
                        >
                          <FileText className="w-3.5 h-3.5 text-stone-500" />
                          <span>{cus.total_quotations || 0} Quotes</span>
                        </button>
                        <span className="text-[10px] font-mono tabular-nums font-bold text-stone-900">
                          {formatIDR(cus.total_quotation_value || 0)}
                        </span>
                        {(cus.active_ar_exposure || 0) > 0 && (
                          <span className="text-[10px] font-mono tabular-nums text-amber-800">
                            AR Exposure: {formatIDR(cus.active_ar_exposure || 0)}
                          </span>
                        )}
                        {(cus.b2c_orders_count || 0) > 0 && (
                          <span className="text-[10px] font-mono tabular-nums text-stone-500">
                            {cus.b2c_orders_count} B2C Retail Orders
                          </span>
                        )}
                        {cus.pending_quotations_count ? (
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border border-stone-200/90 bg-stone-50/70 text-stone-700 inline-flex items-center gap-1 font-mono w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            {cus.pending_quotations_count} Pending
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="w-40">
                        <div className="flex justify-between items-center text-[10px] font-mono tabular-nums font-bold text-stone-500 mb-1.5">
                          <span>{percentFulfill}% Achieved</span>
                          <span>{totalDeliveries} Total</span>
                        </div>
                        <div className="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              percentFulfill >= 95
                                ? "bg-stone-800"
                                : percentFulfill >= 80
                                  ? "bg-stone-500"
                                  : percentFulfill >= 60
                                    ? "bg-stone-400"
                                    : "bg-stone-300",
                            )}
                            style={{
                              width: `${totalDeliveries > 0 ? percentFulfill : 10}%`,
                            }}
                          ></div>
                        </div>
                        <div className="flex gap-3 text-[10px] font-mono tabular-nums font-bold mt-1.5">
                          <span className="text-stone-700">
                            {delivered} OK
                          </span>
                          <span className="text-stone-400">
                            {pending} Pend
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs text-stone-600 space-y-1">
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-stone-400" />
                        <span>{cus.phone || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-stone-400" />
                        <span className="truncate max-w-[180px]">
                          {cus.email || "-"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() => handleOpenCustomerProfile(cus)}
                          leftIcon={<Eye className="w-3 h-3" />}
                        >
                          Profile & Quotes
                        </Button>
                        {canModify && (
                          <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-lg border border-stone-200/60">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                setEditingCustomer(cus);
                                setShowEditModal(true);
                              }}
                              title="Edit Customer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="danger_soft"
                              size="icon-sm"
                              onClick={() => setDeleteConfirm(cus)}
                              title="Delete Customer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Customer Modal */}
      <Modal
        isOpen={showEditModal && editingCustomer !== null}
        onClose={() => setShowEditModal(false)}
        title="Edit Customer Profile"
        description="Update external recipient information"
        maxWidth="3xl"
        footer={
          editingCustomer ? (
            <div className="flex flex-wrap justify-end gap-3 font-sans">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" form="edit-customer-form" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          ) : undefined
        }
      >
        {editingCustomer && (
          <form id="edit-customer-form" onSubmit={handleUpdateCustomer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Customer Name"
                required
                value={editingCustomer.name}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    name: e.target.value,
                  })
                }
              />
              <Input
                label="Customer Code · System Locked"
                required
                readOnly
                tabIndex={-1}
                value={editingCustomer.code || ""}
                className="font-mono tabular-nums font-bold bg-stone-100/80 text-stone-800 border-stone-200 cursor-not-allowed select-all"
              />
            </div>
            <Input
              label="Contact Person (Liaison)"
              value={editingCustomer.contact_person || ""}
              onChange={(e) =>
                setEditingCustomer({
                  ...editingCustomer,
                  contact_person: e.target.value,
                })
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                value={editingCustomer.email || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    email: e.target.value,
                  })
                }
              />
              <Input
                label="Phone"
                value={editingCustomer.phone || ""}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    phone: e.target.value,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Select
                label="Customer Segment"
                value={editingCustomer.customer_segment || "B2B"}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    customer_segment: e.target.value as any,
                  })
                }
              >
                <option value="B2B">B2B Corporate</option>
                <option value="B2C">B2C Retail</option>
                <option value="OMNICHANNEL">Omnichannel (B2B + B2C)</option>
              </Select>
              <Input
                label="Credit Limit (IDR)"
                type="number"
                value={editingCustomer.credit_limit ?? 0}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    credit_limit: Number(e.target.value) || 0,
                  })
                }
                className="font-mono tabular-nums"
              />
              <Input
                label="Payment Terms (Days)"
                type="number"
                value={editingCustomer.payment_terms_days ?? 30}
                onChange={(e) =>
                  setEditingCustomer({
                    ...editingCustomer,
                    payment_terms_days: Number(e.target.value) || 0,
                  })
                }
                className="font-mono tabular-nums"
              />
            </div>
            <Input
              label="Tax ID"
              value={editingCustomer.npwp || ""}
              onChange={(e) =>
                setEditingCustomer({
                  ...editingCustomer,
                  npwp: e.target.value,
                })
              }
              placeholder="e.g. 01.234.567.8-901.000"
              className="font-mono"
            />
            <Textarea
              label="Address"
              value={editingCustomer.address || ""}
              onChange={(e) =>
                setEditingCustomer({
                  ...editingCustomer,
                  address: e.target.value,
                })
              }
            />
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() =>
          deleteConfirm && handleDeleteCustomer(deleteConfirm.id)
        }
        title="Delete Customer Profile?"
        message={`Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone and will only succeed if the customer has no active delivery manifests or associated records.`}
        confirmText={isSubmitting ? "Deleting..." : "Confirm Delete"}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={deleteLeadConfirm !== null}
        onCancel={() => setDeleteLeadConfirm(null)}
        onConfirm={() =>
          deleteLeadConfirm && confirmDeleteLead(deleteLeadConfirm.id)
        }
        title="Delete Lead?"
        message={`Are you sure you want to delete the lead ${deleteLeadConfirm?.name}? This action cannot be undone.`}
        confirmText={isSubmitting ? "Deleting..." : "Confirm Delete"}
        isDestructive={true}
      />

      {/* Add Customer Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Customer Profile"
        description="Register a new external client in the master data"
        maxWidth="3xl"
        footer={
          <div className="flex flex-wrap justify-end gap-3 font-sans">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" form="add-customer-form" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Customer"}
            </Button>
          </div>
        }
      >
        <form id="add-customer-form" onSubmit={handleAddCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Customer Name"
              required
              value={newCustomer.name}
              onChange={(e) => {
                const nameVal = e.target.value;
                setNewCustomer({
                  ...newCustomer,
                  name: nameVal,
                  code: generateSmartCustomerCode(nameVal, nextCustomerSeq),
                });
              }}
              placeholder="e.g. Amtra Electric"
            />
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                  Customer Code · Auto
                </label>
                <span className="text-[10px] font-mono tabular-nums text-stone-500">
                  Seq #{formatSequence3(nextCustomerSeq)}
                </span>
              </div>
              <Input
                readOnly
                tabIndex={-1}
                value={computedCustomerCode}
                className="font-mono tabular-nums font-bold bg-stone-100/80 text-stone-800 border-stone-200 cursor-not-allowed select-all"
              />
            </div>
          </div>
          <Input
            label="Contact Person"
            value={newCustomer.contact_person}
            onChange={(e) =>
              setNewCustomer({
                ...newCustomer,
                contact_person: e.target.value,
              })
            }
            placeholder="e.g. Mr. Ahmad"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={newCustomer.email}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, email: e.target.value })
              }
              placeholder="procurement@client.com"
            />
            <Input
              label="Phone"
              value={newCustomer.phone}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, phone: e.target.value })
              }
              placeholder="0812-xxxx-xxxx"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Customer Segment"
              value={newCustomer.customer_segment}
              onChange={(e) =>
                setNewCustomer({
                  ...newCustomer,
                  customer_segment: e.target.value as any,
                })
              }
            >
              <option value="B2B">B2B Corporate</option>
              <option value="B2C">B2C Retail</option>
              <option value="OMNICHANNEL">Omnichannel (B2B + B2C)</option>
            </Select>
            <Input
              label="Credit Limit (IDR)"
              type="number"
              value={newCustomer.credit_limit}
              onChange={(e) =>
                setNewCustomer({
                  ...newCustomer,
                  credit_limit: Number(e.target.value) || 0,
                })
              }
              className="font-mono tabular-nums"
            />
            <Input
              label="Payment Terms (Days)"
              type="number"
              value={newCustomer.payment_terms_days}
              onChange={(e) =>
                setNewCustomer({
                  ...newCustomer,
                  payment_terms_days: Number(e.target.value) || 0,
                })
              }
              className="font-mono tabular-nums"
            />
          </div>
          <Input
            label="Tax ID"
            value={newCustomer.npwp}
            onChange={(e) =>
              setNewCustomer({ ...newCustomer, npwp: e.target.value })
            }
            className="font-mono"
            placeholder="e.g. 01.234.567.8-901.000"
          />
          <Textarea
            label="Address"
            value={newCustomer.address}
            onChange={(e) =>
              setNewCustomer({ ...newCustomer, address: e.target.value })
            }
            placeholder="Jl. Pahlawan Karya No. 456..."
          />
        </form>
      </Modal>

      {/* CUSTOMER PROFILE & QUOTATIONS INTEGRATION MODAL */}
      <Modal
        isOpen={selectedProfileCustomer !== null}
        onClose={() => {
          setSelectedProfileCustomer(null);
          setCustomerDetails(null);
        }}
        title={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-stone-900 truncate">
                {selectedProfileCustomer?.name}
              </div>
              <div className="text-xs font-mono font-bold text-stone-400">
                Customer Reference: {selectedProfileCustomer?.code || "N/A"}
              </div>
            </div>
          </div>
        }
        maxWidth="5xl"
      >
        {loadingDetails ? (
          <div className="py-16 text-center">
            <Loader text="Loading customer profile, quotations & operational history..." />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Customer Quick Profile Card */}
            <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs text-stone-600 flex flex-wrap items-center gap-4">
                  {selectedProfileCustomer?.contact_person && (
                    <span className="flex items-center gap-1 font-medium">
                      <strong>Liaison:</strong> {selectedProfileCustomer.contact_person}
                    </span>
                  )}
                  {selectedProfileCustomer?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-stone-400" /> {selectedProfileCustomer.email}
                    </span>
                  )}
                  {selectedProfileCustomer?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-stone-400" /> {selectedProfileCustomer.phone}
                    </span>
                  )}
                  {selectedProfileCustomer?.npwp && (
                    <span className="flex items-center gap-1 bg-stone-200/80 px-2 py-0.5 rounded font-mono text-stone-800 text-[11px]">
                      <span className="font-sans font-bold text-[9px] uppercase text-stone-500">Tax ID:</span>
                      <strong>{selectedProfileCustomer.npwp}</strong>
                    </span>
                  )}
                </div>
                {selectedProfileCustomer?.address && (
                  <div className="text-xs text-stone-500 flex items-start gap-1 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                    <span>{selectedProfileCustomer.address}</span>
                  </div>
                )}
              </div>

              <Button
                size="sm"
                variant="primary"
                onClick={() => setShowCreateQuoModal(true)}
                className="flex items-center gap-2 shadow-xs"
              >
                <Plus className="w-4 h-4" /> Create Quotation for Client
              </Button>
            </div>

            {/* Metrics KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Quotations Offered</span>
                  <FileText className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.quotations) ? customerDetails.quotations : []).length} <span className="text-xs font-normal text-stone-500">Quotes</span>
                </div>
                <div className="text-xs text-emerald-700 font-bold mt-1 font-mono">
                  {formatIDR(
                    (Array.isArray(customerDetails?.quotations) ? customerDetails.quotations : [])
                      .filter((q: any) => q.status === "APPROVED")
                      .reduce((sum: number, q: any) => sum + (q.amount || 0), 0) || 0
                  )}{" "}
                  <span className="text-[10px] font-sans text-stone-500 font-normal">(Approved)</span>
                </div>
              </div>

              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Delivery Manifests</span>
                  <Receipt className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.deliveries) ? customerDetails.deliveries : []).length} <span className="text-xs font-normal text-stone-500">Lots</span>
                </div>
                <div className="text-xs text-stone-500 font-medium mt-1">
                  {(Array.isArray(customerDetails?.deliveries) ? customerDetails.deliveries : []).filter((d: any) => d.status === "DELIVERED").length} Delivered
                </div>
              </div>

              <div className="p-4 bg-white border border-stone-200 rounded-2xl shadow-2xs">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Commercial Invoices</span>
                  <DollarSign className="w-4 h-4 text-stone-400" />
                </div>
                <div className="text-2xl font-black text-stone-900 mt-1">
                  {(Array.isArray(customerDetails?.invoices) ? customerDetails.invoices : []).length} <span className="text-xs font-normal text-stone-500">Invoices</span>
                </div>
                <div className="text-xs text-stone-500 font-medium mt-1">
                  {(Array.isArray(customerDetails?.projects) ? customerDetails.projects : []).length} Linked Active Projects
                </div>
              </div>
            </div>

            {/* Profile Tab Navigation */}
            <div className="flex border-b border-stone-200 gap-4 sm:gap-6 overflow-x-auto">
              <button
                onClick={() => setActiveProfileTab("quotations")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "quotations"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <FileText className="w-4 h-4" />
                Commercial Quotations ({customerDetails?.quotations.length || 0})
              </button>
              <button
                onClick={() => setActiveProfileTab("deliveries")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "deliveries"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <Receipt className="w-4 h-4" />
                Delivery Records ({customerDetails?.deliveries.length || 0})
              </button>
              <button
                onClick={() => setActiveProfileTab("invoices")}
                className={cn(
                  "pb-3 text-xs font-bold uppercase tracking-widest transition-all border-b-2 flex items-center gap-2",
                  activeProfileTab === "invoices"
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                )}
              >
                <DollarSign className="w-4 h-4" />
                Invoices ({customerDetails?.invoices.length || 0})
              </button>
            </div>

            {/* TAB CONTENT: QUOTATIONS */}
            {activeProfileTab === "quotations" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.quotations || customerDetails.quotations.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <FileText className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No commercial quotations created yet for this customer</p>
                    <p className="text-xs text-stone-400 mt-1">Start building proposals and track quotation statuses directly from this profile.</p>
                    <div className="flex justify-center mt-4">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setShowCreateQuoModal(true)}
                      >
                        + Create First Quotation
                      </Button>
                    </div>
                  </div>
                ) : (
                  customerDetails.quotations.map((q) => (
                    <div
                      key={q.id}
                      className="p-4 bg-white border border-stone-200/90 rounded-2xl hover:border-stone-300 transition-all flex items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-stone-900 bg-stone-100 px-2 py-0.5 rounded">
                            {q.quotation_number}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded",
                              q.status === "APPROVED"
                                ? "bg-emerald-100 text-emerald-700"
                                : q.status === "PENDING"
                                ? "bg-amber-100 text-amber-700"
                                : q.status === "REVISION"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-stone-100 text-stone-600"
                            )}
                          >
                            {q.status}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-stone-900">{q.title}</div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-3">
                          <span>Items: {q.items?.length || 0} lines</span>
                          <span>•</span>
                          <span>Created: {new Date(q.created_at).toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-black font-mono text-stone-900">
                          {formatIDR(q.amount)}
                        </div>
                        <Button
                          size="xs"
                          variant="secondary"
                          onClick={() => setSelectedQuoToPreview(q)}
                          className="mt-2 flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Preview Document
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: DELIVERIES */}
            {activeProfileTab === "deliveries" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.deliveries || customerDetails.deliveries.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <Receipt className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No delivery notes recorded</p>
                  </div>
                ) : (
                  customerDetails.deliveries.map((dn) => (
                    <div
                      key={dn.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-2xl flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-stone-900">{dn.dn_number}</div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          Date: {new Date(dn.created_at).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full",
                          dn.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {dn.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB CONTENT: INVOICES */}
            {activeProfileTab === "invoices" && (
              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {(!customerDetails?.invoices || customerDetails.invoices.length === 0) ? (
                  <div className="py-12 text-center text-stone-400 border border-dashed border-stone-200 rounded-2xl">
                    <DollarSign className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No commercial invoices generated</p>
                  </div>
                ) : (
                  customerDetails.invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-2xl flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-mono font-bold text-stone-900">{inv.invoice_number}</div>
                        <div className="text-[11px] font-mono text-stone-600 font-bold mt-0.5">
                          {formatIDR(inv.total_amount)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest rounded-full",
                          inv.status === "PAID"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {inv.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* CREATE QUOTATION MODAL FROM CUSTOMER PROFILE */}
      {selectedProfileCustomer && (
        <CreateQuotationModal
          isOpen={showCreateQuoModal}
          onClose={() => setShowCreateQuoModal(false)}
          initialCustomerId={selectedProfileCustomer.id}
          onSuccess={() => {
            setShowCreateQuoModal(false);
            showToast("Quotation successfully created for " + selectedProfileCustomer.name, "success");
            fetchCustomerDetails(selectedProfileCustomer.id);
            fetchCustomersAndLeads();
          }}
        />
      )}

      {/* PREVIEW QUOTATION MODAL */}
      {selectedQuoToPreview && (
        <QuotationPreviewModal
          isOpen={selectedQuoToPreview !== null}
          onClose={() => setSelectedQuoToPreview(null)}
          quotation={selectedQuoToPreview}
        />
      )}
    </div>
  );
}
