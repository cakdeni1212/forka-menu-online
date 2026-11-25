"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Employee } from "@/lib/types";

const empty = { id: "", name: "", jabatan: "", pin: "", is_active: true };

export default function KaryawanAdmin({ outletId }: { outletId: string }) {
  const [list, setList] = useState<Employee[]>([]);
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    const { data } = await supabase().from("employees").select("id, outlet_id, name, jabatan, is_active, created_at").eq("outlet_id", outletId).order("name");
    setList(data ?? []);
  }, [outletId]);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().rpc("save_employee", {
      p_outlet_id: outletId,
      p_name: form.name,
      p_jabatan: form.jabatan,
      p_pin: form.pin || null,
      p_id: form.id || null,
      p_is_active: form.is_active,
    });
    if (error) return alert(errMsg(error));
    setForm(empty);
    load();
  }

  return (
    <section className="grid gap-4 p-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Karyawan</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-1">Nama</th><th>Jabatan</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.map((k) => (
              <tr key={k.id} className="border-t">
                <td className="py-2">{k.name}</td>
                <td>{k.jabatan ?? "-"}</td>
                <td>{k.is_active ? <span className="text-green-700">Aktif</span> : <span className="text-gray-400">Nonaktif</span>}</td>
                <td className="text-right">
                  <button onClick={() => setForm({ id: k.id, name: k.name, jabatan: k.jabatan ?? "", pin: "", is_active: k.is_active })} className="text-kopi-600 underline">Ubah</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-gray-400">Belum ada karyawan</td></tr>}
          </tbody>
        </table>
      </div>
      <form onSubmit={save} className="h-fit space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
        <h2 className="font-bold">{form.id ? "Ubah karyawan" : "Tambah karyawan"}</h2>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama" className="w-full rounded-lg border px-3 py-2" />
        <input value={form.jabatan} onChange={(e) => setForm({ ...form, jabatan: e.target.value })} placeholder="Jabatan (Barista, Kitchen, ...)" className="w-full rounded-lg border px-3 py-2" />
        <input
          value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
          inputMode="numeric" required={!form.id} placeholder={form.id ? "PIN baru (kosongkan kalau tidak diganti)" : "PIN absen 4-6 angka"}
          className="w-full rounded-lg border px-3 py-2"
        />
        {form.id && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
        )}
        <div className="flex gap-2">
          <button className="flex-1 rounded-lg bg-kopi-900 py-2 font-semibold text-white">Simpan</button>
          {form.id && <button type="button" onClick={() => setForm(empty)} className="rounded-lg px-3 ring-1 ring-gray-300">Batal</button>}
        </div>
        <p className="text-xs text-gray-500">PIN disimpan terenkripsi dan tidak bisa dilihat lagi. Kalau lupa, cukup ganti PIN baru.</p>
      </form>
    </section>
  );
}
