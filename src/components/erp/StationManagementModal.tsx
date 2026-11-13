import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { Plus, Trash2, Edit2, Check, X, Layers, RotateCcw } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";

export function StationManagementModal({
  isOpen,
  onClose,
  projectId,
  stations,
  onRefresh,
}: {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  stations: any[];
  onRefresh: () => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    station_code: "",
    station_name: "",
    station_type: "SERIAL",
    station_sequence: 1,
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async (id?: string) => {
    if (isSaving) return;
    try {
      if (!projectId) {
        showToast("Please select a valid manufacturing project first.", "error");
        return;
      }
      if (!formData.station_code.trim() || !formData.station_name.trim()) {
        showToast("Station code and station name are required.", "error");
        return;
      }

      setIsSaving(true);
      const isEdit = !!id;
      const url = isEdit
        ? `/api/production/projects/${projectId}/stations/${id}`
        : `/api/production/projects/${projectId}/stations`;
      const payload: any = {
        station_code: formData.station_code.trim(),
        station_name: formData.station_name.trim(),
        station_type: formData.station_type || "SERIAL",
        station_sequence: Math.max(1, Number(formData.station_sequence) || stations.length + 1),
      };

      const res = await apiFetch(
        url,
        {
          method: isEdit ? "PUT" : "POST",
          body: JSON.stringify(payload),
        },
        user?.username
      );

      if (res.ok) {
        showToast(`Station ${isEdit ? "updated" : "created"} successfully.`, "success");
        setEditingId(null);
        setFormData({
          station_code: "",
          station_name: "",
          station_type: "SERIAL",
          station_sequence: stations.length + 2,
        });
        onRefresh();
      } else {
        showToast(res.data?.error || res.error || "Failed to save station", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingId || isDeleting) return;
    try {
      setIsDeleting(true);
      const res = await apiFetch(
        `/api/production/projects/${projectId}/stations/${deletingId}`,
        { method: "DELETE" },
        user?.username
      );
      if (res.ok) {
        showToast("Station deleted successfully.", "success");
        if (editingId === deletingId) {
          setEditingId(null);
        }
        onRefresh();
      } else {
        showToast(res.data?.error || res.error || "Failed to delete station", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const confirmClearAll = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      const res = await apiFetch(
        `/api/production/projects/${projectId}/stations`,
        { method: "DELETE" },
        user?.username
      );
      if (res.ok) {
        showToast("All stations cleared. You can now configure stations from 0.", "success");
        setEditingId(null);
        onRefresh();
      } else {
        showToast(res.data?.error || res.error || "Failed to clear stations", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    } finally {
      setIsDeleting(false);
      setShowClearAllConfirm(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeletingId(id);
  };

  const handleStartAdd = () => {
    const nextSeq = stations.length + 1;
    const suggestedCode = `STN-${String(nextSeq).padStart(2, "0")}`;
    setEditingId("NEW");
    setFormData({
      station_code: suggestedCode,
      station_name: "",
      station_type: "SERIAL",
      station_sequence: nextSeq,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Station Management" maxWidth="3xl">
      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-stone-900 uppercase">Project Workstations</h3>
              <span className="px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[10px] font-mono font-bold text-stone-700">
                {stations.length} Configured
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Define physical workstations for process routing in Bill of Process (BOP). Starts empty (0 stations) so you can configure the exact layout required for this project.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stations.length > 0 && (
              <Button
                onClick={() => setShowClearAllConfirm(true)}
                variant="secondary"
                size="sm"
                className="border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset (0)
              </Button>
            )}
            <Button
              onClick={handleStartAdd}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold gap-2"
            >
              <Plus className="w-4 h-4" /> Add Station
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto border border-stone-200 rounded-2xl">
          <Table className="text-xs">
            <TableHeader className="bg-stone-50 border-b border-stone-200">
              <TableRow>
                <TableHead className="p-3 w-16 text-center">Seq</TableHead>
                <TableHead className="p-3 w-36">Station Code</TableHead>
                <TableHead className="p-3">Station Name</TableHead>
                <TableHead className="p-3 w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-stone-100">
              {editingId === "NEW" && (
                <TableRow className="bg-emerald-50/40">
                  <TableCell className="p-2 text-center">
                    <input
                      type="number"
                      min={1}
                      className="w-14 p-1.5 rounded-lg border border-stone-200 text-xs text-center font-mono tabular-nums font-bold bg-white"
                      value={formData.station_sequence}
                      onChange={(e) =>
                        setFormData({ ...formData, station_sequence: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </TableCell>
                  <TableCell className="p-2">
                    <input
                      type="text"
                      placeholder="e.g. STN-01"
                      className="w-full p-1.5 rounded-lg border border-stone-200 text-xs font-mono uppercase bg-white"
                      value={formData.station_code}
                      onChange={(e) => setFormData({ ...formData, station_code: e.target.value.toUpperCase() })}
                    />
                  </TableCell>
                  <TableCell className="p-2">
                    <input
                      type="text"
                      placeholder="e.g. Fabrication & Cutting"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full p-1.5 rounded-lg border border-stone-200 text-xs bg-white"
                      value={formData.station_name}
                      onChange={(e) => setFormData({ ...formData, station_name: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="p-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleSave()}
                        disabled={isSaving}
                        title="Save Station"
                        className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        title="Cancel"
                        className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {stations.map((st, idx) => (
                <TableRow key={st.id} className="hover:bg-stone-50/50">
                  {editingId === st.id ? (
                    <>
                      <TableCell className="p-2 text-center">
                        <input
                          type="number"
                          min={1}
                          className="w-14 p-1.5 rounded-lg border border-stone-200 text-xs text-center font-mono tabular-nums font-bold bg-white"
                          value={formData.station_sequence}
                          onChange={(e) =>
                            setFormData({ ...formData, station_sequence: Math.max(1, Number(e.target.value) || 1) })
                          }
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <input
                          type="text"
                          className="w-full p-1.5 rounded-lg border border-stone-200 text-xs font-mono uppercase bg-white"
                          value={formData.station_code}
                          onChange={(e) => setFormData({ ...formData, station_code: e.target.value.toUpperCase() })}
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <input
                          type="text"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave(st.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full p-1.5 rounded-lg border border-stone-200 text-xs bg-white"
                          value={formData.station_name}
                          onChange={(e) => setFormData({ ...formData, station_name: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="p-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSave(st.id)}
                            disabled={isSaving}
                            title="Save Changes"
                            className="text-emerald-600 hover:text-emerald-800 p-1 cursor-pointer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            title="Cancel"
                            className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="p-3 text-center font-mono tabular-nums font-bold text-stone-500">
                        {st.station_sequence || idx + 1}
                      </TableCell>
                      <TableCell className="p-3 font-mono font-bold text-stone-700">{st.station_code}</TableCell>
                      <TableCell className="p-3 font-bold text-stone-900 flex items-center gap-2">
                        <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{st.station_name}</span>
                      </TableCell>
                      <TableCell className="p-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => {
                              setEditingId(st.id);
                              setFormData({
                                station_code: st.station_code,
                                station_name: st.station_name,
                                station_type: st.station_type || "SERIAL",
                                station_sequence: st.station_sequence || idx + 1,
                              });
                            }}
                            title="Edit Station"
                            className="text-stone-400 hover:text-blue-600 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <Button
                            size="icon-xs"
                            variant="danger_soft"
                            onClick={() => handleDelete(st.id)}
                            title="Delete Station"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
              {stations.length === 0 && editingId !== "NEW" && (
                <TableRow>
                  <TableCell colSpan={4} className="p-10 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Layers className="w-7 h-7 text-stone-300" />
                      <p className="text-xs font-bold text-stone-600">No workstations configured (0 Stations)</p>
                      <p className="text-[11px] text-stone-400 max-w-md">
                        Click <strong>+ Add Station</strong> above to create your first workstation from scratch.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deletingId}
        title="Delete Station"
        message="Are you sure you want to delete this station? Any BOP processes linked to this station will be unassigned."
        confirmText="Delete"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmModal
        isOpen={showClearAllConfirm}
        title="Reset All Workstations to 0"
        message="Are you sure you want to remove all workstations in this project and start from 0? All process step station assignments will be cleared."
        confirmText="Yes, Reset to 0"
        isDestructive={true}
        onConfirm={confirmClearAll}
        onCancel={() => setShowClearAllConfirm(false)}
      />
    </Modal>
  );
}

