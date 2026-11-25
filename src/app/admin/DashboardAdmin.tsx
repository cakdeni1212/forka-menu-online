"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import { rupiah } from "@/lib/format";
import type { Outlet } from "@/lib/types";

type Period = "day" | "week" | "month";
type Stats = { total_sales: number; paid_sales: number; unpaid_sales: number; transactions: number; items_sold: number };
type Point = { idx: number; cur: number; prev: number };
type Dash = {
  period: Period; start: string; end: string; prev_start: string; prev_end: string;
  current: Stats; previous: Stats; month_to_date: number; month_projection: number | null;
  series: Point[]; generated_at: string;
};

const CUR_COLOR = "#b45f24";  // periode ini
const PREV_COLOR = "#a3a3a3"; // periode sebelumnya (garis putus-putus, pembanding)
const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

// ---- utilitas tanggal (string YYYY-MM-DD, tanpa jam supaya aman zona waktu) ----
const todayWIB = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const toD = (s: string) => new Date(s + "T00:00:00Z");
const fromD = (d: Date) => d.toISOString().slice(0, 10);
function shift(date: string, period: Period, dir: number): string {
  const d = toD(date);
  if (period === "day") d.setUTCDate(d.getUTCDate() + dir);
  else if (period === "week") d.setUTCDate(d.getUTCDate() + 7 * dir);
  else d.setUTCMonth(d.getUTCMonth() + dir, 1);
  return fromD(d);
}
const fmtTgl = (s: string, opt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "2-digit" }) =>
  toD(s).toLocaleDateString("id-ID", { ...opt, timeZone: "UTC" });

function pct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}
function short(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  if (n >= 1_000) return (n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 }) + " rb";
  return String(n);
}

export default function DashboardAdmin({ outletId, outlets, isOwner, initialPeriod = "day" }: {
  outletId: string; outlets: Outlet[]; isOwner: boolean; initialPeriod?: Period;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [date, setDate] = useState(todayWIB());
  const [scope, setScope] = useState<"outlet" | "all">("outlet");
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase().rpc("sales_dashboard", {
      p_outlet_id: scope === "all" ? null : outletId,
      p_period: period,
      p_date: date,
    });
    setLoading(false);
    if (error) return setError(errMsg(error));
    setError("");
    setData(data as Dash);
  }, [outletId, period, date, scope]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // segarkan tiap menit
    return () => clearInterval(t);
  }, [load]);

  const isFuture = !!data && data.end >= todayWIB(); // tidak bisa maju ke periode yang belum terjadi
  const c = data?.current;
  const p = data?.previous;
  const avg = (s?: Stats) => (s && s.transactions ? Math.round(s.total_sales / s.transactions) : 0);
  const ipt = (s?: Stats) => (s && s.transactions ? s.items_sold / s.transactions : 0);

  return (
    <section className="p-4">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-bold text-kopi-900">Dashboard Penjualan</h1>
          <span className="text-sm text-gray-500">
            {scope === "all" ? "Semua outlet" : outlets.find((o) => o.id === outletId)?.name}
            {data && ` · diperbarui ${new Date(data.generated_at).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })}`}
          </span>
        </div>

        {/* Filter: periode, navigasi tanggal, cakupan outlet */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-b pb-4">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-kopi-200">
            {(["day", "week", "month"] as Period[]).map((k) => (
              <button key={k} onClick={() => setPeriod(k)} className={`px-4 py-2 text-sm ${period === k ? "bg-kopi-900 text-white" : "hover:bg-kopi-50"}`}>
                {{ day: "Harian", week: "Mingguan", month: "Bulanan" }[k]}
              </button>
            ))}
          </div>
          <div className="flex items-center overflow-hidden rounded-lg ring-1 ring-kopi-200">
            <button onClick={() => setDate(shift(date, period, -1))} className="px-3 py-2 hover:bg-kopi-50" aria-label="Periode sebelumnya">‹</button>
            <label className="relative px-3 py-2 text-sm">
              {data ? (data.start === data.end ? fmtTgl(data.start, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : `${fmtTgl(data.start)} – ${fmtTgl(data.end)}`) : "..."}
              <input type="date" value={date} max={todayWIB()} onChange={(e) => e.target.value && setDate(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <button onClick={() => setDate(shift(date, period, 1))} disabled={isFuture} className="px-3 py-2 hover:bg-kopi-50 disabled:opacity-30" aria-label="Periode berikutnya">›</button>
          </div>
          {date !== todayWIB() && <button onClick={() => setDate(todayWIB())} className="text-sm text-kopi-600 underline">Hari ini</button>}
          {isOwner && outlets.length > 1 && (
            <select value={scope} onChange={(e) => setScope(e.target.value as "outlet" | "all")} className="ml-auto rounded-lg border px-2 py-2 text-sm">
              <option value="outlet">Outlet ini</option>
              <option value="all">Semua outlet</option>
            </select>
          )}
          {loading && <span className="text-xs text-gray-400">memuat...</span>}
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {c && p && data && (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr_1.6fr]">
              <div>
                <Label text="Total Penjualan" change={pct(c.total_sales, p.total_sales)} />
                <div className="text-3xl font-bold text-kopi-900">{rupiah(c.total_sales)}</div>
                <div className="mt-2 space-y-0.5 text-sm text-gray-600">
                  <div>Akumulasi dari awal bulan <b>{rupiah(data.month_to_date)}</b></div>
                  {data.month_projection != null && <div>Proyeksi bulan ini <b>{rupiah(data.month_projection)}</b></div>}
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <Label text="Penjualan Belum Dibayar" change={null} />
                  <div className={`text-xl font-bold ${c.unpaid_sales > 0 ? "text-amber-700" : ""}`}>{rupiah(c.unpaid_sales)}</div>
                </div>
                <div>
                  <Label text="Penjualan Terbayar" change={pct(c.paid_sales, p.paid_sales)} />
                  <div className="text-xl font-bold">{rupiah(c.paid_sales)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-kopi-100">
                <Tile label="Transaksi" value={c.transactions.toLocaleString("id-ID")} change={pct(c.transactions, p.transactions)} />
                <Tile label="Penjualan per Transaksi" value={rupiah(avg(c))} change={pct(avg(c), avg(p))} />
                <Tile label="Produk Terjual" value={c.items_sold.toLocaleString("id-ID")} change={pct(c.items_sold, p.items_sold)} />
                <Tile label="Produk per Transaksi" value={ipt(c).toLocaleString("id-ID", { maximumFractionDigits: 1 })} change={pct(ipt(c), ipt(p))} />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Persentase dibandingkan dengan {data.prev_start === data.prev_end ? fmtTgl(data.prev_start) : `${fmtTgl(data.prev_start)} – ${fmtTgl(data.prev_end)}`}. Pesanan batal tidak dihitung.
            </p>

            <SalesChart data={data} />
          </>
        )}
      </div>
    </section>
  );
}

function Change({ v }: { v: number | null }) {
  if (v == null || !isFinite(v)) return null;
  const up = v >= 0;
  return (
    <span className={`ml-1.5 text-xs font-semibold ${up ? "text-green-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
    </span>
  );
}
function Label({ text, change }: { text: string; change: number | null }) {
  return <div className="text-sm text-gray-500">{text}<Change v={change} /></div>;
}
function Tile({ label, value, change }: { label: string; value: string; change: number | null }) {
  return (
    <div className="bg-kopi-50 p-4">
      <Label text={label} change={change} />
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

// ---------------- Grafik garis: periode ini vs sebelumnya ----------------
function SalesChart({ data }: { data: Dash }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const s = data.series;
  const label = (i: number) =>
    data.period === "day" ? `${String(i).padStart(2, "0")}:00` : data.period === "week" ? HARI[i] : String(i + 1);
  const title = data.period === "day" ? "per jam" : data.period === "week" ? "per hari" : "per tanggal";

  const W = 800, H = 260, L = 56, R = 12, T = 12, B = 28;
  const max = Math.max(1, ...s.map((p) => Math.max(p.cur, p.prev)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => L + (s.length <= 1 ? 0 : (i / (s.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  // Titik "periode ini" yang belum terjadi (jam/tanggal ke depan) tidak digambar, supaya garis tidak jatuh ke 0
  const today = todayWIB();
  const nowHour = new Date(Date.now() + 7 * 3600_000).getUTCHours();
  const isFutureIdx = (i: number) => {
    if (data.period === "day") return data.start > today || (data.start === today && s[i].idx > nowHour);
    const d = toD(data.start);
    d.setUTCDate(d.getUTCDate() + s[i].idx);
    return fromD(d) > today;
  };
  const curCount = s.filter((_, i) => !isFutureIdx(i)).length;
  const path = (k: "cur" | "prev") =>
    s.slice(0, k === "cur" ? curCount : s.length).map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = data.period === "day" ? 3 : data.period === "month" ? 5 : 1;
  const h = hover != null ? s[hover] : null;

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="font-bold">Penjualan <span className="text-sm font-normal text-gray-500">{title}</span></h2>
        <div className="ml-auto flex items-center gap-4 text-sm text-gray-700">
          <span className="flex items-center gap-1.5"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={PREV_COLOR} strokeWidth="2" strokeDasharray="4 3" /></svg>Periode sebelumnya</span>
          <span className="flex items-center gap-1.5"><svg width="18" height="4"><line x1="0" y1="2" x2="18" y2="2" stroke={CUR_COLOR} strokeWidth="2" /></svg>Periode ini</span>
          <button onClick={() => setTable(!table)} className="text-kopi-600 underline">{table ? "Lihat grafik" : "Lihat tabel"}</button>
        </div>
      </div>

      {table ? (
        <div className="mt-3 max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-gray-500"><tr><th className="py-1">{data.period === "day" ? "Jam" : data.period === "week" ? "Hari" : "Tanggal"}</th><th className="text-right">Periode ini</th><th className="text-right">Sebelumnya</th></tr></thead>
            <tbody>{s.map((p) => <tr key={p.idx} className="border-t"><td className="py-1">{label(p.idx)}</td><td className="text-right">{rupiah(p.cur)}</td><td className="text-right text-gray-500">{rupiah(p.prev)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
        <div className="relative min-w-[640px]">
          <svg
            viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grafik penjualan ${title}`}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * W;
              const i = Math.round(((px - L) / (W - L - R)) * (s.length - 1));
              setHover(Math.max(0, Math.min(s.length - 1, i)));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#eee" />
                <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#6b7280">{short(t)}</text>
              </g>
            ))}
            {s.map((p, i) => (i % every === 0 || i === s.length - 1) && (
              <text key={p.idx} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === s.length - 1 ? "end" : "middle"} fontSize="11" fill="#6b7280">{label(p.idx)}</text>
            ))}
            <path d={path("prev")} fill="none" stroke={PREV_COLOR} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
            <path d={path("cur")} fill="none" stroke={CUR_COLOR} strokeWidth="2" strokeLinejoin="round" />
            {hover != null && h && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#9ca3af" strokeDasharray="2 3" />
                <circle cx={x(hover)} cy={y(h.prev)} r="4" fill={PREV_COLOR} stroke="#fff" strokeWidth="2" />
                {!isFutureIdx(hover) && <circle cx={x(hover)} cy={y(h.cur)} r="5" fill={CUR_COLOR} stroke="#fff" strokeWidth="2" />}
              </g>
            )}
          </svg>
          {hover != null && h && (
            <div
              className="pointer-events-none absolute top-0 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-gray-200"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.7 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
            >
              <div className="font-semibold">{data.period === "day" ? "Jam " : data.period === "month" ? "Tanggal " : ""}{label(h.idx)}</div>
              <div className="mt-1 flex justify-between gap-4"><span className="flex items-center gap-1"><i className="inline-block h-0.5 w-3" style={{ background: CUR_COLOR }} />Periode ini</span><b>{isFutureIdx(hover) ? "–" : rupiah(h.cur)}</b></div>
              <div className="flex justify-between gap-4 text-gray-600"><span className="flex items-center gap-1"><i className="inline-block h-0.5 w-3" style={{ background: PREV_COLOR }} />Sebelumnya</span><span>{rupiah(h.prev)}</span></div>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
