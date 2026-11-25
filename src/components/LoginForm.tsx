"use client";

import { useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";

export default function LoginForm({ title }: { title: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(errMsg(error));
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-kopi-900">{title}</h1>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full rounded-lg border px-3 py-2" />
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full rounded-lg border px-3 py-2" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-lg bg-kopi-900 py-2 font-semibold text-white disabled:opacity-60">
          {busy ? "Masuk..." : "Masuk"}
        </button>
      </form>
    </main>
  );
}
