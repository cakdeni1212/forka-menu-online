"use client";

import LoginForm from "@/components/LoginForm";
import type { useStaff } from "@/lib/useStaff";

/** Tampilkan login / pesan akses ditolak sebelum masuk halaman staff. */
export default function StaffGate({ s, title, children }: { s: ReturnType<typeof useStaff>; title: string; children: React.ReactNode }) {
  if (s.loading) return <p className="p-6 text-sm text-gray-500">Memuat...</p>;
  if (!s.session) return <LoginForm title={title} />;
  if (!s.staff || !s.staff.is_active)
    return (
      <main className="p-6">
        <p>Akun ini belum terdaftar sebagai staff.</p>
        <button onClick={s.signOut} className="mt-3 text-sm underline">Keluar</button>
      </main>
    );
  if (!s.outletId) return <p className="p-6">Belum ada outlet. Tambahkan outlet dulu di Supabase.</p>;
  return <>{children}</>;
}
