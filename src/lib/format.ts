export const rupiah = (n: number) => "Rp " + n.toLocaleString("id-ID");

export const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export const tanggalJam = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export const PAYMENT_LABEL: Record<string, string> = { cash: "Tunai", qris: "QRIS", debit: "Debit", transfer: "Transfer" };

/** Awal hari ini (WIB) dalam ISO, untuk filter laporan harian. */
export function startOfTodayWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600_000);
  const d = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - 7 * 3600_000;
  return new Date(d).toISOString();
}
