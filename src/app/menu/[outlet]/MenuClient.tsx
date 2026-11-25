"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase, errMsg } from "@/lib/supabase";
import { rupiah } from "@/lib/format";
import { OUTLET_COLS, tableName, type CartLine, type Category, type Outlet, type Product } from "@/lib/types";

// id & label null = QR umum outlet (bukan meja)
type TableInfo = { id: string | null; label: string | null; area: string | null; outlet_id: string; outlet_slug: string };

export default function MenuClient({ outletSlug }: { outletSlug: string }) {
  const router = useRouter();
  const mejaToken = useSearchParams().get("meja");

  const [outlet, setOutlet] = useState<Outlet | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [table, setTable] = useState<TableInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeCat, setActiveCat] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const { data: o, error: oe } = await sb.from("outlets").select(OUTLET_COLS).eq("slug", outletSlug).maybeSingle();
      if (oe || !o) {
        setError(oe ? errMsg(oe) : "Outlet tidak ditemukan");
        setLoading(false);
        return;
      }
      setOutlet(o);
      const [c, p] = await Promise.all([
        sb.from("categories").select("*").eq("outlet_id", o.id).order("sort_order"),
        sb.from("products").select("*").eq("outlet_id", o.id).order("sort_order"),
      ]);
      setCategories(c.data ?? []);
      setProducts(p.data ?? []);

      if (mejaToken) {
        const { data: t } = await sb.rpc("get_table_by_token", { p_token: mejaToken });
        if (t && t.outlet_id === o.id) setTable(t);
        else setError("QR tidak valid. Kamu tetap bisa lihat menu, tapi pesan langsung ke kasir ya.");
      }
      setLoading(false);
    })();
  }, [outletSlug, mejaToken]);

  // Simpan nama & HP customer di HP-nya supaya order berikutnya tidak perlu ngetik ulang
  useEffect(() => {
    setName(localStorage.getItem("forka_nama") ?? "");
    setPhone(localStorage.getItem("forka_hp") ?? "");
  }, []);

  const visible = useMemo(
    () => products.filter((p) => activeCat === "all" || p.category_id === activeCat),
    [products, activeCat],
  );
  const total = cart.reduce((s, l) => s + l.product.price * l.qty, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const canOrder = !!table;

  function add(p: Product) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...c, { product: p, qty: 1, note: "" }];
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));
  }
  function setLineNote(id: string, n: string) {
    setCart((c) => c.map((l) => (l.product.id === id ? { ...l, note: n } : l)));
  }

  async function submit() {
    if (!mejaToken || cart.length === 0) return;
    if (!name.trim()) {
      alert("Isi nama dulu ya, biar kasir gampang manggil");
      return;
    }
    setSending(true);
    localStorage.setItem("forka_nama", name.trim());
    localStorage.setItem("forka_hp", phone.trim());
    const { data, error } = await supabase().rpc("place_qr_order", {
      p_table_token: mejaToken,
      p_items: cart.map((l) => ({ product_id: l.product.id, qty: l.qty, note: l.note })),
      p_customer_name: name,
      p_customer_phone: phone,
      p_note: note,
    });
    setSending(false);
    if (error) {
      alert(errMsg(error));
      return;
    }
    router.push(`/pesanan/${data.id}`);
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Memuat menu...</p>;
  if (!outlet) return <p className="p-6 text-red-700">{error}</p>;

  return (
    <main className="mx-auto max-w-md pb-32">
      <header className="bg-kopi-900 px-5 pb-5 pt-6 text-white">
        <h1 className="text-2xl font-bold">{outlet.name}</h1>
        {table ? (
          <p className="mt-1 inline-block rounded-full bg-white/15 px-3 py-0.5 text-sm">
            {table.label ? tableName({ label: table.label, area: table.area }) : "Pesan dari HP, bayar di kasir"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-kopi-200">Scan QR di meja atau di kasir untuk pesan dari HP</p>
        )}
      </header>

      {error && <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

      <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-kopi-50 px-4 py-3">
        {[{ id: "all", name: "Semua" }, ...categories].map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
              activeCat === c.id ? "bg-kopi-700 text-white" : "bg-white text-kopi-700 ring-1 ring-kopi-200"
            }`}
          >
            {c.name}
          </button>
        ))}
      </nav>

      <ul className="space-y-3 px-4">
        {visible.map((p) => {
          const inCart = cart.find((l) => l.product.id === p.id)?.qty ?? 0;
          return (
            <li key={p.id} className={`flex gap-3 rounded-xl bg-white p-3 shadow-sm ${!p.is_available ? "opacity-50" : ""}`}>
              {p.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_url} alt={p.name} className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-kopi-100 text-2xl">☕</div>
              )}
              <div className="flex flex-1 flex-col">
                <div className="font-semibold">{p.name}</div>
                {p.description && <div className="text-xs text-gray-500">{p.description}</div>}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="font-semibold text-kopi-700">{rupiah(p.price)}</span>
                  {!p.is_available ? (
                    <span className="text-xs text-gray-500">Habis</span>
                  ) : canOrder ? (
                    inCart > 0 ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => setQty(p.id, inCart - 1)} className="h-8 w-8 rounded-full bg-kopi-100 font-bold">−</button>
                        <span className="w-5 text-center">{inCart}</span>
                        <button onClick={() => add(p)} className="h-8 w-8 rounded-full bg-kopi-700 font-bold text-white">+</button>
                      </div>
                    ) : (
                      <button onClick={() => add(p)} className="rounded-full bg-kopi-700 px-4 py-1.5 text-sm text-white">Tambah</button>
                    )
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {canOrder && count > 0 && !showCart && (
        <button
          onClick={() => setShowCart(true)}
          className="fixed inset-x-4 bottom-4 mx-auto flex max-w-md items-center justify-between rounded-2xl bg-kopi-900 px-5 py-4 text-white shadow-lg"
        >
          <span>{count} item</span>
          <span className="font-semibold">Lihat pesanan · {rupiah(total)}</span>
        </button>
      )}

      {showCart && (
        <div className="fixed inset-0 z-20 flex items-end bg-black/40" onClick={() => setShowCart(false)}>
          <div className="mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Pesanan kamu</h2>
              <button onClick={() => setShowCart(false)} className="text-sm text-gray-500">Tutup</button>
            </div>
            <ul className="mt-3 divide-y">
              {cart.map((l) => (
                <li key={l.product.id} className="py-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{l.product.name}</span>
                    <span>{rupiah(l.product.price * l.qty)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button onClick={() => setQty(l.product.id, l.qty - 1)} className="h-7 w-7 rounded-full bg-kopi-100">−</button>
                    <span className="w-5 text-center">{l.qty}</span>
                    <button onClick={() => setQty(l.product.id, l.qty + 1)} className="h-7 w-7 rounded-full bg-kopi-100">+</button>
                    <input
                      value={l.note}
                      onChange={(e) => setLineNote(l.product.id, e.target.value)}
                      placeholder="Catatan (less sugar, dll)"
                      maxLength={120}
                      className="ml-2 flex-1 rounded-lg border px-2 py-1 text-sm"
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kamu *" maxLength={60} className="w-full rounded-lg border px-3 py-2" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="No. HP (opsional, buat kumpulin poin member)" inputMode="tel" maxLength={20} className="w-full rounded-lg border px-3 py-2" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan untuk kasir (opsional)" maxLength={300} className="w-full rounded-lg border px-3 py-2" rows={2} />
            </div>
            <div className="mt-4 flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span>{rupiah(total)}</span>
            </div>
            <button
              onClick={submit}
              disabled={sending}
              className="mt-4 w-full rounded-xl bg-kopi-900 py-3 font-semibold text-white disabled:opacity-60"
            >
              {sending ? "Mengirim..." : "Kirim pesanan"}
            </button>
            <p className="mt-2 text-center text-xs text-gray-500">Setelah kirim, kamu dapat nomor antrian. Sebutkan nama atau nomor antrian ke kasir, lalu bayar di kasir (tunai / QRIS).</p>
          </div>
        </div>
      )}
    </main>
  );
}
