export const productionService = {
  async getAnalytics() {
    const res = await fetch("/api/production/analytics");
    if (!res.ok) throw new Error("Failed to fetch production analytics");
    return res.json();
  },

  async getProjects(params?: { search?: string; status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.status) query.append("status", params.status);
    if (params?.page) query.append("page", String(params.page));
    if (params?.limit) query.append("limit", String(params.limit));

    const res = await fetch(`/api/projects?${query.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch production projects");
    return res.json();
  },

  async updateStepExecution(payload: { bop_id: string; action: string; good_qty?: number; reject_qty?: number; operator_name?: string }) {
    const res = await fetch("/api/production/execute-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Execution failed (${res.status})`);
    }
    return res.json();
  },
};
