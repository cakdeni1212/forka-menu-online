"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, errMsg } from "@/lib/supabase";
import { useStaff } from "@/lib/useStaff";
import { rupiah } from "@/lib/format";
import StaffGate from "@/components/StaffGate";
import type { Category, Product, TableRow } from "@/lib/types";
import MemberAdmin from "./MemberAdmin";
import KaryawanAdmin from "./KaryawanAdmin";
import AbsenAdmin from "./AbsenAdmin";
import DashboardAdmin from "./DashboardAdmin";

type AdminTab = "dashboard" | "menu" | "meja" | "member" | "karyawan" | "absen";
const TAB_LABEL: Record<AdminTab, string> = { dashboard: "Dashboard", menu: "Menu", meja: "Meja & QR", member: "Member", karyawan: "Karyawan", absen: "Absen" };

export default function AdminPage() {
  const s = useStaff();
  return (
    <StaffGate s={s} title="Masuk Admin">
      {s.staff?.role === "cashier" ? <p className="p-6">Halaman ini khusus admin/owner.</p> : <Admin s={s} />}
    </StaffGate>
  );
}

function Admin({ s }: { s: ReturnType<typeof useStaff> }) {
  const outletId = s.outletId!;
  const outlet = s.outlets.find((o) => o.id === outletId);
  const [tab, setTab] = useState<AdminTab>("dashboard");

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 bg-kopi-900 px-4 py-3 text-white print:hidden">
        <h1 className="font-bold">Admin</h1>
        {s.outlets.length > 1 ? (
          <select value={outletId} onChange={(e) => s.setOutletId(e.target.value)} className="rounded bg-kopi-700 px-2 py-1 text-sm">
            {s.outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ) : (
          <span className="text-sm text-kopi-200">{outlet?.name}</span>
        )}
        <nav className="ml-auto flex gap-1">
          {(Object.keys(TAB_LABEL) as AdminTab[]).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 text-sm ${tab === k ? "bg-white text-kopi-900" : "hover:bg-white/10"}`}>
              {TAB_LABEL[k]}
            </button>
          ))}
        </nav>
        <button onClick={s.signOut} className="text-sm underline">Keluar</button>
      </header>
      {tab === "dashboard" && <DashboardAdmin outletId={outletId} outlets={s.outlets} isOwner={s.staff?.role === "owner"} />}
      {tab === "menu" && <MenuAdmin outletId={outletId} />}
      {tab === "meja" && <MejaAdmin outletId={outletId} outletSlug={outlet?.slug ?? ""} />}
      {tab === "member" && <MemberAdmin isOwner={s.staff?.role === "owner"} />}
      {tab === "karyawan" && <KaryawanAdmin outletId={outletId} />}
      {tab === "absen" && <AbsenAdmin outletId={outletId} />}
    </div>
  );
}

const emptyProduct = { id: "", name: "", description: "", price: "", category_id: "", image_url: "", is_available: true };

function MenuAdmin({ outletId }: { outletId: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newCat, setNewCat] = useState("");
  const [form, setForm] = useState(emptyProduct);

  const load = useCallback(async () => {
    const sb = supabase();
    const [c, p] = await Promise.all([
      sb.from("categories").select("*").eq("outlet_id", outletId).order("sort_order"),
      sb.from("products").select("*").eq("outlet_id", outletId).order("sort_order"),
    ]);
    setCategories(c.data ?? []);
    setProducts(p.data ?? []);
  }, [outletId]);
  useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!newCat.trim()) return;
    const { error } = await supabase().from("categories").insert({ outlet_id: outletId, name: newCat.trim(), sort_order: categories.length + 1 });
    if (error) return alert(errMsg(error));
    setNewCat("");
    load();
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`Hapus kategori ${c.name}? Menunya tetap ada tapi tanpa kategori.`)) return;
    const { error } = await supabase().from("categories").delete().eq("id", c.id);
    if (error) alert(errMsg(error));
    load();
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    const row = {
      outlet_id: outletId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(String(form.price).replace(/\D/g, "")) || 0,
      category_id: form.category_id || null,
      image_url: form.image_url.trim() || null,
      is_available: form.is_available,
    };
    const sb = supabase();
    const { error } = form.id
      ? await sb.from("products").update(row).eq("id", form.id)
      : await sb.from("products").insert({ ...row, sort_order: products.length + 1 });
    if (error) return alert(errMsg(error));
    setForm(emptyProduct);
    load();
  }

  async function toggle(p: Product) {
    await supabase().from("products").update({ is_available: !p.is_available }).eq("id", p.id);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Hapus ${p.name}?`)) return;
    const { error } = await supabase().from("products").delete().eq("id", p.id);
    if (error) alert(errMsg(error));
    load();
  }

  return (
    <section className="grid gap-4 p-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        {[...categories, { id: "", name: "Tanpa kategori" } as Category].map((c) => {
          const items = products.filter((p) => (p.category_id ?? "") === c.id);
          if (!c.id && items.length === 0) return null;
          return (
            <div key={c.id || "none"} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-bold">{c.name}</h2>
                {c.id && <button onClick={() => deleteCategory(c)} className="text-xs text-red-700">Hapus kategori</button>}
              </div>
              <ul className="mt-2 divide-y text-sm">
                {items.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <span className={`flex-1 ${!p.is_available ? "text-gray-400 line-through" : ""}`}>{p.name}</span>
                    <span className="w-24 text-right">{rupiah(p.price)}</span>
                    <button onClick={() => toggle(p)} className={`rounded px-2 py-0.5 text-xs ${p.is_available ? "bg-green-100 text-green-800" : "bg-gray-200"}`}>
                      {p.is_available ? "Tersedia" : "Habis"}
                    </button>
                    <button
                      onClick={() => setForm({ id: p.id, name: p.name, description: p.description ?? "", price: String(p.price), category_id: p.category_id ?? "", image_url: p.image_url ?? "", is_available: p.is_available })}
                      className="text-xs text-kopi-600 underline"
                    >
                      Ubah
                    </button>
                    <button onClick={() => remove(p)} className="text-xs text-red-700">Hapus</button>
                  </li>
                ))}
                {items.length === 0 && <li className="py-2 text-gray-400">Belum ada menu</li>}
              </ul>
            </div>
          );
        })}
      </div>

      <aside className="space-y-4">
        <form onSubmit={saveProduct} className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">{form.id ? "Ubah menu" : "Tambah menu"}</h2>
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama menu" className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input required inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Harga (contoh: 22000)" className="w-full rounded-lg border px-3 py-2 text-sm" />
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm">
            <option value="">Tanpa kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi (opsional)" className="w-full rounded-lg border px-3 py-2 text-sm" />
          <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="Link foto (opsional)" className="w-full rounded-lg border px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} /> Tersedia
          </label>
          <div className="flex gap-2">
            <button className="flex-1 rounded-lg bg-kopi-900 py-2 text-sm font-semibold text-white">Simpan</button>
            {form.id && <button type="button" onClick={() => setForm(emptyProduct)} className="rounded-lg px-3 text-sm ring-1 ring-gray-300">Batal</button>}
          </div>
        </form>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">Tambah kategori</h2>
          <div className="mt-2 flex gap-2">
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Contoh: Kopi" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
            <button onClick={addCategory} className="rounded-lg bg-kopi-700 px-3 text-sm text-white">Tambah</button>
          </div>
        </div>
      </aside>
    </section>
  );
}

function MejaAdmin({ outletId, outletSlug }: { outletId: string; outletSlug: string }) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [label, setLabel] = useState("");
  const [area, setArea] = useState("");
  const [filter, setFilter] = useState<string>("__all");
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase().from("tables").select("*").eq("outlet_id", outletId)
      .order("area", { nullsFirst: false }).order("sort_order").order("label");
    setTables(data ?? []);
  }, [outletId]);
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  // Daftar area yang sudah dipakai di outlet ini (urut nama, "tanpa area" di akhir)
  const areas = [...new Set(tables.map((t) => t.area).filter((a): a is string => !!a))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
  const groups: { area: string | null; items: TableRow[] }[] = [
    ...areas.map((a) => ({ area: a as string | null, items: tables.filter((t) => t.area === a) })),
    { area: null, items: tables.filter((t) => !t.area) },
  ].filter((g) => g.items.length > 0 && (filter === "__all" || (g.area ?? "") === filter));

  async function add() {
    if (!label.trim()) return;
    const { error } = await supabase().from("tables").insert({ outlet_id: outletId, label: label.trim(), area: area.trim() || null });
    if (error) return alert(error.code === "23505" ? "Nama meja itu sudah ada di area yang sama" : errMsg(error));
    setLabel("");
    load();
  }

  async function changeArea(t: TableRow, value: string) {
    const next = value.trim() || null;
    if (next === t.area) return;
    const { error } = await supabase().from("tables").update({ area: next }).eq("id", t.id);
    if (error) alert(error.code === "23505" ? "Nama meja itu sudah ada di area tujuan" : errMsg(error));
    load();
  }

  async function remove(t: TableRow) {
    if (!confirm(`Hapus ${t.area ? t.area + " · " : ""}${t.label}? QR lama tidak akan bisa dipakai lagi.`)) return;
    await supabase().from("tables").delete().eq("id", t.id);
    load();
  }

  return (
    <section className="p-4">
      <datalist id="area-list">
        {areas.map((a) => <option key={a} value={a} />)}
      </datalist>
      <div className="flex flex-wrap gap-2 print:hidden">
        <input value={area} onChange={(e) => setArea(e.target.value)} list="area-list" placeholder="Area, contoh: Lantai 2" className="rounded-lg border px-3 py-2 text-sm" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Nama meja, contoh: Meja 4" className="rounded-lg border px-3 py-2 text-sm" />
        <button onClick={add} className="rounded-lg bg-kopi-900 px-4 text-sm text-white">Tambah meja</button>
        <button onClick={() => window.print()} className="ml-auto rounded-lg px-4 text-sm ring-1 ring-kopi-500">
          Cetak QR {filter === "__all" ? "semua" : filter || "tanpa area"}
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-500 print:hidden">Tempel QR di tiap meja. Customer scan, pesan dari HP, lalu bayar di kasir. Area bisa diganti langsung di kartu meja.</p>

      {areas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          {[["__all", "Semua"], ...areas.map((a) => [a, a]), ...(tables.some((t) => !t.area) ? [["", "Tanpa area"]] : [])].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-sm ${filter === k ? "bg-kopi-700 text-white" : "bg-white ring-1 ring-kopi-200"}`}>{l}</button>
          ))}
        </div>
      )}

      <div className="qr-sheet mt-4 space-y-6">
        {groups.map((g) => (
          <div key={g.area ?? "__none"}>
            <h2 className="mb-2 font-bold text-kopi-900">{g.area ?? "Tanpa area"} <span className="text-sm font-normal text-gray-500">({g.items.length} meja)</span></h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((t) => {
                const url = `${origin}/menu/${outletSlug}?meja=${t.token}`;
                return (
                  <div key={t.id} className="flex flex-col items-center rounded-xl bg-white p-4 shadow-sm print:break-inside-avoid print:shadow-none print:ring-1 print:ring-gray-300">
                    {t.area && <div className="text-xs uppercase tracking-wide text-gray-500">{t.area}</div>}
                    <div className="mb-2 font-bold">{t.label}</div>
                    <QRCodeSVG value={url} size={160} />
                    <div className="mt-2 text-center text-xs text-gray-500">Scan untuk pesan</div>
                    <div className="mt-2 flex items-center gap-2 text-xs print:hidden">
                      <input
                        defaultValue={t.area ?? ""} list="area-list" placeholder="Area"
                        onBlur={(e) => changeArea(t, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className="w-24 rounded border px-1.5 py-0.5"
                      />
                      <a href={url} target="_blank" className="text-kopi-600 underline">Buka</a>
                      <button onClick={() => remove(t)} className="text-red-700">Hapus</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
