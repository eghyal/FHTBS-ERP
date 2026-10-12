export const purchasingService = {
  async getPurchaseRequests(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.page) query.append("page", String(params.page));
    if (params?.limit) query.append("limit", String(params.limit));

    const res = await fetch(`/api/purchasing/prs?${query.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch purchase requests");
    return res.json();
  },

  async getPurchaseOrders(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.page) query.append("page", String(params.page));
    if (params?.limit) query.append("limit", String(params.limit));

    const res = await fetch(`/api/purchasing/pos?${query.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch purchase orders");
    return res.json();
  },

  async getVendors() {
    const res = await fetch("/api/purchasing/suppliers");
    if (!res.ok) throw new Error("Failed to fetch vendors");
    return res.json();
  },
};
