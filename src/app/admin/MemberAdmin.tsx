"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, errMsg } from "@/lib/supabase";
import { rupiah, tanggalJam } from "@/lib/format";
import type { LoyaltySettings, Member } from "@/lib/types";

type Tx = { id: string; type: string; points: number; note: string | null; created_at: string; outlets: { name: string } | null };

export default function MemberAdmin({ isOwner }: { isOwner: boolean }) {
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<Member | null>(null);
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    let query = supabase().from("members").select("*", { count: "exact" }).order("last_visit_at", { ascending: false, nullsFirst: false }).limit(100);
    const term = q.trim();
    if (term) {
      const digits = term.replace(/\D/g, "").replace(/^62/, "0");
      query = digits.length >= 3 ? query.like("phone", `%${digits}%`) : query.ilike("name", `%${term}%`);
    }
    const { data, count } = await query;
    setMembers(data ?? []);
    setCount(count ?? 0);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setOrigin(window.location.origin);
    supabase().from("loyalty_settings").select("*").single().then(({ data }) => setSettings(data));
  }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const { error } = await supabase().from("loyalty_settings").update({
      rupiah_per_point: settings.rupiah_per_point,
      point_value_rupiah: settings.point_value_rupiah,
      min_redeem_points: settings.min_redeem_points,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    alert(error ? errMsg(error) : "Aturan poin disimpan");
  }

  return (
    <section className="grid gap-4 p-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="font-bold">Member ({count})</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama / no. HP" className="ml-auto rounded-lg border px-3 py-1.5 text-sm" />
        </div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="py-1">Nama</th><th>No. HP</th><th className="text-right">Poin</th><th className="text-right">Kunjungan</th><th className="text-right">Total belanja</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} onClick={() => setSelected(m)} className={`cursor-pointer border-t hover:bg-kopi-50 ${selected?.id === m.id ? "bg-kopi-50" : ""}`}>
                <td className="py-2">{m.name ?? "-"}</td>
                <td>{m.phone}</td>
                <td className="text-right font-semibold">{m.points}</td>
                <td className="text-right">{m.visit_count}</td>
                <td className="text-right">{rupiah(m.total_spent)}</td>
              </tr>
            ))}
            {members.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Belum ada member</td></tr>}
          </tbody>
        </table>
      </div>

      <aside className="space-y-4">
        {selected && <MemberDetail key={selected.id} member={selected} onChanged={(m) => { setSelected(m); load(); }} />}

        {settings && (
          <form onSubmit={saveSettings} className="space-y-2 rounded-xl bg-white p-4 text-sm shadow-sm">
            <h2 className="font-bold">Aturan poin</h2>
            <label className="block">Belanja berapa untuk 1 poin (Rp)
              <input type="number" min={1} disabled={!isOwner} value={settings.rupiah_per_point} onChange={(e) => setSettings({ ...settings, rupiah_per_point: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-1.5" />
            </label>
            <label className="block">Nilai 1 poin saat ditukar (Rp)
              <input type="number" min={1} disabled={!isOwner} value={settings.point_value_rupiah} onChange={(e) => setSettings({ ...settings, point_value_rupiah: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-1.5" />
            </label>
            <label className="block">Minimal poin untuk ditukar
              <input type="number" min={1} disabled={!isOwner} value={settings.min_redeem_points} onChange={(e) => setSettings({ ...settings, min_redeem_points: Number(e.target.value) })} className="mt-1 w-full rounded-lg border px-3 py-1.5" />
            </label>
            {isOwner ? <button className="w-full rounded-lg bg-kopi-900 py-2 font-semibold text-white">Simpan aturan</button> : <p className="text-xs text-gray-500">Hanya owner yang bisa mengubah.</p>}
          </form>
        )}

        <div className="qr-sheet flex flex-col items-center rounded-xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">QR Cek Poin</h2>
          {origin && <QRCodeSVG value={`${origin}/poin`} size={160} className="mt-2" />}
          <p className="mt-2 text-center text-xs text-gray-500">Scan untuk cek poin member Forka</p>
          <button onClick={() => window.print()} className="mt-2 text-xs text-kopi-600 underline print:hidden">Cetak</button>
        </div>
      </aside>
    </section>
  );
}

function MemberDetail({ member, onChanged }: { member: Member; onChanged: (m: Member) => void }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [pts, setPts] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase().from("point_transactions").select("id, type, points, note, created_at, outlets(name)").eq("member_id", member.id).order("created_at", { ascending: false }).limit(30);
    setTxs((data as unknown as Tx[]) ?? []);
  }, [member.id]);
  useEffect(() => { load(); }, [load]);

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    const { data, error } = await supabase().rpc("adjust_member_points", { p_member_id: member.id, p_points: Number(pts), p_note: note });
    if (error) return alert(errMsg(error));
    setPts("");
    setNote("");
    onChanged(data as Member);
    load();
  }

  return (
    <div className="rounded-xl bg-white p-4 text-sm shadow-sm">
      <h2 className="font-bold">{member.name ?? "Member"} · {member.phone}</h2>
      <p className="text-gray-500">{member.points} poin · daftar {tanggalJam(member.created_at)}</p>
      <form onSubmit={adjust} className="mt-3 flex gap-2">
        <input required type="number" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="+/- poin" className="w-20 rounded-lg border px-2 py-1" />
        <input required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan koreksi" className="flex-1 rounded-lg border px-2 py-1" />
        <button className="rounded-lg bg-kopi-700 px-3 text-white">OK</button>
      </form>
      <ul className="mt-3 max-h-64 divide-y overflow-y-auto">
        {txs.map((t) => (
          <li key={t.id} className="flex justify-between py-1.5">
            <span>
              {{ earn: "Dapat", redeem: "Tukar", adjust: "Koreksi", reversal: "Batal" }[t.type] ?? t.type}
              <span className="block text-xs text-gray-500">{tanggalJam(t.created_at)}{t.outlets ? ` · ${t.outlets.name}` : ""}{t.note ? ` · ${t.note}` : ""}</span>
            </span>
            <span className={t.points > 0 ? "text-green-700" : "text-red-700"}>{t.points > 0 ? "+" : ""}{t.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
