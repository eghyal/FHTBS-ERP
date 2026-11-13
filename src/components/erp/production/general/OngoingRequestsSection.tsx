import React from "react";
import {
  Archive,
  FileText,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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
import { Action, hasPermission } from "@/utils/pbac";
import { canUserApproveDepartment, getDepartmentLabel } from "@/constants/rbac";

export interface OngoingRequestsSectionProps {
  user: any;
  isLoading: boolean;
  filteredPrs: any[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  fetchPrs: () => void;
  handleArchiveFinishedPrs: () => void;
  handleViewPr: (prId: string) => void;
  shareToForum: (
    type: "PROJECT" | "PR" | "PO",
    id: string,
    title: string,
    description: string,
  ) => void;
  setSelectedPrToAuth: (pr: any) => void;
  setShowAuthorizeModal: (show: boolean) => void;
  setShowReviseModal: (show: boolean) => void;
  handleRevisePrSetup: (prId: string) => void;
  handleCancelPr: (id: string) => void;
  handleDeletePr: (id: string) => void;
}

export const OngoingRequestsSection = React.memo(
  function OngoingRequestsSection({
    user,
    isLoading,
    filteredPrs,
    searchQuery,
    setSearchQuery,
    fetchPrs,
    handleArchiveFinishedPrs,
    handleViewPr,
    shareToForum,
    setSelectedPrToAuth,
    setShowAuthorizeModal,
    setShowReviseModal,
    handleRevisePrSetup,
    handleCancelPr,
    handleDeletePr,
  }: OngoingRequestsSectionProps) {
    return (
      <section className="space-y-4">
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search PR, Department, Title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <Button
            variant="amber_soft"
            size="xs"
            onClick={handleArchiveFinishedPrs}
            leftIcon={<Archive className="w-3.5 h-3.5" />}
            title="Archive Finished Requests"
          >
            Archive Finished
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchPrs}
            title="Refresh List"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <div className="bg-white border border-stone-200/80 rounded-2xl overflow-hidden shadow-2xs min-w-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableEmpty colSpan={3} message="Synchronizing..." />
              ) : filteredPrs.length === 0 ? (
                <TableEmpty colSpan={3} message="No pending submissions found." />
              ) : (
                filteredPrs.map((pr) => {
                  const isCancelled = pr.status === "CANCELLED";
                  const canApproveDept = canUserApproveDepartment(
                    user?.role,
                    pr.department || "PRODUCTION",
                    user?.level,
                  );

                  return (
                    <TableRow
                      key={pr.id}
                      className={cn("cursor-pointer", isCancelled && "opacity-60")}
                      onClick={() => handleViewPr(pr.id)}
                    >
                      <TableCell>
                        <div
                          className={cn(
                            "text-xs font-mono tabular-nums font-bold tracking-tight",
                            isCancelled
                              ? "line-through text-stone-400"
                              : "text-stone-900",
                          )}
                        >
                          {pr.pr_number}
                        </div>
                        <div
                          className="text-[10px] text-stone-500 mt-1 truncate max-w-md"
                          title={pr.title || pr.project_name}
                        >
                          {pr.department ? (
                            <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded bg-stone-100 text-stone-700 uppercase border border-stone-200 font-mono">
                              {getDepartmentLabel(pr.department)}
                            </span>
                          ) : null}
                          {pr.category && pr.category !== "PROJECT" ? (
                            <span className="inline-block mr-1.5 px-1.5 py-0.5 text-[8px] font-bold rounded bg-amber-50 text-amber-700 uppercase border border-amber-200">
                              {pr.category}
                            </span>
                          ) : null}
                          {pr.title || pr.project_name}
                        </div>
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          <Badge
                            variant={
                              pr.status === "AUTHORIZED" ||
                              pr.status === "RECEIVED"
                                ? "success"
                                : pr.status === "REVISION"
                                  ? "danger"
                                  : pr.status === "PARTIAL"
                                    ? "warning"
                                    : pr.status === "PARTIAL_ORDERED" ||
                                        pr.status === "ORDERED"
                                      ? "info"
                                      : "neutral"
                            }
                          >
                            {pr.status}
                          </Badge>
                          {pr.po_numbers && (
                            <Badge variant="info" className="font-mono">
                              {pr.po_numbers}
                            </Badge>
                          )}
                          {pr.grn_ids && (
                            <Badge variant="success" className="font-mono">
                              {pr.grn_ids}
                            </Badge>
                          )}
                          {(pr.status === "DRAFTED" || pr.status === "PENDING") &&
                            pr.escalated_to && (
                              <Badge variant="danger">
                                ESCALATED TO {pr.escalated_to}
                              </Badge>
                            )}
                          {(pr.urgency === "URGENT" ||
                            pr.urgency === "CRITICAL") && (
                            <Badge
                              variant={
                                pr.urgency === "CRITICAL" ? "danger" : "warning"
                              }
                            >
                              {pr.urgency}
                            </Badge>
                          )}
                        </div>
                        {pr.status === "REVISION" && pr.revision_note && (
                          <div className="mt-1.5 flex items-start gap-1 p-2 bg-rose-50 border border-rose-100 rounded text-[10px] text-rose-700 max-w-md">
                            <FileText className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="italic leading-snug break-words">
                              &quot;{pr.revision_note}&quot;
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="text-[10px] font-mono tabular-nums font-bold text-stone-900">
                          {pr.item_count} Items
                        </div>
                        <div className="text-[9px] text-stone-400 font-medium tracking-widest mt-0.5 uppercase">
                          Sourcing Req
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5 items-center shrink-0">
                          <Button
                            size="xs"
                            action="view"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewPr(pr.id);
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              shareToForum(
                                "PR",
                                pr.id,
                                `Purchase Request: ${pr.pr_number}`,
                                `Check out this general purchase request (${getDepartmentLabel(pr.department || "PRODUCTION")}). Status: ${pr.status}`,
                              );
                            }}
                            title="Share"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </Button>
                          {pr.status === "DRAFTED" &&
                            (canApproveDept ||
                              hasPermission(user, Action.AUTH_PR) ||
                              pr.escalated_to === user?.role) && (
                              <>
                                <Button
                                  size="xs"
                                  action="authorize"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPrToAuth(pr);
                                    setShowAuthorizeModal(true);
                                  }}
                                />
                                <Button
                                  size="xs"
                                  action="revise"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedPrToAuth(pr);
                                    setShowReviseModal(true);
                                  }}
                                />
                              </>
                            )}
                          {pr.status === "REVISION" && (
                            <Button
                              size="xs"
                              action="revise"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRevisePrSetup(pr.id);
                              }}
                            />
                          )}
                          {(pr.status === "DRAFTED" ||
                            pr.status === "AUTHORIZED") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelPr(pr.id);
                              }}
                              className="text-stone-400 hover:text-rose-500 hover:bg-rose-50"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {(pr.status === "CANCELLED" ||
                            pr.status === "DRAFTED") && (
                            <Button
                              variant="danger_soft"
                              size="icon-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePr(pr.id);
                              }}
                              title="Delete Request"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </Button>
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
      </section>
    );
  },
);
