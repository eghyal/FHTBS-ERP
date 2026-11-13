import React, { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { BopEngineeringEditor } from "@/components/erp/BopEditor";
import { useAutoSave } from "@/hooks/useAutoSave";
import { apiFetch } from "@/utils/api";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Printer, GitFork, Layers } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function BopEngineeringPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { id: paramProjectId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const queryProjectId =
    searchParams.get("project") ||
    searchParams.get("project_id") ||
    paramProjectId ||
    "";

  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const { data: selectedProject, setData: setSelectedProject } =
    useAutoSave<string>("engineering_bop_selected_project", queryProjectId);

  useEffect(() => {
    if (queryProjectId && queryProjectId !== selectedProject) {
      setSelectedProject(queryProjectId);
    }
  }, [queryProjectId]);

  const fetchProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const res = await apiFetch("/api/projects", {}, user?.username);
      if (res.ok && Array.isArray(res.data)) {
        const nonMfgIds = ["CONSUMABLE", "TRANSPORTATION", "OTHERS", "GENERAL"];
        const isNonMfg = (p: any) => {
          if (!p) return true;
          if (nonMfgIds.includes(p.id)) return true;
          const name = (p.name || "").toLowerCase();
          const spk = (p.spk_number || "").toLowerCase();
          return (
            name.includes("consumable") ||
            name.includes("transportation") ||
            name.includes("other procurement") ||
            name.includes("general procurement") ||
            name.includes("konsumabel") ||
            name.includes("transportasi") ||
            spk.includes("consumable") ||
            spk.includes("transport")
          );
        };

        const mfgProjects = res.data.filter((p: any) => !isNonMfg(p));
        setProjects(mfgProjects);
        if (queryProjectId) {
          setSelectedProject(queryProjectId);
        } else if (!selectedProject && mfgProjects.length > 0) {
          const firstProj = mfgProjects.find((p: any) => p.status !== "COMPLETED") || mfgProjects[0];
          setSelectedProject(firstProj?.id || "");
        }
      }
    } catch (err) {
      console.error("Failed to load projects", err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProject) || null;
  }, [projects, selectedProject]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bill of Process"
        subtitle="Process route & workstation declaration"
        icon={<GitFork className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            {selectedProject && (
              <Button
                onClick={() => setShowPrintModal(true)}
                variant="primary"
                size="sm"
                className="text-xs font-bold gap-1.5 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5 text-white" />
                Export PDF
              </Button>
            )}
          </div>
        }
      />

      {/* Project Selector Box */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 sm:p-5 border border-stone-200/80 dark:border-stone-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-xs font-black text-stone-900 dark:text-stone-100 uppercase tracking-wider">
              Manufacturing Project
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Select an active project to configure its process routing.
            </p>
          </div>

          <div className="w-full sm:w-80">
            <Select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="rounded-xl border-stone-200 dark:border-stone-700 focus:ring-stone-900 focus:border-stone-900 font-bold text-xs"
            >
              <option value="">-- Select Project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {`[${p.spk_number || p.id}] ${p.name}`}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {/* Editor Content Area */}
      {selectedProject ? (
        <BopEngineeringEditor
          projectId={selectedProject}
          project={currentProject}
          onRefreshProject={fetchProjects}
          showPrintModal={showPrintModal}
          onPrintModalClose={() => setShowPrintModal(false)}
        />
      ) : (
        <div className="bg-stone-50/60 dark:bg-stone-900/60 rounded-2xl border border-stone-200/80 dark:border-stone-800 p-14 text-center space-y-2.5 max-w-xl mx-auto mt-6">
          <Layers className="w-9 h-9 text-stone-300 dark:text-stone-600 mx-auto" />
          <h3 className="text-sm font-black text-stone-800 dark:text-stone-200 uppercase tracking-wide">
            No Project Selected
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Select a manufacturing project above to configure its Bill of Process.
          </p>
        </div>
      )}
    </div>
  );
}
