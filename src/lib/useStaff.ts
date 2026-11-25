"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Outlet, Staff } from "@/lib/types";
import { OUTLET_COLS } from "@/lib/types";

/** Session login staff + data staff + outlet yang boleh diakses. */
export function useStaff() {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletId, setOutletIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setStaff(null);
      setLoading(false);
      return;
    }
    const sb = supabase();
    const { data: st } = await sb.from("staff").select("*").eq("id", s.user.id).maybeSingle();
    setStaff(st);
    if (st) {
      const q = sb.from("outlets").select(OUTLET_COLS).order("name");
      const { data: os } = st.role === "owner" ? await q : await q.eq("id", st.outlet_id);
      setOutlets(os ?? []);
      const saved = localStorage.getItem("forka_outlet");
      const pick = os?.find((o) => o.id === saved)?.id ?? os?.[0]?.id ?? null;
      setOutletIdState(pick);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => load(s));
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const setOutletId = (id: string) => {
    localStorage.setItem("forka_outlet", id);
    setOutletIdState(id);
  };

  return { session, staff, outlets, outletId, setOutletId, loading, signOut: () => supabase().auth.signOut() };
}
