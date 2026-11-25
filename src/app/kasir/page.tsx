"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { useStaff } from "@/lib/useStaff";
import { rupiah, jam, startOfTodayWIB, PAYMENT_LABEL } from "@/lib/format";
import StaffGate from "@/components/StaffGate";
import Receipt from "@/components/Receipt";
import { tableName, type CartLine, type Category, type LoyaltySettings, type Member, type Order, type PaymentMethod, type Product } from "@/lib/types";
import Link from "next/link";

type Tab = "masuk" | "baru" | "riwayat";
const ORDER_SELECT = "*, order_items(*), tables(label, area)";

export default function KasirPage() {
  const s = useStaff();
  return (
    <StaffGate s={s} title="Masuk Kasir">
      <Kasir s={s} />
    </StaffGate>
  );
}

function Kasir({ s }: { s: ReturnType<typeof useStaff> }) {
  const outletId = s.outletId!;
  const outlet = s.outlets.find((o) => o.id === outletId);
  const [tab, setTab] = useState<Tab>("masuk");
  const [orders, setOrders] = useState<Order[]>([]);
  const [paying, setPaying] = useState<Order | null>(null);
  const [printing, setPrinting] = useState<Order | null>(null);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase()
      .from("orders").select(ORDER_SELECT)
      .eq("outlet_id", outletId).gte("created_at", startOfTodayWIB())
      .order("created_at", { ascending: false });
    setOrders((data as Order[]) ?? []);
  }, [outletId]);

  // Muat pesanan + dengarkan pesanan baru secara realtime
  useEffect(() => {
    loadOrders();
    const ch = supabase()
      .channel(`orders-${outletId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `outlet_id=eq.${outletId}` }, (payload) => {
        if (payload.eventType === "INSERT") beep();
        loadOrders();
      })
      .subscribe();
    const t = setInterval(loadOrders, 30000); // cadangan kalau realtime putus
    return () => {
      supabase().removeChannel(ch);
      clearInterval(t);
    };
  }, [outletId, loadOrders]);

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printing]);

  const [areaFilter, setAreaFilter] = useState("__all");
  const pendingAll = orders.filter((o) => o.status === "pending");
  const areas = [...new Set(pendingAll.map((o) => o.tables?.area).filter((a): a is string => !!a))].sort();
  const [search, setSearch] = useState("");
  // Antrian: yang paling lama menunggu di depan. Cari pakai nama atau nomor antrian ("12" cocok dengan A-012).
  const q = search.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "").replace(/^0+/, "");
  const pending = pendingAll
    .filter((o) => (areaFilter === "__all" ? true : areaFilter === "__none" ? !o.tables?.area : o.tables?.area === areaFilter))
    .filter((o) => {
      if (!q) return true;
      if (qDigits && o.order_no.replace(/\D/g, "").replace(/^0+/, "") === qDigits) return true;
      return (o.customer_name ?? "").toLowerCase().includes(q) || o.order_no.toLowerCase().includes(q);
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  async function cancel(o: Order) {
    if (!confirm(`Batalkan pesanan ${o.order_no}?`)) return;
    const { error } = await supabase().rpc("cancel_order", { p_order_id: o.id });
    if (error) alert(errMsg(error));
    loadOrders();
  }

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 bg-kopi-900 px-4 py-3 text-white">
        <h1 className="font-bold">Kasir</h1>
        {s.outlets.length > 1 ? (
          <select value={outletId} onChange={(e) => s.setOutletId(e.target.value)} className="rounded bg-kopi-700 px-2 py-1 text-sm">
            {s.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <span className="text-sm text-kopi-200">{outlet?.name}</span>
        )}
        <nav className="ml-auto flex gap-1">
          {([["masuk", `Pesanan Masuk (${pendingAll.length})`], ["baru", "Order Baru"], ["riwayat", "Hari Ini"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-white text-kopi-900" : "hover:bg-white/10"}`}>
              {label}
            </button>
          ))}
        </nav>
        <Link href="/absen" className="rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Absen</Link>
        <span className="text-sm text-kopi-200">{s.staff?.name}</span>
        <button onClick={s.signOut} className="text-sm underline">Keluar</button>
      </header>

      {tab === "masuk" && (
        <section className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pending.length === 1) setPaying(pending[0]);
                if (e.key === "Escape") setSearch("");
              }}
              placeholder="Cari nama customer atau nomor antrian (contoh: 12 atau Rina), Enter untuk bayar"
              className="w-full rounded-xl border-2 border-kopi-200 bg-white px-4 py-3 text-lg focus:border-kopi-500 focus:outline-none"
            />
          </div>
          {areas.length > 0 && (
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
              {[["__all", `Semua (${pendingAll.length})`], ...areas.map((a) => [a, `${a} (${pendingAll.filter((o) => o.tables?.area === a).length})`]), ["__none", "Kasir / tanpa area"]].map(([k, l]) => (
                <button key={k} onClick={() => setAreaFilter(k)} className={`rounded-full px-3 py-1 text-sm ${areaFilter === k ? "bg-kopi-700 text-white" : "bg-white ring-1 ring-kopi-200"}`}>{l}</button>
              ))}
            </div>
          )}
          {pending.length === 0 && (
            <p className="text-gray-500">{q ? `Tidak ada pesanan belum bayar yang cocok dengan "${search}".` : "Belum ada pesanan yang menunggu pembayaran."}</p>
          )}
          {pending.map((o) => (
            <OrderCard key={o.id} o={o}>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setPaying(o)} className="flex-1 rounded-lg bg-kopi-900 py-2 font-semibold text-white">Bayar</button>
                <button onClick={() => cancel(o)} className="rounded-lg px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">Batal</button>
              </div>
            </OrderCard>
          ))}
        </section>
      )}

      {tab === "baru" && (
        <PosOrder
          outletId={outletId}
          onCreated={async (id) => {
            const { data } = await supabase().from("orders").select(ORDER_SELECT).eq("id", id).single();
            await loadOrders();
            if (data) setPaying(data as Order);
          }}
        />
      )}

      {tab === "riwayat" && <Riwayat orders={orders} onPrint={setPrinting} />}

      {paying && (
        <PayModal
          order={paying}
          onClose={() => setPaying(null)}
          onPaid={(o) => {
            setPaying(null);
            loadOrders();
            setPrinting({ ...paying, ...o });
          }}
        />
      )}

      {printing && <Receipt order={printing} outlet={outlet} />}
    </div>
  );
}

function OrderCard({ o, children }: { o: Order; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-kopi-900">{o.order_no}</span>
            <span className="text-xl font-semibold">{o.customer_name ?? "Tanpa nama"}</span>
          </div>
          <div className="text-sm text-gray-600">{tableName(o.tables) ?? (o.source === "pos" ? "Di kasir" : "Ambil di kasir")}</div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{jam(o.created_at)}</div>
          <div className={`mt-1 rounded px-1.5 py-0.5 ${o.source === "qr" ? "bg-blue-50 text-blue-700" : "bg-gray-100"}`}>{o.source === "qr" ? "Dari HP" : "Kasir"}</div>
        </div>
      </div>
      <ul className="mt-2 text-sm">
        {o.order_items?.map((i, k) => (
          <li key={k}>
            {i.qty}× {i.name}
            {i.note && <span className="text-xs text-gray-500"> ({i.note})</span>}
          </li>
        ))}
      </ul>
      {o.note && <p className="mt-1 rounded bg-amber-50 p-1.5 text-xs">{o.note}</p>}
      <div className="mt-2 text-right font-bold">{rupiah(o.total)}</div>
      {children}
    </div>
  );
}

type MemberLookup = { found: boolean; member?: Member; settings: LoyaltySettings };

function PayModal({ order, onClose, onPaid }: { order: Order; onClose: () => void; onPaid: (o: Order) => void }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cash, setCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [memberName, setMemberName] = useState(order.customer_name ?? "");
  const [lookup, setLookup] = useState<MemberLookup | null>(null);
  const [redeem, setRedeem] = useState(0);

  // Cari member otomatis kalau nomor HP sudah cukup panjang
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    setLookup(null);
    setRedeem(0);
    if (digits.length < 9) return;
    const t = setTimeout(async () => {
      const { data } = await supabase().rpc("find_member", { p_phone: phone });
      if (data) setLookup(data as MemberLookup);
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  const settings = lookup?.settings;
  const member = lookup?.found ? lookup.member : undefined;
  const maxRedeem = member && settings ? Math.min(member.points, Math.ceil(order.subtotal / settings.point_value_rupiah)) : 0;
  const canRedeem = !!member && !!settings && maxRedeem >= settings.min_redeem_points;
  const discount = settings ? Math.min(redeem * settings.point_value_rupiah, order.subtotal) : 0;
  const total = order.subtotal - discount;
  const earn = settings && phone.replace(/\D/g, "").length >= 9 ? Math.floor(total / settings.rupiah_per_point) : 0;

  const paid = Number(cash.replace(/\D/g, "")) || 0;
  const change = paid - total;
  const quick = useMemo(() => {
    const set = new Set([total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, 100000]);
    return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  async function pay() {
    if (method === "cash" && paid < total) return alert("Uang yang diterima kurang");
    setBusy(true);
    const { data, error } = await supabase().rpc("pay_order", {
      p_order_id: order.id,
      p_method: method,
      p_amount_paid: method === "cash" ? paid : null,
      p_member_phone: phone.trim() || null,
      p_member_name: memberName.trim() || null,
      p_redeem_points: redeem,
    });
    setBusy(false);
    if (error) return alert(errMsg(error));
    onPaid({ ...(data as Order), member_points_after: member ? member.points - (data as Order).points_redeemed + (data as Order).points_earned : (data as Order).points_earned } as Order);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[95vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">Bayar {order.order_no}</h2>
          <button onClick={onClose} className="text-sm text-gray-500">Tutup</button>
        </div>

        <div className="mt-3 rounded-xl bg-kopi-50 p-3">
          <div className="text-xs font-semibold text-kopi-700">MEMBER (opsional)</div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="No. HP customer" className="mt-1 w-full rounded-lg border bg-white px-3 py-2" />
          {lookup && !lookup.found && (
            <>
              <input value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="Nama (member baru)" className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-gray-600">Member baru, otomatis terdaftar saat bayar.</p>
            </>
          )}
          {member && (
            <div className="mt-2 text-sm">
              <div><b>{member.name ?? "Member"}</b> · {member.points} poin</div>
              {canRedeem ? (
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={redeem > 0} onChange={(e) => setRedeem(e.target.checked ? maxRedeem : 0)} />
                  Tukar
                  <input
                    type="number" min={settings!.min_redeem_points} max={maxRedeem} value={redeem || ""} disabled={redeem === 0}
                    onChange={(e) => setRedeem(Math.max(0, Math.min(maxRedeem, Number(e.target.value) || 0)))}
                    className="w-16 rounded border px-1"
                  />
                  poin
                </label>
              ) : (
                <p className="text-xs text-gray-500">Minimal {settings?.min_redeem_points} poin untuk ditukar.</p>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 space-y-0.5 text-sm">
          {discount > 0 && (
            <>
              <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(order.subtotal)}</span></div>
              <div className="flex justify-between text-green-700"><span>Tukar {redeem} poin</span><span>−{rupiah(discount)}</span></div>
            </>
          )}
        </div>
        <div className="text-3xl font-bold text-kopi-900">{rupiah(total)}</div>
        {earn > 0 && <div className="text-xs text-green-700">+{earn} poin untuk customer</div>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["cash", "qris"] as PaymentMethod[]).map((m) => (
            <button key={m} onClick={() => setMethod(m)} className={`rounded-lg py-2 text-sm ${method === m ? "bg-kopi-900 text-white" : "bg-kopi-100"}`}>
              {PAYMENT_LABEL[m]}
            </button>
          ))}
        </div>
        {method === "cash" ? (
          <div className="mt-4">
            <input inputMode="numeric" value={cash ? Number(cash.replace(/\D/g, "")).toLocaleString("id-ID") : ""} onChange={(e) => setCash(e.target.value)} placeholder="Uang diterima" className="w-full rounded-lg border px-3 py-2 text-lg" />
            <div className="mt-2 flex flex-wrap gap-2">
              {quick.map((v) => (
                <button key={v} onClick={() => setCash(String(v))} className="rounded-lg bg-kopi-50 px-3 py-1 text-sm ring-1 ring-kopi-200">{v === total ? "Uang pas" : rupiah(v)}</button>
              ))}
            </div>
            <div className="mt-3 flex justify-between">
              <span>Kembalian</span>
              <span className={`font-bold ${change < 0 ? "text-red-600" : ""}`}>{rupiah(Math.max(0, change))}</span>
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-kopi-50 p-3 text-sm">
            Proses QRIS di mesin EDC. Konfirmasi lunas setelah struk EDC keluar dan transaksi berhasil.
          </p>
        )}
        <button onClick={pay} disabled={busy} className="mt-5 w-full rounded-xl bg-green-700 py-3 font-semibold text-white disabled:opacity-60">
          {busy ? "Memproses..." : "Konfirmasi Lunas & Cetak Struk"}
        </button>
      </div>
    </div>
  );
}

function PosOrder({ outletId, onCreated }: { outletId: string; onCreated: (id: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cat, setCat] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.from("categories").select("*").eq("outlet_id", outletId).order("sort_order").then(({ data }) => setCategories(data ?? []));
    sb.from("products").select("*").eq("outlet_id", outletId).order("sort_order").then(({ data }) => setProducts(data ?? []));
  }, [outletId]);

  const total = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const add = (p: Product) =>
    setCart((c) => (c.some((l) => l.product.id === p.id) ? c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { product: p, qty: 1, note: "" }]));
  const setQty = (id: string, q: number) => setCart((c) => (q <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty: q } : l))));

  async function submit() {
    setBusy(true);
    const { data, error } = await supabase().rpc("place_pos_order", {
      p_outlet_id: outletId,
      p_items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, note: l.note })),
      p_customer_name: name,
    });
    setBusy(false);
    if (error) return alert(errMsg(error));
    setCart([]);
    setName("");
    onCreated(data.id);
  }

  return (
    <section className="grid gap-4 p-4 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          {[{ id: "all", name: "Semua" }, ...categories].map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={`rounded-full px-3 py-1 text-sm ${cat === c.id ? "bg-kopi-700 text-white" : "bg-white ring-1 ring-kopi-200"}`}>{c.name}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {products.filter((p) => cat === "all" || p.category_id === cat).map((p) => (
            <button key={p.id} disabled={!p.is_available} onClick={() => add(p)} className="rounded-xl bg-white p-3 text-left shadow-sm hover:ring-2 hover:ring-kopi-500 disabled:opacity-40">
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-kopi-700">{rupiah(p.price)}</div>
              {!p.is_available && <div className="text-xs">Habis</div>}
            </button>
          ))}
        </div>
      </div>
      <aside className="h-fit rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Keranjang</h2>
        {cart.length === 0 && <p className="mt-2 text-sm text-gray-500">Klik menu untuk menambahkan.</p>}
        <ul className="mt-2 divide-y text-sm">
          {cart.map((l) => (
            <li key={l.product.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">{l.product.name}</span>
              <button onClick={() => setQty(l.product.id, l.qty - 1)} className="h-6 w-6 rounded bg-kopi-100">−</button>
              <span className="w-5 text-center">{l.qty}</span>
              <button onClick={() => setQty(l.product.id, l.qty + 1)} className="h-6 w-6 rounded bg-kopi-100">+</button>
              <span className="w-20 text-right">{rupiah(l.qty * l.product.price)}</span>
            </li>
          ))}
        </ul>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama customer (opsional)" className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" />
        <div className="mt-3 flex justify-between text-lg font-bold"><span>Total</span><span>{rupiah(total)}</span></div>
        <button onClick={submit} disabled={busy || cart.length === 0} className="mt-3 w-full rounded-xl bg-kopi-900 py-3 font-semibold text-white disabled:opacity-50">
          {busy ? "Menyimpan..." : "Lanjut Bayar"}
        </button>
      </aside>
    </section>
  );
}

function Riwayat({ orders, onPrint }: { orders: Order[]; onPrint: (o: Order) => void }) {
  const paid = orders.filter((o) => o.status === "paid");
  const byMethod = paid.reduce<Record<string, number>>((acc, o) => {
    const m = o.payment_method ?? "cash";
    acc[m] = (acc[m] ?? 0) + o.total;
    return acc;
  }, {});
  const omzet = paid.reduce((s, o) => s + o.total, 0);

  return (
    <section className="p-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Omzet hari ini" value={rupiah(omzet)} />
        <Stat label="Transaksi lunas" value={String(paid.length)} />
        {Object.entries(byMethod).map(([m, v]) => <Stat key={m} label={PAYMENT_LABEL[m]} value={rupiah(v)} />)}
      </div>
      <table className="mt-4 w-full overflow-hidden rounded-xl bg-white text-sm shadow-sm">
        <thead className="bg-kopi-100 text-left">
          <tr><th className="p-2">No</th><th>Jam</th><th>Meja</th><th>Customer</th><th>Status</th><th>Bayar</th><th className="text-right">Total</th><th></th></tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t">
              <td className="p-2 font-medium">{o.order_no}</td>
              <td>{jam(o.created_at)}</td>
              <td>{tableName(o.tables) ?? "-"}</td>
              <td>{o.customer_name ?? "-"}</td>
              <td>{{ pending: "Belum bayar", paid: "Lunas", cancelled: "Batal" }[o.status]}</td>
              <td>{o.payment_method ? PAYMENT_LABEL[o.payment_method] : "-"}</td>
              <td className="text-right">{rupiah(o.total)}</td>
              <td className="p-2 text-right">{o.status === "paid" && <button onClick={() => onPrint(o)} className="text-kopi-600 underline">Struk</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    o.stop(ctx.currentTime + 0.25);
  } catch {
    /* browser blokir audio sebelum ada interaksi */
  }
}
