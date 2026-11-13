import React from "react";
import { Search, UserCheck, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

interface PotentialCustomersFiltersProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  gradeFilter: string;
  onGradeChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  consentFilter: string;
  onConsentChange: (val: string) => void;
  selectedCount: number;
  onBulkScout: () => void;
  isBulkScouting: boolean;
  onBulkDelete: () => void;
}

export function PotentialCustomersFilters({
  searchQuery,
  onSearchChange,
  gradeFilter,
  onGradeChange,
  statusFilter,
  onStatusChange,
  consentFilter,
  onConsentChange,
  selectedCount,
  onBulkScout,
  isBulkScouting,
  onBulkDelete,
}: PotentialCustomersFiltersProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-white p-4 rounded-2xl border border-stone-200/80 shadow-2xs mb-6">
      <div className="flex-1 min-w-[260px]">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by customer name, phone, email, or company..."
          leftIcon={<Search className="w-4 h-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Select
          value={gradeFilter}
          onChange={(e) => onGradeChange(e.target.value)}
          aria-label="Filter by Grade"
          wrapperClassName="w-44"
        >
          <option value="ALL">All Grades</option>
          <option value="A">Grade A (High Priority)</option>
          <option value="B">Grade B (Medium)</option>
          <option value="C">Grade C (Standard)</option>
          <option value="D">Grade D (Unqualified)</option>
        </Select>

        <Select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Filter by Status"
          wrapperClassName="w-40"
        >
          <option value="ALL">All Statuses</option>
          <option value="NEW_INTENT">New Intent</option>
          <option value="SCOUTED">Profiled</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CONVERTED">Converted</option>
          <option value="DROPPED">Dropped</option>
        </Select>

        <Select
          value={consentFilter}
          onChange={(e) => onConsentChange(e.target.value)}
          aria-label="Filter by Consent"
          wrapperClassName="w-40"
        >
          <option value="ALL">All Consent</option>
          <option value="CONSENTED">Consented</option>
          <option value="NO_CONSENT">First-Party Only</option>
        </Select>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onBulkScout}
              isLoading={isBulkScouting}
              leftIcon={<UserCheck className="w-3.5 h-3.5" />}
            >
              Profile Selected ({selectedCount})
            </Button>
            <Button
              type="button"
              variant="danger_soft"
              size="sm"
              onClick={onBulkDelete}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Delete Profile ({selectedCount})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

