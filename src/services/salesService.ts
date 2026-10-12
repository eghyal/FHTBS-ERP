export const salesService = {
  async getQuotations(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.page) query.append("page", String(params.page));
    if (params?.limit) query.append("limit", String(params.limit));

    const res = await fetch(`/api/sales/quotations?${query.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch quotations");
    return res.json();
  },

  async getCustomers() {
    const res = await fetch("/api/sales/customers");
    if (!res.ok) throw new Error("Failed to fetch customers");
    return res.json();
  },

  async getDeliveries() {
    const res = await fetch("/api/sales/deliveries");
    if (!res.ok) throw new Error("Failed to fetch deliveries");
    return res.json();
  },
};
