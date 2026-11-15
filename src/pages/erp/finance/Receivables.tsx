import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import {
  Clock,
  Send,
  MessageSquare,
  RefreshCw,
  Search,
  Phone,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
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

interface AgingInvoice {
  id: string;
  ci_number: string;
  dn_number?: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  grand_total: number;
  amount_paid: number;
  outstanding_amount: number;
  days_overdue: number;
  due_date: string;
  aging_bucket:
    | "CURRENT"
    | "1-30_DAYS"
    | "31-60_DAYS"
    | "61-90_DAYS"
    | "OVER_90_DAYS";
  dunning_level:
    | "NORMAL_REMINDER"
    | "FIRST_NOTICE"
    | "SECOND_WARNING"
    | "LEGAL_PRE_NOTICE"
    | "CREDIT_HOLD_LEGAL"
    | "NONE";
  payment_terms: string;
  created_at: string;
}

export default function ReceivablesAging() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [agingData, setAgingData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBucket, setSelectedBucket] = useState("ALL");
  const [selectedInvoiceForDunning, setSelectedInvoiceForDunning] =
    useState<AgingInvoice | null>(null);
  const [customDunningMessage, setCustomDunningMessage] = useState("");

  const fetchAgingData = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/finance/ar-aging", {}, user?.username);
      if (res.ok && res.data) {
        setAgingData(res.data);
      } else {
        showToast("Failed to load receivables aging data", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAgingData();
  }, []);

  const openDunningModal = (inv: AgingInvoice) => {
    setSelectedInvoiceForDunning(inv);
    let defaultMsg = "";
    if (inv.dunning_level === "NORMAL_REMINDER") {
      defaultMsg = `Dear ${inv.customer_name || "Valued Customer"},\n\nThis is a friendly reminder regarding Invoice ${inv.ci_number} for the amount of ${formatIDR(inv.outstanding_amount)}, due on ${inv.due_date}. Please let us know when payment is scheduled. Thank you.`;
    } else if (inv.dunning_level === "FIRST_NOTICE") {
      defaultMsg = `FIRST NOTICE: Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} for ${formatIDR(inv.outstanding_amount)} is now ${inv.days_overdue} days past due. We kindly request that you settle this invoice at your earliest convenience.`;
    } else if (inv.dunning_level === "SECOND_WARNING") {
      defaultMsg = `URGENT NOTICE (CREDIT SUSPENSION WARNING): Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} is now ${inv.days_overdue} days past due with an outstanding balance of ${formatIDR(inv.outstanding_amount)}. New purchase orders may be placed on hold until settled. Please contact our finance department immediately.`;
    } else {
      defaultMsg = `FINAL NOTICE / LEGAL ESCALATION: Dear ${inv.customer_name || "Valued Customer"},\n\nInvoice ${inv.ci_number} is significantly past due (${inv.days_overdue} days) for ${formatIDR(inv.outstanding_amount)}. This account is subject to legal escalation. Please resolve immediately.`;
    }
    setCustomDunningMessage(defaultMsg);
  };

  const handleSendWhatsApp = () => {
    if (!selectedInvoiceForDunning) return;
    const phone = selectedInvoiceForDunning.customer_phone?.replace(
      /[^0-9]/g,
      ""
    );
    if (!phone) {
      showToast("Customer contact number is not provided", "error");
      return;
    }
    const cleanPhone = phone.startsWith("0")
      ? "62" + phone.substring(1)
      : phone;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(customDunningMessage)}`;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Opened WhatsApp Web for notice dispatch", "info");
    setSelectedInvoiceForDunning(null);
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(customDunningMessage);
    showToast("Notice message copied to clipboard", "success");
  };

  const filteredInvoices: AgingInvoice[] = (agingData?.invoices || []).filter(
    (inv: AgingInvoice) => {
      const matchesBucket =
        selectedBucket === "ALL" || inv.aging_bucket === selectedBucket;
      const matchesSearch =
        inv.ci_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customer_name || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (inv.dn_number || "").toLowerCase().includes(searchTerm.toLowerCase());
      return matchesBucket && matchesSearch;
    }
  );

  const totalReceivables =
    (agingData?.buckets?.current || 0) +
    (agingData?.buckets?.days_1_30 || 0) +
    (agingData?.buckets?.days_31_60 || 0) +
    (agingData?.buckets?.days_61_90 || 0) +
    (agingData?.buckets?.days_over_90 || 0);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title="Accounts Receivable Aging"
        subtitle="Invoice aging summary"
        icon={<Clock className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                Total Outstanding
              </div>
              <div className="text-sm font-bold font-mono text-stone-900 tabular-nums">
                {formatIDR(totalReceivables)}
              </div>
            </div>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={fetchAgingData}
              disabled={isLoading}
              title="Refresh Receivables"
              aria-label="Refresh Receivables"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
        <div className="w-full sm:max-w-md">
          <Input
            type="text"
            placeholder="Search invoice number, customer name, or delivery note..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="w-full sm:w-64">
          <Select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
          >
            <option value="ALL">All Aging Buckets</option>
            <option value="CURRENT">Current (Not Due)</option>
            <option value="1-30_DAYS">1 – 30 Days Past Due</option>
            <option value="31-60_DAYS">31 – 60 Days Past Due</option>
            <option value="61-90_DAYS">61 – 90 Days Past Due</option>
            <option value="OVER_90_DAYS">90+ Days Past Due (Critical)</option>
          </Select>
        </div>
      </div>

      {/* Table of Receivables Invoices */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice & DN</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Invoice Amount</TableHead>
              <TableHead className="text-right">Balance Due</TableHead>
              <TableHead className="text-center">Aging Status</TableHead>
              <TableHead className="text-center">Notice Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableEmpty
                colSpan={7}
                message="No outstanding invoices found matching the current criteria."
              />
            ) : (
              filteredInvoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <div className="font-mono tabular-nums font-semibold text-stone-900">
                      {inv.ci_number}
                    </div>
                    <div className="text-[11px] text-stone-400 font-mono tabular-nums mt-0.5">
                      DN: {inv.dn_number || "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-stone-800">
                      {inv.customer_name || inv.customer_id}
                    </div>
                    {inv.customer_phone && (
                      <div className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5 font-mono tabular-nums">
                        <Phone className="w-2.5 h-2.5" />
                        <span>{inv.customer_phone}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono tabular-nums text-stone-700">
                      {inv.due_date}
                    </div>
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {inv.payment_terms || "Net 30"}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-stone-600 tabular-nums">
                    {formatIDR(inv.grand_total)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold text-stone-900 tabular-nums">
                    {formatIDR(inv.outstanding_amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {inv.days_overdue <= 0 ? (
                      <Badge variant="success" size="sm">
                        Current
                      </Badge>
                    ) : (
                      <Badge
                        variant={inv.days_overdue > 60 ? "danger" : "warning"}
                        size="sm"
                      >
                        +{inv.days_overdue}d Overdue
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => openDunningModal(inv)}
                      leftIcon={<MessageSquare className="w-3 h-3" />}
                    >
                      Send Notice
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* MODAL: DUNNING NOTICE */}
      {selectedInvoiceForDunning && (
        <Modal
          isOpen={!!selectedInvoiceForDunning}
          onClose={() => setSelectedInvoiceForDunning(null)}
          title={`Dunning Notice: ${selectedInvoiceForDunning.ci_number}`}
          maxWidth="xl"
          footer={
            <div className="flex flex-wrap justify-between items-center gap-2 w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyMessage}
                leftIcon={<Copy className="w-3.5 h-3.5" />}
              >
                Copy Text
              </Button>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInvoiceForDunning(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSendWhatsApp}
                  leftIcon={<Send className="w-3.5 h-3.5" />}
                >
                  Dispatch via WhatsApp
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 text-xs space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-stone-500">Customer:</span>
                <span className="font-semibold text-stone-800 text-right">
                  {selectedInvoiceForDunning.customer_name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-stone-500">Outstanding Balance:</span>
                <span className="font-mono font-bold text-stone-900 tabular-nums">
                  {formatIDR(selectedInvoiceForDunning.outstanding_amount)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-stone-500">Dunning Tier:</span>
                <span className="font-medium text-stone-700 font-mono">
                  {selectedInvoiceForDunning.dunning_level}
                </span>
              </div>
            </div>

            <Textarea
              label="Notice Message Content"
              rows={5}
              value={customDunningMessage}
              onChange={(e) => setCustomDunningMessage(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

