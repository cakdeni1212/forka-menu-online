"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase, errMsg } from "@/lib/supabase";
import type { Outlet } from "@/lib/types";

export default function Home() {
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase()
      .from("outlets").select("*").eq("is_active", true).order("name")
      .then(({ data, error }) => (error ? setError(errMsg(error)) : setOutlets(data ?? [])));
  }, []);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-3xl font-bold text-kopi-900">Forka Coffee</h1>
      <p className="mt-1 text-kopi-700">Pilih outlet untuk lihat menu</p>

      {error && <p className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!outlets && !error && <p className="mt-6 text-sm text-gray-500">Memuat...</p>}

      <ul className="mt-6 space-y-3">
        {outlets?.map((o) => (
          <li key={o.id}>
            <Link href={`/menu/${o.slug}`} className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-kopi-100 hover:ring-kopi-500">
              <div className="font-semibold">{o.name}</div>
              {o.address && <div className="text-sm text-gray-500">{o.address}</div>}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex gap-4 text-sm text-kopi-600">
        <Link href="/kasir" className="underline">Masuk kasir</Link>
        <Link href="/admin" className="underline">Admin</Link>
      </div>
    </main>
  );
}
