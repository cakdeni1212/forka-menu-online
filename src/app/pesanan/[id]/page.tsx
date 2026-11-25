"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rupiah, jam } from "@/lib/format";
import type { OrderItem, OrderStatus } from "@/lib/types";

type PublicOrder = {
  id: string; order_no: string; status: OrderStatus; total: number; created_at: string;
  customer_name: string | null; outlet_name: string; table_label: string | null; items: OrderItem[];
};

const STATUS: Record<OrderStatus, { label: string; desc: string; cls: string }> = {
  pending: { label: "Menunggu pembayaran", desc: "Silakan ke kasir dan sebutkan nomor pesanan kamu.", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "Lunas", desc: "Terima kasih! Pesanan kamu sedang disiapkan.", cls: "bg-green-100 text-green-800" },
  cancelled: { label: "Dibatalkan", desc: "Pesanan ini dibatalkan. Hubungi kasir kalau ada pertanyaan.", cls: "bg-gray-200 text-gray-700" },
};

export default function PesananPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      const { data } = await supabase().rpc("get_order_public", { p_order_id: id });
      if (stop) return;
      if (!data) setNotFound(true);
      else setOrder(data);
    };
    load();
    // cek status tiap 5 detik sampai lunas/batal
    const t = setInterval(() => {
      if (order?.status && order.status !== "pending") return;
      load();
    }, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id, order?.status]);

  if (notFound) return <p className="p-6">Pesanan tidak ditemukan.</p>;
  if (!order) return <p className="p-6 text-sm text-gray-500">Memuat...</p>;
  const s = STATUS[order.status];

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-gray-500">{order.outlet_name}{order.table_label ? ` · ${order.table_label}` : ""}</p>
        <p className="mt-3 text-sm text-gray-500">Nomor pesanan</p>
        <p className="text-5xl font-bold tracking-wider text-kopi-900">{order.order_no}</p>
        <span className={`mt-4 inline-block rounded-full px-4 py-1 text-sm font-medium ${s.cls}`}>{s.label}</span>
        <p className="mt-3 text-sm text-gray-600">{s.desc}</p>
      </div>

      <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex justify-between text-sm text-gray-500">
          <span>{order.customer_name ?? "-"}</span>
          <span>{jam(order.created_at)}</span>
        </div>
        <ul className="mt-3 divide-y text-sm">
          {order.items.map((i, k) => (
            <li key={k} className="flex justify-between py-2">
              <span>
                {i.qty}× {i.name}
                {i.note && <span className="block text-xs text-gray-500">{i.note}</span>}
              </span>
              <span>{rupiah(i.price * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 font-bold">
          <span>Total</span>
          <span>{rupiah(order.total)}</span>
        </div>
      </div>

      <button onClick={() => history.back()} className="mt-6 block w-full text-center text-sm text-kopi-600 underline">Kembali ke menu</button>
    </main>
  );
}
