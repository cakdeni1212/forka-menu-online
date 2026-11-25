/** Kolom outlet yang boleh dibaca aplikasi (qr_token sengaja tidak, lihat 0006). */
export const OUTLET_COLS = "id, slug, name, address, phone, is_active";
export type Outlet = { id: string; slug: string; name: string; address: string | null; phone: string | null; is_active: boolean };
export type Category = { id: string; outlet_id: string; name: string; sort_order: number };
export type Product = {
  id: string; outlet_id: string; category_id: string | null; name: string; description: string | null;
  price: number; image_url: string | null; is_available: boolean; sort_order: number;
};
export type TableRow = { id: string; outlet_id: string; label: string; area: string | null; sort_order: number; token: string; is_active: boolean };

/** "Lantai 2 · Meja 3" atau "Meja 3" kalau tanpa area */
export const tableName = (t: { label: string; area?: string | null } | null | undefined) =>
  t ? (t.area ? `${t.area} · ${t.label}` : t.label) : null;
export type StaffRole = "owner" | "admin" | "cashier";
export type Staff = { id: string; outlet_id: string | null; name: string; role: StaffRole; is_active: boolean };
export type OrderStatus = "pending" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "qris" | "debit" | "transfer";
export type OrderItem = { id?: string; name: string; price: number; qty: number; note: string | null };
export type Order = {
  id: string; outlet_id: string; table_id: string | null; order_no: string; source: "qr" | "pos"; status: OrderStatus;
  customer_name: string | null; customer_phone: string | null; note: string | null; total: number;
  subtotal: number; discount: number; points_redeemed: number; points_earned: number; member_id: string | null;
  payment_method: PaymentMethod | null; amount_paid: number | null; change_amount: number | null;
  paid_at: string | null; created_at: string;
  order_items?: OrderItem[]; tables?: { label: string; area: string | null } | null;
  member_points_after?: number; // hanya untuk struk setelah bayar
};
export type CartLine = { product: Product; qty: number; note: string };
export type LoyaltySettings = { rupiah_per_point: number; point_value_rupiah: number; min_redeem_points: number };
export type Member = {
  id: string; phone: string; name: string | null; points: number; total_spent: number; visit_count: number;
  last_visit_at: string | null; created_at: string;
};
export type Employee = { id: string; outlet_id: string; name: string; jabatan: string | null; is_active: boolean; created_at: string };
export type Attendance = { id: string; employee_id: string; outlet_id: string; type: "in" | "out"; photo_path: string | null; created_at: string; employees?: { name: string } | null };
