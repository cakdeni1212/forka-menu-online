"use client";

import { useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { rupiah } from "@/lib/format";

type PointInfo = {
  name: string | null; phone_masked: string; points: number; point_value_rupiah: number;
  rupiah_per_point: number; min_redeem_points: number; member_since: string;
  history: { type: "earn" | "redeem" | "adjust" | "reversal"; points: number; created_at: string; outlet_name: string | null }[];
};

const TX_LABEL = { earn: "Dapat poin", redeem: "Tukar poin", adjust: "Koreksi", reversal: "Pembatalan" };

export default function PoinPage() {
  const [phone, setPhone] = useState("");
  const [info, setInfo] = useState<PointInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotFound(false);
    setInfo(null);
    const { data, error } = await supabase().rpc("check_member_points", { p_phone: phone });
    setBusy(false);
    if (error) return alert(errMsg(error));
    if (!data) setNotFound(true);
    else setInfo(data as PointInfo);
  }

  return (
    <main className="mx-auto max-w-md p-5">
      <div className="rounded-2xl bg-kopi-900 p-6 text-white">
        <h1 className="text-2xl font-bold">Cek Poin Member</h1>
        <p className="mt-1 text-sm text-kopi-200">Forka Coffee · berlaku di semua outlet</p>
        <form onSubmit={check} className="mt-4 flex gap-2">
          <input
            value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required
            placeholder="Nomor HP, contoh 0812..." className="flex-1 rounded-lg px-3 py-2 text-gray-900"
          />
          <button disabled={busy} className="rounded-lg bg-kopi-500 px-4 font-semibold disabled:opacity-60">{busy ? "..." : "Cek"}</button>
        </form>
      </div>

      {notFound && (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm shadow-sm">
          Nomor ini belum terdaftar. Sebutkan nomor HP kamu ke kasir saat bayar untuk mulai kumpulin poin.
        </p>
      )}

      {info && (
        <>
          <div className="mt-4 rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-gray-500">Halo{info.name ? `, ${info.name}` : ""} · {info.phone_masked}</p>
            <p className="mt-2 text-5xl font-bold text-kopi-900">{info.points}</p>
            <p className="text-sm text-gray-500">poin</p>
            <p className="mt-3 text-sm">Senilai <b>{rupiah(info.points * info.point_value_rupiah)}</b></p>
            <p className="mt-3 text-xs text-gray-500">
              Belanja {rupiah(info.rupiah_per_point)} = 1 poin. Tukar mulai {info.min_redeem_points} poin di kasir.
            </p>
          </div>
          {info.history.length > 0 && (
            <div className="mt-4 rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Riwayat terakhir</h2>
              <ul className="mt-2 divide-y text-sm">
                {info.history.map((h, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>
                      {TX_LABEL[h.type]}
                      <span className="block text-xs text-gray-500">
                        {new Date(h.created_at).toLocaleDateString("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" })}
                        {h.outlet_name ? ` · ${h.outlet_name}` : ""}
                      </span>
                    </span>
                    <span className={h.points > 0 ? "text-green-700" : "text-red-700"}>{h.points > 0 ? "+" : ""}{h.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
