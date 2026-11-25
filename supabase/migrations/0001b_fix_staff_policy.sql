-- =====================================================================
-- Perbaikan: policy staff_read di 0001 versi awal bikin error
-- "infinite recursion detected in policy for relation staff" (42P17),
-- sehingga login kasir/admin selalu tampil "belum terdaftar sebagai staff".
--
-- Jalankan file ini HANYA kalau database kamu dibuat dengan 0001 versi lama.
-- Aman dijalankan berulang kali (juga kalau hotfix manual sudah dipasang).
-- =====================================================================

create or replace function public.current_staff_outlet()
returns uuid language sql stable security definer set search_path = public as $$
  select outlet_id from public.staff where id = auth.uid() and is_active
$$;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select
  using (id = auth.uid() or public.current_staff_role() = 'owner'
         or (public.current_staff_role() = 'admin' and outlet_id = public.current_staff_outlet()));
