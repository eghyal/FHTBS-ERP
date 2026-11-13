export interface ShopProduct {
  id: string;
  item_code: string;
  name: string;
  dimension?: string | null;
  spec?: string | null;
  category: string;
  description?: string | null;
  uom: string;
  unit_price: number;
  promo_price: number;
  weight_kg: number;
  image_url: string;
  gallery_urls?: string[];
  shop_gallery_urls?: string[] | string;
  badge?: string | null;
  is_featured: number;
  available_qty: number;
  physical_qty?: number;
  availability_type?: "AUTO" | "READY_STOCK" | "MAKE_TO_ORDER";
  lead_time_days?: number;
  moq?: number;
  technical_specs?: string;
}

export interface CartItem {
  product: ShopProduct;
  qty: number;
}

export interface ShopOrder {
  id: string;
  order_number: string;
  customer_id?: string | null;
  customer_code?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  delivery_address: string;
  delivery_city?: string | null;
  delivery_method: "PICKUP" | "DELIVERY";
  shipping_cost: number;
  subtotal_amount: number;
  subtotal?: number;
  dpp_amount?: number;
  dpp_nilai_lain?: number;
  ppn_amount?: number;
  tax_scheme?: string;
  total_amount: number;
  payment_method: "TRANSFER_MANUAL" | "QRIS" | "COD";
  payment_status: "UNPAID" | "PAID" | "VERIFIED" | "AWAITING_VERIFICATION" | "PENDING_PAYMENT";
  order_status: "PENDING_PAYMENT" | "PAYMENT_SUBMITTED" | "PENDING_VERIFICATION" | "PAID" | "PROCESSING" | "IN_PRODUCTION" | "READY_TO_SHIP" | "DISPATCHED" | "COMPLETED" | "CANCELLED";
  payment_proof_url?: string | null;
  payment_ref?: string | null;
  is_dp?: number;
  dp_amount?: number;
  delivery_distance?: number;
  fulfillment_mode?: "MTS" | "MTO" | "HYBRID";
  production_status?: "NOT_REQUIRED" | "PENDING_SPK" | "IN_PRODUCTION" | "COMPLETED";
  project_id?: string | null;
  spk_number?: string | null;
  project_status?: string | null;
  bop_progress?: number;
  dp_invoice_id?: string | null;
  dp_ci_number?: string | null;
  final_invoice_id?: string | null;
  final_ci_number?: string | null;
  tracking_number?: string | null;
  fleet_notes?: string | null;
  delivery_note_id?: string | null;
  ci_id?: string | null;
  ci_number?: string | null;
  customer_notes?: string | null;
  created_at: string;
  paid_at?: string | null;
  dispatched_at?: string | null;
  items?: ShopOrderItem[];
  item_count?: number;
}

export interface ShopOrderItem {
  id: string;
  order_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  qty: number;
  unit_price: number;
  total_price: number;
  weight_kg: number;
  fulfillment_type?: "READY_STOCK" | "MAKE_TO_ORDER";
  mto_qty?: number;
  estimated_lead_days?: number;
}

export interface CheckoutFormState {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  delivery_address: string;
  delivery_city: string;
  delivery_method: "PICKUP" | "DELIVERY";
  payment_method: "TRANSFER_MANUAL" | "QRIS" | "COD";
  customer_notes: string;
}
