import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { ClosingReminderBanner } from "@/components/finance/ClosingReminderBanner";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatIDR } from "@/lib/utils";
import {
  BookOpen,
  Scale,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  Plus,
  Eye,
  X,
} from "lucide-react";
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

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  reference_type: string;
  reference_number: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  created_by: string;
  lines: Array<{
    id: string;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    memo?: string;
  }>;
}

interface Period {
  id: string;
  period_key: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "SOFT_LOCKED" | "HARD_CLOSED";
  locked_by?: string;
  locked_at?: string;
  closed_by?: string;
  closed_at?: string;
  notes?: string;
  journal_count: number;
  total_volume: number;
}

interface TrialBalanceItem {
  code: string;
  name: string;
  category: string;
  type: string;
  normal_balance: string;
  total_debit: number;
  total_credit: number;
  balance_debit: number;
  balance_credit: number;
}

interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  category: string;
  type?: string;
  normal_balance: "DEBIT" | "CREDIT";
  description?: string;
  net_balance?: number;
}

export default function GeneralLedger() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<"JOURNALS" | "TRIAL_BALANCE" | "PERIODS" | "COA">("JOURNALS");
  const [isLoading, setIsLoading] = useState(true);

  // Journals State
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);

  // Trial Balance State
  const [trialBalance, setTrialBalance] = useState<TrialBalanceItem[]>([]);
  const [trialSummary, setTrialSummary] = useState<any>({ total_debit: 0, total_credit: 0, is_balanced: true });
  const [tbPeriodKey, setTbPeriodKey] = useState<string>("ALL");

  // Accounting Periods State
  const [periods, setPeriods] = useState<Period[]>([]);
  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [selectedPeriodForStatus, setSelectedPeriodForStatus] = useState<Period | null>(null);
  const [newStatus, setNewStatus] = useState<"OPEN" | "SOFT_LOCKED" | "HARD_CLOSED">("SOFT_LOCKED");
  const [statusPin, setStatusPin] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Form New Period
  const [newPeriodKey, setNewPeriodKey] = useState("");
  const [newPeriodName, setNewPeriodName] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);

  // Chart of Accounts State
  const [coaList, setCoaList] = useState<ChartOfAccount[]>([]);
  const [coaCategoryFilter, setCoaCategoryFilter] = useState("ALL");

  const fetchJournals = async () => {
    try {
      const q = new URLSearchParams();
      if (filterType !== "ALL") q.append("type", filterType);
      if (searchTerm) q.append("search", searchTerm);
      const res = await apiFetch(`/api/finance/journals?${q.toString()}`, {}, user?.username);
      if (res.ok && res.data?.data) {
        setJournals(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchTrialBalance = async (targetPeriod: string = tbPeriodKey) => {
    try {
      const qs =
        targetPeriod && targetPeriod !== "ALL"
          ? `?period_key=${encodeURIComponent(targetPeriod)}`
          : "";
      const res = await apiFetch(`/api/finance/trial-balance${qs}`, {}, user?.username);
      if (res.ok && res.data?.data) {
        setTrialBalance(res.data.data);
        setTrialSummary(res.data.summary || {});
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchPeriods = async () => {
    try {
      const res = await apiFetch("/api/finance/periods", {}, user?.username);
      if (res.ok && res.data?.data) {
        setPeriods(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchCoa = async () => {
    try {
      const res = await apiFetch("/api/finance/chart-of-accounts", {}, user?.username);
      if (res.ok && res.data?.data) {
        setCoaList(res.data.data);
      }
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    await Promise.all([fetchJournals(), fetchTrialBalance(tbPeriodKey), fetchPeriods(), fetchCoa()]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [filterType]);

  useEffect(() => {
    fetchTrialBalance(tbPeriodKey);
  }, [tbPeriodKey]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJournals();
  };

  const userRoleUpper = String(user?.role || "").trim().toUpperCase();
  const isBodOrFc = ["BOD", "FC", "DIRECTOR"].includes(userRoleUpper);

  const handleUpdatePeriodStatus = async () => {
    if (!selectedPeriodForStatus) return;
    if (selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc) {
      showToast("Periode HARD_CLOSED hanya dapat dibuka kembali oleh BOD atau Finance Controller (FC).", "error");
      return;
    }
    if ((newStatus === "HARD_CLOSED" || newStatus === "OPEN" || selectedPeriodForStatus.status === "HARD_CLOSED") && !statusPin) {
      showToast("Daily authorization PIN is required for this action", "error");
      return;
    }
    if (selectedPeriodForStatus.status === "HARD_CLOSED" && statusNotes.trim().length < 10) {
      showToast("Alasan reopen periode HARD_CLOSED wajib diisi minimal 10 karakter.", "error");
      return;
    }

    setIsUpdatingStatus(true);
    try {
      const res = await apiFetch(
        `/api/finance/periods/${selectedPeriodForStatus.id}/status`,
        {
          method: "PUT",
          body: JSON.stringify({
            status: newStatus,
            pin: statusPin,
            notes: statusNotes,
            reopen_reason: statusNotes,
          }),
        },
        user?.username
      );

      if (res.ok) {
        showToast(`Period status updated to ${newStatus}`, "success");
        setSelectedPeriodForStatus(null);
        setStatusPin("");
        setStatusNotes("");
        fetchPeriods();
      } else {
        showToast(res.error || res.data?.error || "Failed to update period status", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodKey || !newPeriodName || !newStartDate || !newEndDate) {
      showToast("Please fill in all required fields", "error");
      return;
    }

    setIsCreatingPeriod(true);
    try {
      const res = await apiFetch(
        "/api/finance/periods",
        {
          method: "POST",
          body: JSON.stringify({
            period_key: newPeriodKey,
            period_name: newPeriodName,
            start_date: newStartDate,
            end_date: newEndDate,
          }),
        },
        user?.username
      );

      if (res.ok) {
        showToast("Accounting period created successfully", "success");
        setShowPeriodModal(false);
        setNewPeriodKey("");
        setNewPeriodName("");
        setNewStartDate("");
        setNewEndDate("");
        fetchPeriods();
      } else {
        showToast(res.data?.error || "Failed to create accounting period", "error");
      }
    } catch (e: any) {
      showToast(e.message || "Connection error", "error");
    } finally {
      setIsCreatingPeriod(false);
    }
  };

  const filteredCoa = coaList.filter((item) => {
    if (coaCategoryFilter === "ALL") return true;
    return item.category.toUpperCase() === coaCategoryFilter;
  });

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <PageHeader
        title="General Ledger & Accounting Periods"
        subtitle="Journals & trial balance"
        icon={<BookOpen className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={loadData}
              disabled={isLoading}
              title="Refresh General Ledger"
              aria-label="Refresh General Ledger"
              className="border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>

            <Link
              to="/book-closing"
              className="h-8 px-3 inline-flex items-center gap-1.5 bg-white hover:bg-stone-50 border border-stone-200/90 hover:border-stone-300 text-stone-700 hover:text-stone-900 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-stone-500" />
              <span>Book Closing</span>
            </Link>

            {["FC", "FINANCE", "BOD", "ADMIN"].includes(user?.role || "") && (
              <Button
                size="sm"
                onClick={() => setShowPeriodModal(true)}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                New Accounting Period
              </Button>
            )}
          </div>
        }
      />

      <ClosingReminderBanner compact />

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 space-x-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("JOURNALS")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "JOURNALS"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Journal Entries</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {journals.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("TRIAL_BALANCE")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "TRIAL_BALANCE"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Trial Balance</span>
        </button>

        <button
          onClick={() => setActiveTab("PERIODS")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "PERIODS"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Accounting Periods</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {periods.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("COA")}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === "COA"
              ? "border-stone-900 text-stone-900 font-semibold"
              : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Chart of Accounts</span>
          <span className="px-1.5 py-0.5 rounded text-[11px] bg-stone-100 text-stone-600 font-mono tabular-nums">
            {coaList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: JOURNAL ENTRIES */}
      {activeTab === "JOURNALS" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-stone-200 shadow-xs">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center gap-2 w-full sm:w-auto flex-1"
            >
              <div className="w-full max-w-md">
                <Input
                  type="text"
                  placeholder="Search entry number, reference, or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  leftIcon={<Search className="w-4 h-4" />}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm">
                Search
              </Button>
            </form>

            <div className="flex items-center gap-2 w-full sm:w-64">
              <Select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Transaction Types</option>
                <option value="COMMERCIAL_INVOICE">Sales Invoices (AR)</option>
                <option value="INVOICE_PAYMENT">Receivable Receipts</option>
                <option value="GRN">Goods Receipt Note (GRN)</option>
                <option value="PO_PAYMENT">Vendor PO Payments (AP)</option>
                <option value="PAYROLL">Payroll Disbursements</option>
                <option value="DELIVERY_NOTE">Cost of Goods Sold (DN)</option>
              </Select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry Number & Date</TableHead>
                  <TableHead>Source & Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    message="No journal entries found matching current filter."
                  />
                ) : (
                  journals.map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>
                        <div className="font-mono tabular-nums font-semibold text-stone-900">
                          {j.entry_number}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5 font-mono tabular-nums">
                          {new Date(j.entry_date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" size="sm">
                          {j.reference_type}
                        </Badge>
                        <div className="font-mono tabular-nums text-[11px] text-stone-500 mt-0.5">
                          {j.reference_number || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-sm">
                        <div className="text-stone-800 truncate">
                          {j.description}
                        </div>
                        <div className="text-[10px] text-stone-400 mt-0.5">
                          By: {j.created_by}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatIDR(j.total_debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatIDR(j.total_credit)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="success" size="sm">
                          {j.status || "POSTED"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setSelectedJournal(j)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: TRIAL BALANCE */}
      {activeTab === "TRIAL_BALANCE" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h3 className="font-semibold text-stone-900 text-sm">
                Trial Balance Summary
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">
                Verification of double-entry ledger balance across all active accounts
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
              <div>
                <label className="text-stone-400 block text-[11px] mb-0.5">Period Scope</label>
                <select
                  value={tbPeriodKey}
                  onChange={(e) => setTbPeriodKey(e.target.value)}
                  className="h-8 px-2.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-semibold text-stone-800 outline-none"
                >
                  <option value="ALL">ALL CUMULATIVE</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.period_key}>
                      {p.period_key} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-stone-400 block">Total Debits</span>
                <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
                  {formatIDR(trialSummary.total_debit || 0)}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block">Total Credits</span>
                <span className="font-mono font-bold text-stone-900 text-sm tabular-nums">
                  {formatIDR(trialSummary.total_credit || 0)}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block">Ledger Status</span>
                <Badge
                  variant={trialSummary.is_balanced ? "success" : "danger"}
                  size="sm"
                >
                  {trialSummary.is_balanced ? "Balanced" : "Unbalanced"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Normal Balance</TableHead>
                  <TableHead className="text-right">Debit Balance</TableHead>
                  <TableHead className="text-right">Credit Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialBalance.length === 0 ? (
                  <TableEmpty
                    colSpan={6}
                    message="No balances recorded in current ledger."
                  />
                ) : (
                  trialBalance.map((item) => (
                    <TableRow key={item.code}>
                      <TableCell className="font-mono tabular-nums font-semibold text-stone-900">
                        {item.code}
                      </TableCell>
                      <TableCell className="font-medium text-stone-800">
                        {item.name}
                      </TableCell>
                      <TableCell className="text-stone-500">
                        {item.category}
                      </TableCell>
                      <TableCell className="text-center font-mono text-[11px] text-stone-500">
                        {item.normal_balance}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {item.balance_debit > 0
                          ? formatIDR(item.balance_debit)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {item.balance_credit > 0
                          ? formatIDR(item.balance_credit)
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: ACCOUNTING PERIODS */}
      {activeTab === "PERIODS" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period Key</TableHead>
                  <TableHead>Period Name</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Transaction Volume</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    message="No accounting periods configured."
                  />
                ) : (
                  periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono tabular-nums font-semibold text-stone-900">
                        {p.period_key}
                      </TableCell>
                      <TableCell className="font-medium text-stone-800">
                        {p.period_name}
                      </TableCell>
                      <TableCell className="font-mono tabular-nums text-[11px] text-stone-500">
                        {p.start_date} to {p.end_date}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.status === "OPEN" && (
                          <Badge variant="success" size="sm">
                            <Unlock className="w-3 h-3 mr-1" />
                            OPEN
                          </Badge>
                        )}
                        {p.status === "SOFT_LOCKED" && (
                          <Badge variant="warning" size="sm">
                            <Lock className="w-3 h-3 mr-1" />
                            SOFT_LOCKED
                          </Badge>
                        )}
                        {p.status === "HARD_CLOSED" && (
                          <Badge variant="danger" size="sm">
                            <Lock className="w-3 h-3 mr-1" />
                            HARD_CLOSED
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-stone-600 tabular-nums">
                        {p.journal_count || 0}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                        {formatIDR(p.total_volume || 0)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => {
                            setSelectedPeriodForStatus(p);
                            setNewStatus(
                              p.status === "OPEN" ? "SOFT_LOCKED" : "OPEN"
                            );
                          }}
                        >
                          Change Status
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: CHART OF ACCOUNTS */}
      {activeTab === "COA" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-3.5 rounded-xl border border-stone-200 shadow-xs">
            <span className="text-xs font-semibold text-stone-700">
              Account Classification
            </span>
            <div className="flex items-center gap-1 text-xs">
              {["ALL", "ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map(
                (cat) => (
                  <Button
                    key={cat}
                    size="xs"
                    variant={coaCategoryFilter === cat ? "primary" : "ghost"}
                    onClick={() => setCoaCategoryFilter(cat)}
                  >
                    {cat}
                  </Button>
                )
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Normal Balance</TableHead>
                  <TableHead className="text-right">
                    Net Running Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCoa.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono tabular-nums font-semibold text-stone-900">
                      {a.code}
                    </TableCell>
                    <TableCell className="font-medium text-stone-800">
                      {a.name}
                      {a.description && (
                        <div className="text-[11px] text-stone-400 font-normal">
                          {a.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">
                        {a.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-stone-500 font-mono text-[11px]">
                      {a.type || "-"}
                    </TableCell>
                    <TableCell className="text-center font-mono text-[11px] text-stone-600">
                      {a.normal_balance}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-stone-900 tabular-nums">
                      {formatIDR(a.net_balance || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* MODAL: JOURNAL DETAIL */}
      {selectedJournal && (
        <Modal
          isOpen={!!selectedJournal}
          onClose={() => setSelectedJournal(null)}
          title={`Journal Entry: ${selectedJournal.entry_number}`}
          maxWidth="5xl"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedJournal(null)}
              >
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-stone-50 p-3 rounded-lg border border-stone-200">
              <div>
                <span className="text-stone-400 block text-[10px]">
                  Reference
                </span>
                <span className="font-mono tabular-nums font-medium text-stone-800">
                  {selectedJournal.reference_type}:{" "}
                  {selectedJournal.reference_number || "-"}
                </span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px]">Date</span>
                <span className="text-stone-800 font-mono tabular-nums">
                  {new Date(selectedJournal.entry_date).toLocaleDateString(
                    "en-US",
                    {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }
                  )}
                </span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-stone-400 block text-[10px]">
                  Description
                </span>
                <span className="text-stone-800">
                  {selectedJournal.description}
                </span>
              </div>
            </div>

            <div className="border border-stone-200 rounded-lg overflow-x-auto">
              <Table className="min-w-[540px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedJournal.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <div className="font-mono tabular-nums font-semibold text-stone-900">
                          {line.account_code} - {line.account_name}
                        </div>
                        {line.memo && (
                          <div className="text-[10px] text-stone-400">
                            {line.memo}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-stone-800">
                        {line.debit > 0 ? formatIDR(line.debit) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-stone-800">
                        {line.credit > 0 ? formatIDR(line.credit) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-stone-50 font-semibold text-stone-900">
                    <TableCell className="text-right text-[11px]">
                      Total
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatIDR(selectedJournal.total_debit)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatIDR(selectedJournal.total_credit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

          </div>
        </Modal>
      )}

      {/* MODAL: CHANGE PERIOD STATUS */}
      {selectedPeriodForStatus && (
        <Modal
          isOpen={!!selectedPeriodForStatus}
          onClose={() => setSelectedPeriodForStatus(null)}
          title={`Update Accounting Period: ${selectedPeriodForStatus.period_key}`}
          maxWidth="2xl"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPeriodForStatus(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc}
                onClick={handleUpdatePeriodStatus}
                isLoading={isUpdatingStatus}
              >
                Save Status
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="text-xs text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200">
              <div className="flex justify-between py-0.5">
                <span className="text-stone-400">Period Name:</span>
                <span className="font-medium text-stone-800">
                  {selectedPeriodForStatus.period_name}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-stone-400">Current Status:</span>
                <span className="font-semibold text-stone-800">
                  {selectedPeriodForStatus.status}
                </span>
              </div>
            </div>

            {selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                Periode ini sudah disegel (HARD_CLOSED). Pembukaan kembali hanya diizinkan oleh BOD atau Finance Controller (FC).
              </div>
            )}

            <Select
              label="New Period Status"
              value={newStatus}
              disabled={selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc}
              onChange={(e: any) => setNewStatus(e.target.value)}
            >
              {selectedPeriodForStatus.status !== "HARD_CLOSED" && (
                <option value="OPEN">OPEN (Normal Posting Active)</option>
              )}
              <option value="SOFT_LOCKED">
                SOFT_LOCKED (Reconciliation / Restrict New Postings)
              </option>
              <option value="HARD_CLOSED">
                HARD_CLOSED (Permanently Closed & Sealed)
              </option>
            </Select>

            {newStatus === "HARD_CLOSED" && selectedPeriodForStatus.status !== "HARD_CLOSED" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Hard-Close hanya akan berhasil dalam jendela Tgl 15–24 dan setelah 100% Required Items di modul{" "}
                <Link to={`/book-closing?period=${selectedPeriodForStatus.period_key}`} className="underline font-semibold">
                  Book Closing
                </Link>{" "}
                terverifikasi.
              </p>
            )}

            {(newStatus === "HARD_CLOSED" ||
              newStatus === "OPEN" ||
              selectedPeriodForStatus.status === "HARD_CLOSED") && (
              <Input
                label="Daily Authorization PIN"
                type="password"
                disabled={selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc}
                value={statusPin}
                onChange={(e) => setStatusPin(e.target.value)}
                placeholder="Enter 4-6 digit authorization PIN"
                className="font-mono"
              />
            )}

            <Textarea
              label={
                selectedPeriodForStatus.status === "HARD_CLOSED"
                  ? "Alasan Reopen Periode (Wajib min 10 karakter)"
                  : "Audit Notes"
              }
              rows={2}
              disabled={selectedPeriodForStatus.status === "HARD_CLOSED" && !isBodOrFc}
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="Reason for period status adjustment..."
            />

          </div>
        </Modal>
      )}

      {/* MODAL: CREATE NEW PERIOD */}
      {showPeriodModal && (
        <Modal
          isOpen={showPeriodModal}
          onClose={() => setShowPeriodModal(false)}
          title="Create Accounting Period"
          maxWidth="2xl"
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowPeriodModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-period-form"
                size="sm"
                isLoading={isCreatingPeriod}
              >
                Create Period
              </Button>
            </div>
          }
        >
          <form id="create-period-form" onSubmit={handleCreatePeriod} className="space-y-4">
            <Input
              label="Period Key (e.g. 2026-10)"
              type="text"
              required
              value={newPeriodKey}
              onChange={(e) => setNewPeriodKey(e.target.value)}
              placeholder="YYYY-MM"
              className="font-mono"
            />

            <Input
              label="Period Name"
              type="text"
              required
              value={newPeriodName}
              onChange={(e) => setNewPeriodName(e.target.value)}
              placeholder="e.g. October 2026 Fiscal Month"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Start Date"
                type="date"
                required
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
              />

              <Input
                label="End Date"
                type="date"
                required
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
            </div>

          </form>
        </Modal>
      )}
    </div>
  );
}
