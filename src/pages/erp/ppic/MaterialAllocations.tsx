import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  PackageCheck,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { WarehouseReservationsTab } from "@/components/erp/inventory/ReservationsTab";
import { cn } from "@/lib/utils";

export default function MaterialAllocations() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [reservations, setReservations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const fetchReservations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(
        "/api/inventory/reservations",
        {},
        user?.username
      );
      if (res.ok) {
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        setReservations(list);
      } else {
        showToast(res.error || "Failed to load material reservations", "error");
      }
    } catch (err) {
      console.error("Failed to fetch reservations:", err);
      showToast("Failed to load material reservations", "error");
    } finally {
      setIsLoading(false);
    }
  }, [user?.username, showToast]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  const handleAllocateReservation = useCallback(
    async (reservationId: string) => {
      try {
        const res = await apiFetch(
          `/api/warehouse/reservations/${reservationId}/allocate`,
          {
            method: "POST",
            body: JSON.stringify({
              recorded_by: user?.username || "PPIC_PLANNER",
            }),
          },
          user?.username
        );
        if (res.ok && res.data?.ok) {
          showToast(
            res.data.message || "Free stock allocated to project reservation",
            "success"
          );
          fetchReservations();
        } else {
          showToast(
            res.error || res.data?.error || "Failed to allocate free stock",
            "error"
          );
        }
      } catch (err: any) {
        showToast(err.message || "Error allocating reservation", "error");
      }
    },
    [fetchReservations, showToast, user?.username]
  );

  const enrichedReservations = useMemo(() => {
    return reservations.map((r: any) => {
      const reqQty = Number(r.required_qty ?? r.qty ?? 0);
      const lockedQty = Number(r.reserved_qty ?? r.qty ?? 0);
      const shortageQty = Math.max(
        0,
        Number(r.shortage_qty ?? reqQty - lockedQty)
      );
      const isShortage =
        r.status === "SHORTAGE" || r.status === "PARTIAL" || shortageQty > 0;
      return {
        ...r,
        item_name: r.item_name || r.name || "Material Item",
        required_qty: reqQty,
        reserved_qty: lockedQty,
        shortage_qty: shortageQty,
        isShortage,
      };
    });
  }, [reservations]);

  const filteredReservations = useMemo(() => {
    return enrichedReservations.filter((r: any) => {
      if (statusFilter === "SHORTAGE" && !r.isShortage) return false;
      if (statusFilter === "RESERVED" && r.isShortage) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const mProj = String(r.project_name || r.project_id || "")
          .toLowerCase()
          .includes(q);
        const mSpk = String(r.spk_id || "").toLowerCase().includes(q);
        const mCode = String(r.item_code || "").toLowerCase().includes(q);
        const mName = String(r.item_name || "").toLowerCase().includes(q);
        if (!mProj && !mSpk && !mCode && !mName) return false;
      }
      return true;
    });
  }, [enrichedReservations, statusFilter, searchQuery]);

  const shortageCount = useMemo(
    () => enrichedReservations.filter((r: any) => r.isShortage).length,
    [enrichedReservations]
  );
  const fullyReservedCount = useMemo(
    () => enrichedReservations.filter((r: any) => !r.isShortage).length,
    [enrichedReservations]
  );

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title="Material Allocations"
        subtitle="Project BOM reservations & stock allocation"
        icon={<PackageCheck className="w-5 h-5" />}
        actions={
          <Button
            size="icon-sm"
            variant="secondary"
            onClick={fetchReservations}
            disabled={isLoading}
            title="Refresh Allocations"
          >
            <RefreshCw
              className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
            />
          </Button>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <StatCard
          label="Total Reservations"
          value={enrichedReservations.length}
          subtitle="Project material lines tracked"
          icon={<PackageCheck className="w-4 h-4" />}
        />
        <StatCard
          label="100% Reserved"
          value={fullyReservedCount}
          subtitle="Ready for shop floor execution"
          icon={<CheckCircle2 className="w-4 h-4" />}
          variant="success"
        />
        <StatCard
          label="Shortage / Partial"
          value={shortageCount}
          subtitle="Requires stock allocation or PR/PO intake"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant={shortageCount > 0 ? "warning" : "default"}
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="flex-1 max-w-md">
              <Input
                type="text"
                placeholder="Search project, WO number, SKU code, or item name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5" />}
              />
            </div>
            <div className="w-full sm:w-52">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={[
                  { value: "ALL", label: "All Statuses" },
                  { value: "RESERVED", label: "100% Reserved" },
                  { value: "SHORTAGE", label: "Shortage / Partial" },
                ]}
              />
            </div>
          </div>

          {(searchQuery || statusFilter !== "ALL") && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("ALL");
              }}
              leftIcon={<X className="w-3.5 h-3.5" />}
            >
              Reset
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-500">
            <RefreshCw className="w-5 h-5 animate-spin text-stone-400" />
            <span className="text-xs font-medium">
              Loading project material allocations...
            </span>
          </div>
        ) : (
          <WarehouseReservationsTab
            reservations={filteredReservations}
            onAllocateReservation={handleAllocateReservation}
          />
        )}
      </div>
    </div>
  );
}
