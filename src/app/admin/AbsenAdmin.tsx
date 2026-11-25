"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { tanggalJam } from "@/lib/format";
import type { Attendance } from "@/lib/types";

type Recap = { employee_id: string; name: string; jabatan: string | null; days: number; shifts: number; total_minutes: number; open_shift: boolean };

const todayWIB = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const firstOfMonthWIB = () => todayWIB().slice(0, 8) + "01";
const hhmm = (min: number) => `${Math.floor(min / 60)}j ${String(min % 60).padStart(2, "0")}m`;

export default function AbsenAdmin({ outletId }: { outletId: string }) {
  const [from, setFrom] = useState(firstOfMonthWIB());
  const [to, setTo] = useState(todayWIB());
  const [recap, setRecap] = useState<Recap[]>([]);
  const [log, setLog] = useState<Attendance[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = supabase();
    const [r, l] = await Promise.all([
      sb.rpc("attendance_recap", { p_outlet_id: outletId, p_from: from, p_to: to }),
      sb.from("attendance").select("*, employees(name)").eq("outlet_id", outletId)
        .gte("created_at", `${from}T00:00:00+07:00`).lte("created_at", `${to}T23:59:59+07:00`)
        .order("created_at", { ascending: false }).limit(200),
    ]);
    setRecap((r.data as Recap[]) ?? []);
    setLog((l.data as Attendance[]) ?? []);
  }, [outletId, from, to]);
  useEffect(() => { load(); }, [load]);

  async function showPhoto(path: string) {
    const { data } = await supabase().storage.from("absen").createSignedUrl(path, 300);
    if (data) setPhoto(data.signedUrl);
  }

  function exportCsv() {
    const rows = [["Nama", "Jabatan", "Hari masuk", "Shift lengkap", "Total jam", "Total menit"],
      ...recap.map((r) => [r.name, r.jabatan ?? "", r.days, r.shifts, hhmm(r.total_minutes), r.total_minutes])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `rekap-absen-${from}-sd-${to}.csv`;
    a.click();
  }

  return (
    <section className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Periode</span>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-2 py-1" />
        <span>s/d</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-2 py-1" />
        <button onClick={exportCsv} className="ml-auto rounded-lg px-3 py-1 ring-1 ring-kopi-500">Download CSV</button>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Rekap jam kerja</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-gray-500"><tr><th className="py-1">Nama</th><th>Jabatan</th><th className="text-right">Hari masuk</th><th className="text-right">Shift lengkap</th><th className="text-right">Total jam</th><th></th></tr></thead>
          <tbody>
            {recap.map((r) => (
              <tr key={r.employee_id} className="border-t">
                <td className="py-2">{r.name}</td>
                <td>{r.jabatan ?? "-"}</td>
                <td className="text-right">{r.days}</td>
                <td className="text-right">{r.shifts}</td>
                <td className="text-right font-semibold">{hhmm(r.total_minutes)}</td>
                <td className="pl-3 text-xs text-amber-700">{r.open_shift ? "Ada absen tanpa pulang" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h2 className="font-bold">Log absen</h2>
        <ul className="mt-2 divide-y text-sm">
          {log.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className={`w-16 rounded px-2 py-0.5 text-center text-xs ${a.type === "in" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>{a.type === "in" ? "Masuk" : "Pulang"}</span>
              <span className="flex-1">{a.employees?.name}</span>
              <span className="text-gray-500">{tanggalJam(a.created_at)}</span>
              {a.photo_path && <button onClick={() => showPhoto(a.photo_path!)} className="text-kopi-600 underline">Foto</button>}
            </li>
          ))}
          {log.length === 0 && <li className="py-4 text-center text-gray-400">Belum ada absen di periode ini</li>}
        </ul>
      </div>

      {photo && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4" onClick={() => setPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Selfie absen" className="max-h-[80vh] rounded-xl" />
        </div>
      )}
    </section>
  );
}
