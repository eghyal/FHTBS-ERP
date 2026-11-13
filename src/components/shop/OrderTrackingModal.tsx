import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Send,
  Package,
  Printer,
  RotateCcw,
  UploadCloud,
  Copy,
  Check,
  RefreshCw,
  MapPin,
  CreditCard,
  FileText,
  ShoppingBag,
} from "lucide-react";
import { formatIDR } from "@/lib/utils";
import { generatePDF } from "@/lib/pdfGenerator";

interface OrderTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrderNumber?: string;
  customer?: any | null;
  orders?: any[];
  isLoadingOrders?: boolean;
  onRefreshOrders?: () => void;
  onBuyAgain?: (order: any) => void;
  onOrderLinked?: (order: any) => void;
}

type OrderFilterTab = "ALL" | "UNPAID" | "ACTIVE" | "COMPLETED";

export function OrderTrackingModal({
  isOpen,
  onClose,
  initialOrderNumber,
  customer,
  orders = [],
  isLoadingOrders = false,
  onRefreshOrders,
  onBuyAgain,
  onOrderLinked,
}: OrderTrackingModalProps) {
  const [activeTab, setActiveTab] = useState<OrderFilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState(initialOrderNumber || "");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Per-order payment confirmation state keyed by order_number
  const [paymentRefInputs, setPaymentRefInputs] = useState<Record<string, string>>({});
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [uploadingOrderNum, setUploadingOrderNum] = useState<string | null>(null);
  const [submittingOrderNum, setSubmittingOrderNum] = useState<string | null>(null);
  const [paymentFeedback, setPaymentFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});

  // Copy states
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // PDF Printing state
  const [printingOrder, setPrintingOrder] = useState<any | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const invoicePrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialOrderNumber) {
      setSearchQuery(initialOrderNumber);
      setActiveTab("ALL");
    }
  }, [initialOrderNumber]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  // Filter customer orders by tab and search query
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // Tab filtering
      if (activeTab === "UNPAID") {
        const isUnpaid =
          ord.payment_status !== "PAID" &&
          ord.order_status !== "COMPLETED" &&
          ord.order_status !== "DISPATCHED";
        if (!isUnpaid) return false;
      } else if (activeTab === "ACTIVE") {
        const isActive =
          ord.order_status === "PAYMENT_SUBMITTED" ||
          ord.order_status === "PROCESSING" ||
          ord.order_status === "DISPATCHED" ||
          (ord.payment_status === "PAID" && ord.order_status !== "COMPLETED");
        if (!isActive) return false;
      } else if (activeTab === "COMPLETED") {
        if (ord.order_status !== "COMPLETED") return false;
      }

      // Search query filtering
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const matchOrderNum = String(ord.order_number || "")
        .toLowerCase()
        .includes(q);
      const matchCity = String(ord.delivery_city || "")
        .toLowerCase()
        .includes(q);
      const matchItems =
        Array.isArray(ord.items) &&
        ord.items.some(
          (it: any) =>
            String(it.item_name || "")
              .toLowerCase()
              .includes(q) ||
            String(it.item_code || "")
              .toLowerCase()
              .includes(q)
        );

      return matchOrderNum || matchCity || matchItems;
    });
  }, [orders, activeTab, searchQuery]);

  if (!isOpen) return null;

  // Lookup specific order number on server if not already in the local list
  const handleManualOrderLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = searchQuery.trim();
    if (!cleanCode || isLookingUp) return;

    // If already present in orders list, just keep it filtered
    const alreadyExists = orders.some(
      (o) => String(o.order_number || "").toLowerCase() === cleanCode.toLowerCase()
    );
    if (alreadyExists) {
      setLookupError(null);
      return;
    }

    setIsLookingUp(true);
    setLookupError(null);
    try {
      const res = await fetch(`/api/shop/orders/${encodeURIComponent(cleanCode)}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(
          json.error || "Pesanan dengan nomor referensi tersebut tidak ditemukan."
        );
      }
      if (onOrderLinked) {
        onOrderLinked(json.data);
      }
    } catch (err: any) {
      setLookupError(err.message || "Gagal mencari nomor pesanan.");
    } finally {
      setIsLookingUp(false);
    }
  };

  // Upload transfer receipt proof
  const handleProofFileUpload = (
    orderNumber: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingOrderNum(orderNumber);
    setPaymentFeedback((prev) => {
      const next = { ...prev };
      delete next[orderNumber];
      return next;
    });

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setUploadingOrderNum(null);
        setPaymentFeedback((prev) => ({
          ...prev,
          [orderNumber]: {
            type: "error",
            message: "Gagal membaca berkas bukti pembayaran.",
          },
        }));
        return;
      }

      try {
        const res = await fetch("/api/upload/base64", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataUrl,
            filename: file.name,
            prefix: "proof",
          }),
        });
        const json = await res.json();
        if (json.success && json.url) {
          setProofUrls((prev) => ({ ...prev, [orderNumber]: json.url }));
        } else {
          setProofUrls((prev) => ({ ...prev, [orderNumber]: dataUrl }));
        }
      } catch {
        // Fallback to Data URL directly
        setProofUrls((prev) => ({ ...prev, [orderNumber]: dataUrl }));
      } finally {
        setUploadingOrderNum(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit payment confirmation & proof for a specific order
  const handleConfirmOrderPayment = async (order: any, e: React.FormEvent) => {
    e.preventDefault();
    const orderNum = order.order_number;
    const refText = (paymentRefInputs[orderNum] ?? order.payment_ref ?? "").trim();
    const proofUrl = proofUrls[orderNum] || order.payment_proof_url || null;

    if (!refText && !proofUrl) {
      setPaymentFeedback((prev) => ({
        ...prev,
        [orderNum]: {
          type: "error",
          message: "Mohon isi referensi transfer atau unggah bukti pembayaran.",
        },
      }));
      return;
    }

    setSubmittingOrderNum(orderNum);
    setPaymentFeedback((prev) => {
      const next = { ...prev };
      delete next[orderNum];
      return next;
    });

    try {
      const res = await fetch(
        `/api/shop/orders/${encodeURIComponent(orderNum)}/confirm-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payment_ref:
              refText ||
              `Bukti transfer diunggah oleh ${customer?.customer_name || order.customer_name}`,
            payment_proof_url: proofUrl,
            sender_name: customer?.customer_name || order.customer_name,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Gagal menyimpan konfirmasi pembayaran.");
      }

      setPaymentFeedback((prev) => ({
        ...prev,
        [orderNum]: {
          type: "success",
          message:
            "Konfirmasi pembayaran & bukti transfer berhasil dikirim. Tim Finance sedang memverifikasi.",
        },
      }));

      if (json.data && onOrderLinked) {
        onOrderLinked(json.data);
      }
      if (onRefreshOrders) {
        onRefreshOrders();
      }
    } catch (err: any) {
      setPaymentFeedback((prev) => ({
        ...prev,
        [orderNum]: {
          type: "error",
          message: err.message || "Gagal mengirim bukti pembayaran.",
        },
      }));
    } finally {
      setSubmittingOrderNum(null);
    }
  };

  // Generate & download PDF Invoice for a specific order
  const handlePrintInvoicePdf = async (order: any) => {
    if (isGeneratingPdf) return;
    setPrintingOrder(order);
    setIsGeneratingPdf(true);

    // Wait a tick for hidden invoice DOM to render with the selected order
    setTimeout(async () => {
      try {
        if (invoicePrintRef.current) {
          await generatePDF(
            invoicePrintRef.current,
            `Invoice-${order.order_number}.pdf`,
            { format: "a4" }
          );
        }
      } catch (err) {
        console.error("Failed to generate Invoice PDF:", err);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 150);
  };

  // 4-step delivery progress helper
  const getStepStatus = (order: any, step: string) => {
    const status = order.order_status;
    const stages = ["PENDING_PAYMENT", "PROCESSING", "DISPATCHED", "COMPLETED"];
    const normalizedStatus =
      status === "PAYMENT_SUBMITTED" ? "PROCESSING" : status;
    const currentIndex = stages.indexOf(normalizedStatus);
    const stepIndex = stages.indexOf(step);

    if (step === "PENDING_PAYMENT") return "done";
    if (order.payment_status === "PAID" && step === "PROCESSING" && currentIndex < 1) {
      return "active";
    }
    if (currentIndex >= stepIndex) return "done";
    if (currentIndex === stepIndex - 1) return "active";
    return "pending";
  };

  const getPaymentBadge = (order: any) => {
    if (order.payment_status === "PAID") {
      return {
        label: Number(order.is_dp) === 1 ? "DP 50% Terverifikasi" : "Lunas",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
    if (
      order.payment_status === "AWAITING_VERIFICATION" ||
      order.order_status === "PAYMENT_SUBMITTED" ||
      order.payment_proof_url
    ) {
      return {
        label: "Menunggu Verifikasi Finance",
        className: "bg-sky-50 text-sky-700 border-sky-200",
      };
    }
    if (order.payment_method === "COD") {
      return {
        label: "COD (Bayar di Tempat)",
        className: "bg-stone-100 text-stone-700 border-stone-300",
      };
    }
    return {
      label: Number(order.is_dp) === 1 ? "Menunggu DP 50%" : "Menunggu Pembayaran",
      className: "bg-amber-50 text-amber-800 border-amber-200",
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-950/55 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Hidden A4 Commercial Invoice Template for PDF Generation */}
      {printingOrder && (
        <div style={{ position: "fixed", left: "-9999px", top: "-9999px" }}>
          <div
            ref={invoicePrintRef}
            className="w-[794px] bg-white p-12 text-stone-900 font-sans"
            style={{ minHeight: "1123px", boxSizing: "border-box" }}
          >
            {/* Header */}
            <div className="flex justify-between items-start pb-8 border-b-2 border-stone-200">
              <div className="flex items-start gap-4">
                <img
                  src="/logo.png"
                  alt="Paving Joss Logo"
                  className="w-14 h-14 object-contain shrink-0"
                />
                <div>
                  <h1 className="text-2xl font-black text-stone-900 tracking-tight">
                    CV. BATU EMAS GROUP
                  </h1>
                  <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-1">
                    Produsen Paving Block &amp; Beton Precast SNI &bull; Paving Joss
                  </p>
                  <div className="text-[11px] text-stone-500 mt-2 space-y-0.5 leading-relaxed font-medium">
                    <div>Dusun Petahunan, Gambiran, Banyuwangi, Jawa Timur 68486</div>
                    <div>Telepon / WhatsApp: +62 811-1111-3993</div>
                    <div>Email: pavingjoss@gmail.com</div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-extrabold text-[#b02524] tracking-tight">
                  INVOICE PESANAN RESMI
                </h2>
                <div className="text-[11px] text-stone-500 mt-2 space-y-1 font-medium">
                  <div>
                    No. Pesanan:{" "}
                    <span className="font-mono font-bold text-stone-900">
                      {printingOrder.order_number}
                    </span>
                  </div>
                  <div>
                    Tanggal Order:{" "}
                    {printingOrder.created_at
                      ? new Date(printingOrder.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      : new Date().toLocaleDateString("id-ID")}
                  </div>
                  <div>
                    Metode Pembayaran:{" "}
                    {printingOrder.payment_method === "TRANSFER_MANUAL"
                      ? "Transfer Bank BCA"
                      : printingOrder.payment_method === "QRIS"
                      ? "QRIS Resmi"
                      : "COD"}
                  </div>
                  <div>
                    Status Pembayaran:{" "}
                    <span className="font-bold text-stone-900">
                      {printingOrder.payment_status === "PAID"
                        ? "LUNAS TERVERIFIKASI"
                        : printingOrder.payment_status === "AWAITING_VERIFICATION"
                        ? "MENUNGGU VERIFIKASI FINANCE"
                        : "MENUNGGU PEMBAYARAN"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer & Delivery Details */}
            <div className="grid grid-cols-2 gap-8 py-8 border-b border-stone-200 text-xs">
              <div>
                <h3 className="font-bold text-stone-400 uppercase tracking-widest text-[10px] mb-2">
                  DITAGIHKAN KEPADA
                </h3>
                <div className="space-y-1.5 font-medium text-stone-800">
                  <div className="text-stone-900 font-bold text-sm">
                    {printingOrder.customer_name}
                  </div>
                  <div>Telepon / WA: {printingOrder.customer_phone || "-"}</div>
                  <div>Email: {printingOrder.customer_email || customer?.email || "-"}</div>
                </div>
              </div>
              <div>
                <h3 className="font-bold text-stone-400 uppercase tracking-widest text-[10px] mb-2">
                  PENGIRIMAN &amp; LOGISTIK PABRIK
                </h3>
                <div className="space-y-1.5 font-medium text-stone-800">
                  <div>
                    Metode:{" "}
                    <span className="font-bold">
                      {printingOrder.delivery_method === "PICKUP"
                        ? "Ambil Sendiri di Pabrik"
                        : "Pengiriman Armada Pabrik"}
                    </span>
                  </div>
                  <div>
                    Tujuan: {printingOrder.delivery_address || printingOrder.delivery_city || "-"}
                  </div>
                  {printingOrder.tracking_number && (
                    <div>
                      No. Surat Jalan:{" "}
                      <span className="font-mono font-bold">
                        {printingOrder.tracking_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-8">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-300 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3 pr-4">KODE &amp; NAMA MATERIAL</th>
                    <th className="py-3 px-4 text-center">SATUAN</th>
                    <th className="py-3 px-4 text-right">VOLUME</th>
                    <th className="py-3 px-4 text-right">HARGA SATUAN</th>
                    <th className="py-3 pl-4 text-right">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800 font-medium">
                  {(printingOrder.items || []).map((it: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-3.5 pr-4">
                        <div className="font-bold text-stone-900">{it.item_name}</div>
                        <div className="text-[10px] font-mono text-stone-500">
                          {it.item_code || "-"}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">{it.uom}</td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {Number(it.qty || 0).toLocaleString("id-ID")}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                        {formatIDR(
                          it.unit_price ||
                            (it.total_price && it.qty ? it.total_price / it.qty : 0)
                        )}
                      </td>
                      <td className="py-3.5 pl-4 text-right font-mono tabular-nums font-bold text-stone-900">
                        {formatIDR(it.total_price || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end pt-6 border-t-2 border-stone-100">
              <div className="w-80 text-xs space-y-2.5">
                <div className="flex justify-between text-stone-600 font-medium">
                  <span>Subtotal Material:</span>
                  <span className="font-mono tabular-nums font-bold text-stone-800">
                    {formatIDR(
                      printingOrder.subtotal_amount ||
                        Number(printingOrder.total_amount || 0) -
                          Number(printingOrder.shipping_cost || 0)
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-stone-600 font-medium">
                  <span>Biaya Pengiriman Armada:</span>
                  <span className="font-mono tabular-nums font-bold text-stone-800">
                    {formatIDR(printingOrder.shipping_cost || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-stone-900 pt-2.5 border-t border-stone-200">
                  <span>TOTAL NILAI PESANAN:</span>
                  <span className="font-mono tabular-nums text-base font-black text-[#b02524]">
                    {formatIDR(printingOrder.total_amount || 0)}
                  </span>
                </div>
                {Number(printingOrder.is_dp) === 1 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5 mt-2">
                    <div className="flex justify-between font-bold text-amber-900">
                      <span>Uang Muka (DP 50%):</span>
                      <span className="font-mono tabular-nums">
                        {formatIDR(
                          printingOrder.dp_amount ||
                            Number(printingOrder.total_amount || 0) * 0.5
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-amber-800 font-medium pt-1.5 border-t border-amber-200/50">
                      <span>Sisa Pelunasan:</span>
                      <span className="font-mono tabular-nums">
                        {formatIDR(
                          Number(printingOrder.total_amount || 0) -
                            Number(
                              printingOrder.dp_amount ||
                                Number(printingOrder.total_amount || 0) * 0.5
                            )
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-stone-200 flex justify-between items-end">
              <div className="text-[10px] text-stone-400 font-medium leading-relaxed max-w-sm">
                * Dokumen ini diterbitkan secara resmi oleh sistem ERP CV. Batu Emas Group
                (Paving Joss) dan sah sebagai bukti transaksi pembelian material konstruksi.
              </div>
              <div className="flex gap-16 text-center text-xs">
                <div className="w-28 pb-16 border-b border-stone-300 font-medium text-stone-400">
                  Finance &amp; Logistik
                </div>
                <div className="w-28 pb-16 border-b border-stone-300 font-bold text-stone-800">
                  {printingOrder.customer_name}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Modal Window */}
      <div
        className="relative bg-[#faf9f6] rounded-2xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-stone-200 flex flex-col z-10 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-white px-4 sm:px-6 py-4 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-stone-900 tracking-tight truncate">
                  Pesanan Saya
                </h2>
                <span className="text-xs font-mono tabular-nums font-bold text-stone-500">
                  ({orders.length})
                </span>
              </div>
              <p className="text-xs text-stone-500 truncate">
                {customer
                  ? `${customer.customer_name} · ${customer.email || customer.phone || "Akun Terverifikasi"}`
                  : "Riwayat pembelian, progres pengiriman armada, dan dokumen invoice resmi"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefreshOrders && (
              <button
                type="button"
                onClick={onRefreshOrders}
                disabled={isLoadingOrders}
                className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl border border-stone-200/80 transition-colors cursor-pointer disabled:opacity-50"
                title="Muat Ulang Daftar Pesanan"
                aria-label="Muat Ulang Pesanan"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isLoadingOrders ? "animate-spin" : ""}`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition-colors cursor-pointer"
              aria-label="Tutup jendela pesanan"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Toolbar */}
        <div className="bg-white px-4 sm:px-6 py-3 border-b border-stone-200/80 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Segmented Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl overflow-x-auto scrollbar-none">
              {(
                [
                  { id: "ALL", label: "Semua", count: orders.length },
                  {
                    id: "UNPAID",
                    label: "Belum Bayar",
                    count: orders.filter(
                      (o) =>
                        o.payment_status !== "PAID" &&
                        o.order_status !== "COMPLETED" &&
                        o.order_status !== "DISPATCHED"
                    ).length,
                  },
                  {
                    id: "ACTIVE",
                    label: "Diproses & Dikirim",
                    count: orders.filter(
                      (o) =>
                        o.order_status === "PAYMENT_SUBMITTED" ||
                        o.order_status === "PROCESSING" ||
                        o.order_status === "DISPATCHED" ||
                        (o.payment_status === "PAID" &&
                          o.order_status !== "COMPLETED")
                    ).length,
                  },
                  {
                    id: "COMPLETED",
                    label: "Selesai",
                    count: orders.filter((o) => o.order_status === "COMPLETED")
                      .length,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === tab.id
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-600 hover:text-stone-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono tabular-nums text-stone-400">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search / Order Code Lookup */}
            <form
              onSubmit={handleManualOrderLookup}
              className="flex items-center gap-1.5 sm:w-64"
            >
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setLookupError(null);
                  }}
                  placeholder="Cari produk atau No. SO-..."
                  className="w-full pl-8 pr-7 py-1.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-stone-400 focus:outline-hidden"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setLookupError(null);
                    }}
                    className="absolute right-2 top-2 text-stone-400 hover:text-stone-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {searchQuery.trim().toUpperCase().startsWith("SO-") &&
                filteredOrders.length === 0 && (
                  <button
                    type="submit"
                    disabled={isLookingUp}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-xl shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    {isLookingUp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Tautkan"
                    )}
                  </button>
                )}
            </form>
          </div>

          {lookupError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}
        </div>

        {/* Scrollable Order Cards Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isLoadingOrders ? (
            <div className="space-y-4">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl border border-stone-200 p-5 animate-pulse space-y-4"
                >
                  <div className="flex justify-between">
                    <div className="h-4 bg-stone-100 rounded w-36" />
                    <div className="h-4 bg-stone-100 rounded w-24" />
                  </div>
                  <div className="h-12 bg-stone-100 rounded-xl w-full" />
                  <div className="h-16 bg-stone-100 rounded-xl w-full" />
                </div>
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/80 p-8 sm:p-10 text-center my-2">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-500 flex items-center justify-center mx-auto mb-3">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-stone-900">
                {orders.length === 0
                  ? "Belum Ada Riwayat Pesanan"
                  : "Tidak Ada Pesanan pada Filter Ini"}
              </h3>
              <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto leading-relaxed">
                {orders.length === 0
                  ? "Pesanan material beton dan paving block yang Anda beli akan otomatis tercatat dan dapat dipantau progres pengirimannya di halaman ini."
                  : "Coba ubah tab filter status atau kata kunci pencarian di atas."}
              </p>
              {searchQuery.trim() && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleManualOrderLookup()}
                    disabled={isLookingUp}
                    className="px-4 py-2 bg-[#b02524] hover:bg-[#961f1e] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    {isLookingUp ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>Cari No. Pesanan &ldquo;{searchQuery.trim()}&rdquo;</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredOrders.map((order) => {
              const badge = getPaymentBadge(order);
              const orderItems = Array.isArray(order.items) ? order.items : [];
              const orderDate = order.created_at
                ? new Date(order.created_at).toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "-";
              const currentRefVal =
                paymentRefInputs[order.order_number] ?? order.payment_ref ?? "";
              const currentProofUrl =
                proofUrls[order.order_number] || order.payment_proof_url || "";
              const feedback = paymentFeedback[order.order_number];

              return (
                <div
                  key={order.id || order.order_number}
                  className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs overflow-hidden transition-all"
                >
                  {/* 1. Card Top Header */}
                  <div className="px-4 sm:px-5 py-3.5 bg-stone-50/70 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums font-black text-stone-900 text-sm">
                        {order.order_number}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(order.order_number, `ord-${order.order_number}`)
                        }
                        className="p-1 text-stone-400 hover:text-stone-700 rounded-md hover:bg-stone-200/60 transition-colors cursor-pointer"
                        title="Salin Nomor Pesanan"
                      >
                        {copiedKey === `ord-${order.order_number}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <span aria-hidden="true" className="text-stone-300">
                        ·
                      </span>
                      <span className="text-stone-500 font-medium">{orderDate}</span>
                      <span aria-hidden="true" className="text-stone-300 hidden sm:inline">
                        ·
                      </span>
                      <span className="text-stone-600 font-semibold inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        {order.delivery_city || "Banyuwangi"} (
                        {order.delivery_method === "PICKUP"
                          ? "Ambil di Pabrik"
                          : "Kirim Armada"}
                        )
                      </span>
                    </div>

                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <div className="p-4 sm:p-5 space-y-5">
                    {/* 2. 4-Stage Delivery Progress Stepper */}
                    <div className="p-3.5 rounded-xl bg-stone-50/80 border border-stone-200/70">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-bold text-stone-600 uppercase tracking-wider">
                          Progres Pengiriman 4 Tahap
                        </span>
                        {order.tracking_number && (
                          <span className="text-[11px] font-mono tabular-nums font-bold text-stone-800">
                            Surat Jalan: {order.tracking_number}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center">
                        {[
                          {
                            key: "PENDING_PAYMENT",
                            label: "1. Pesanan Masuk",
                            icon: CheckCircle2,
                          },
                          {
                            key: "PROCESSING",
                            label: "2. Penyiapan Barang",
                            icon: Clock,
                          },
                          {
                            key: "DISPATCHED",
                            label: "3. Pengiriman Armada",
                            icon: Truck,
                          },
                          {
                            key: "COMPLETED",
                            label: "4. Selesai / Diterima",
                            icon: ShieldCheck,
                          },
                        ].map((st) => {
                          const stState = getStepStatus(order, st.key);
                          const IconComp = st.icon;
                          return (
                            <div
                              key={st.key}
                              className="flex flex-col items-center gap-1.5"
                            >
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                                  stState === "done"
                                    ? "bg-emerald-600 text-white"
                                    : stState === "active"
                                    ? "bg-[#b02524] text-white"
                                    : "bg-stone-200/80 text-stone-400"
                                }`}
                              >
                                <IconComp className="w-4 h-4" />
                              </div>
                              <span
                                className={`text-[10px] sm:text-[11px] font-bold leading-tight ${
                                  stState === "pending"
                                    ? "text-stone-400"
                                    : "text-stone-800"
                                }`}
                              >
                                {st.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {order.fleet_notes && (
                        <div className="mt-3 pt-2.5 border-t border-stone-200/70 flex items-center gap-2 text-xs text-stone-600">
                          <Truck className="w-3.5 h-3.5 text-[#b02524] shrink-0" />
                          <span>
                            Info Armada:{" "}
                            <strong className="text-stone-900">
                              {order.fleet_notes}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 3. Purchased Items List */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                        Detail Material yang Dibeli ({orderItems.length} Item)
                      </div>
                      <div className="divide-y divide-stone-100 border border-stone-200/80 rounded-xl overflow-hidden">
                        {orderItems.map((item: any, idx: number) => (
                          <div
                            key={item.id || idx}
                            className="p-3 bg-white flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-lg bg-stone-100 border border-stone-200/80 overflow-hidden shrink-0 flex items-center justify-center">
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt={item.item_name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <Package className="w-5 h-5 text-stone-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                                  {item.item_name}
                                </div>
                                <div className="text-[11px] text-stone-500 font-mono tabular-nums">
                                  {item.item_code ? `${item.item_code} · ` : ""}
                                  {Number(item.qty || 0).toLocaleString("id-ID")}{" "}
                                  {item.uom || "Unit"} ×{" "}
                                  {formatIDR(
                                    item.unit_price ||
                                      (item.total_price && item.qty
                                        ? item.total_price / item.qty
                                        : 0)
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-xs sm:text-sm font-black font-mono tabular-nums text-stone-900">
                                {formatIDR(item.total_price || 0)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Order Financial Totals Strip */}
                      <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/80 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-stone-600 space-y-0.5">
                          <div>
                            Subtotal Material:{" "}
                            <span className="font-mono tabular-nums font-bold text-stone-800">
                              {formatIDR(
                                order.subtotal_amount ||
                                  Number(order.total_amount || 0) -
                                    Number(order.shipping_cost || 0)
                              )}
                            </span>
                            {" · "}
                            Ongkir Armada:{" "}
                            <span className="font-mono tabular-nums font-bold text-stone-800">
                              {formatIDR(order.shipping_cost || 0)}
                            </span>
                          </div>
                          {Number(order.is_dp) === 1 && (
                            <div className="text-[11px] text-amber-800 font-semibold">
                              Opsi DP 50%:{" "}
                              <span className="font-mono tabular-nums font-bold">
                                {formatIDR(
                                  order.dp_amount ||
                                    Number(order.total_amount || 0) * 0.5
                                )}
                              </span>{" "}
                              (Sisa Pelunasan:{" "}
                              <span className="font-mono tabular-nums font-bold">
                                {formatIDR(
                                  Number(order.total_amount || 0) -
                                    Number(
                                      order.dp_amount ||
                                        Number(order.total_amount || 0) * 0.5
                                    )
                                )}
                              </span>
                              )
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                            Total Nilai Pesanan
                          </span>
                          <span className="text-base sm:text-lg font-black font-mono tabular-nums text-[#b02524]">
                            {formatIDR(order.total_amount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4. Payment Confirmation & Proof Upload Section (When not PAID and not COD) */}
                    {order.payment_status !== "PAID" &&
                      order.payment_method !== "COD" && (
                        <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <CreditCard className="w-4 h-4 text-[#b02524]" />
                              <span className="text-xs font-bold text-stone-900">
                                Konfirmasi Pembayaran &amp; Unggah Bukti Transfer
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs bg-white px-2.5 py-1 rounded-lg border border-stone-200">
                              <span className="text-stone-500 font-medium">
                                BCA:
                              </span>
                              <span className="font-mono tabular-nums font-bold text-stone-900">
                                8920-1111-3993
                              </span>
                              <span className="text-stone-400 text-[10px]">
                                (a.n. CV. Batu Emas Group)
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopy(
                                    "892011113993",
                                    `bca-${order.order_number}`
                                  )
                                }
                                className="text-[#b02524] hover:underline font-bold text-[11px] cursor-pointer ml-1"
                              >
                                {copiedKey === `bca-${order.order_number}`
                                  ? "Tersalin"
                                  : "Salin"}
                              </button>
                            </div>
                          </div>

                          {feedback && (
                            <div
                              className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                                feedback.type === "success"
                                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                                  : "bg-rose-50 border border-rose-200 text-rose-700"
                              }`}
                            >
                              {feedback.type === "success" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                              )}
                              <span>{feedback.message}</span>
                            </div>
                          )}

                          <form
                            onSubmit={(e) => handleConfirmOrderPayment(order, e)}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center"
                          >
                            {/* Reference Input */}
                            <div className="sm:col-span-6">
                              <input
                                type="text"
                                value={currentRefVal}
                                onChange={(e) =>
                                  setPaymentRefInputs((prev) => ({
                                    ...prev,
                                    [order.order_number]: e.target.value,
                                  }))
                                }
                                placeholder="Nama pengirim / No. Referensi Transfer BCA..."
                                className="w-full px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:border-stone-400 focus:outline-hidden"
                              />
                            </div>

                            {/* Upload Proof Button */}
                            <div className="sm:col-span-3">
                              <label className="w-full px-3 py-2 bg-white hover:bg-stone-100 border border-stone-200 rounded-xl text-xs font-bold text-stone-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                                {uploadingOrderNum === order.order_number ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                                    <span className="truncate">Mengunggah...</span>
                                  </>
                                ) : (
                                  <>
                                    <UploadCloud className="w-3.5 h-3.5 text-[#b02524] shrink-0" />
                                    <span className="truncate">
                                      {currentProofUrl
                                        ? "Ganti Bukti"
                                        : "Unggah Bukti"}
                                    </span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    handleProofFileUpload(order.order_number, e)
                                  }
                                  className="hidden"
                                />
                              </label>
                            </div>

                            {/* Submit Confirmation Button */}
                            <div className="sm:col-span-3">
                              <button
                                type="submit"
                                disabled={
                                  submittingOrderNum === order.order_number ||
                                  uploadingOrderNum === order.order_number
                                }
                                className="w-full px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                              >
                                {submittingOrderNum === order.order_number ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Send className="w-3.5 h-3.5" />
                                )}
                                <span>Kirim Bukti</span>
                              </button>
                            </div>
                          </form>

                          {currentProofUrl && (
                            <div className="flex items-center justify-between gap-3 pt-1 text-xs text-stone-600">
                              <div className="flex items-center gap-2">
                                <img
                                  src={currentProofUrl}
                                  alt="Bukti Transfer"
                                  className="w-9 h-9 rounded-lg object-cover border border-stone-300 bg-white"
                                />
                                <div>
                                  <span className="font-bold text-emerald-700 block text-[11px]">
                                    Lampiran Bukti Transfer Tersedia
                                  </span>
                                  {order.payment_ref && (
                                    <span className="text-[11px] text-stone-500">
                                      Ref: {order.payment_ref}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    {/* 5. Bottom Action Bar: Cetak Invoice PDF & Beli Lagi */}
                    <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2.5">
                      <div className="text-[11px] text-stone-500 font-medium flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-stone-400" />
                        <span>
                          Dokumen resmi CV. Batu Emas Group
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => handlePrintInvoicePdf(order)}
                          disabled={isGeneratingPdf}
                          className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl border border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50 text-stone-800 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {isGeneratingPdf &&
                          printingOrder?.order_number === order.order_number ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-500" />
                              <span>Mencetak PDF...</span>
                            </>
                          ) : (
                            <>
                              <Printer className="w-3.5 h-3.5 text-stone-600" />
                              <span>Cetak Invoice PDF</span>
                            </>
                          )}
                        </button>

                        {onBuyAgain && (
                          <button
                            type="button"
                            onClick={() => onBuyAgain(order)}
                            className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-[#b02524] hover:bg-[#961f1e] active:bg-[#7e1a19] text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Beli Lagi</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
