-- =====================================================================
-- Forka Menu Online - Fase 3: Absen karyawan (PIN + selfie)
-- Jalankan SETELAH 0002_fase2_member_poin.sql
--
-- - Karyawan tidak perlu akun login. Cukup nama + PIN 4-6 digit.
-- - Absen dilakukan di tablet outlet (yang sudah login sebagai staff outlet itu)
--   di halaman /absen: masukkan PIN, ambil selfie, otomatis masuk/pulang.
-- - Foto selfie disimpan di Supabase Storage bucket privat "absen".
-- =====================================================================

create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets(id) on delete cascade,
  name        text not null,
  jabatan    text,                    -- contoh: Barista, Kitchen, Kasir
  pin_hash    text not null,           -- PIN disimpan ter-hash (bcrypt), tidak bisa dibaca
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index employees_outlet_idx on public.employees (outlet_id);

create type public.attendance_type as enum ('in', 'out');

create table public.attendance (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  outlet_id    uuid not null references public.outlets(id) on delete cascade,
  type         public.attendance_type not null,
  photo_path   text,                   -- path file di bucket "absen"
  device_staff uuid references public.staff(id) on delete set null,  -- akun tablet yang dipakai
  created_at   timestamptz not null default now()
);
create index attendance_outlet_time_idx on public.attendance (outlet_id, created_at desc);
create index attendance_employee_time_idx on public.attendance (employee_id, created_at desc);

-- ---------------------------------------------------------------------
-- Admin: tambah / ubah karyawan (PIN unik per outlet)
-- ---------------------------------------------------------------------
create or replace function public.save_employee(
  p_outlet_id uuid,
  p_name      text,
  p_jabatan  text default null,
  p_pin       text default null,       -- wajib untuk karyawan baru; kosong = PIN tidak diubah
  p_id        uuid default null,
  p_is_active boolean default true
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  if not public.can_manage_outlet(p_outlet_id) then raise exception 'Khusus admin/owner outlet ini'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Nama karyawan wajib diisi'; end if;

  if p_pin is not null and p_pin <> '' then
    if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN harus 4-6 angka'; end if;
    if exists (select 1 from public.employees
                where outlet_id = p_outlet_id and is_active and id is distinct from p_id
                  and pin_hash = crypt(p_pin, pin_hash)) then
      raise exception 'PIN sudah dipakai karyawan lain di outlet ini';
    end if;
  elsif p_id is null then
    raise exception 'PIN wajib diisi untuk karyawan baru';
  end if;

  if p_id is null then
    insert into public.employees (outlet_id, name, jabatan, pin_hash, is_active)
    values (p_outlet_id, trim(p_name), nullif(trim(p_jabatan), ''), crypt(p_pin, gen_salt('bf')), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update public.employees
       set name = trim(p_name), jabatan = nullif(trim(p_jabatan), ''), is_active = coalesce(p_is_active, true),
           pin_hash = case when p_pin is not null and p_pin <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end
     where id = p_id and outlet_id = p_outlet_id
    returning id into v_id;
    if v_id is null then raise exception 'Karyawan tidak ditemukan'; end if;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Tablet: cek PIN dulu (sebelum foto), supaya karyawan tahu dia absen masuk/pulang
-- ---------------------------------------------------------------------
create or replace function public.attendance_check_pin(p_outlet_id uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  e    public.employees;
  last public.attendance;
begin
  if not public.can_access_outlet(p_outlet_id) then raise exception 'Tablet ini tidak terdaftar di outlet tersebut'; end if;
  select * into e from public.employees
   where outlet_id = p_outlet_id and is_active and pin_hash = crypt(coalesce(p_pin, ''), pin_hash)
   limit 1;
  if not found then raise exception 'PIN salah'; end if;

  select * into last from public.attendance where employee_id = e.id order by created_at desc limit 1;
  return jsonb_build_object(
    'employee_id', e.id, 'name', e.name,
    -- shift dianggap masih jalan kalau terakhir "masuk" dan belum lewat 16 jam
    'next_type', case when last.type = 'in' and last.created_at > now() - interval '16 hours' then 'out' else 'in' end,
    'last_at', last.created_at
  );
end $$;

-- ---------------------------------------------------------------------
-- Tablet: simpan absen (PIN dicek ulang di sini)
-- ---------------------------------------------------------------------
create or replace function public.clock_attendance(p_outlet_id uuid, p_pin text, p_photo_path text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  info jsonb;
  rec  public.attendance;
begin
  info := public.attendance_check_pin(p_outlet_id, p_pin);
  if nullif(p_photo_path, '') is null then raise exception 'Selfie wajib diambil'; end if;
  if split_part(p_photo_path, '/', 1) <> p_outlet_id::text then raise exception 'Lokasi foto tidak valid'; end if;

  insert into public.attendance (employee_id, outlet_id, type, photo_path, device_staff)
  values ((info->>'employee_id')::uuid, p_outlet_id, (info->>'next_type')::public.attendance_type, p_photo_path, auth.uid())
  returning * into rec;

  return jsonb_build_object('name', info->>'name', 'type', rec.type, 'at', rec.created_at);
end $$;

-- ---------------------------------------------------------------------
-- Rekap jam kerja: pasangkan tiap "masuk" dengan "pulang" berikutnya
-- ---------------------------------------------------------------------
create or replace function public.attendance_recap(p_outlet_id uuid, p_from date, p_to date)
returns table (employee_id uuid, name text, jabatan text, days bigint, shifts bigint, total_minutes bigint, open_shift boolean)
language sql stable security definer set search_path = public as $$
  with ev as (
    select a.*, lead(a.type) over w as next_type, lead(a.created_at) over w as next_at
      from public.attendance a
     where a.outlet_id = p_outlet_id
       and public.can_manage_outlet(p_outlet_id)
       and (a.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
    window w as (partition by a.employee_id order by a.created_at)
  ), shifts as (
    select employee_id, created_at as in_at,
           case when next_type = 'out' and next_at - created_at <= interval '16 hours' then next_at end as out_at
      from ev where type = 'in'
  )
  select e.id, e.name, e.jabatan,
         count(distinct (s.in_at at time zone 'Asia/Jakarta')::date),
         count(s.out_at),
         coalesce(sum(extract(epoch from (s.out_at - s.in_at)) / 60)::bigint, 0),
         bool_or(s.out_at is null)
    from public.employees e
    left join shifts s on s.employee_id = e.id
   where e.outlet_id = p_outlet_id and public.can_manage_outlet(p_outlet_id)
   group by e.id, e.name, e.jabatan
   order by e.name
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.employees  enable row level security;
alter table public.attendance enable row level security;

create policy employees_manage_read on public.employees for select using (public.can_manage_outlet(outlet_id));
create policy attendance_manage_read on public.attendance for select using (public.can_manage_outlet(outlet_id));
-- pin_hash tidak boleh dibaca dari aplikasi sama sekali
revoke all on public.employees from anon, authenticated;
grant select (id, outlet_id, name, jabatan, is_active, created_at) on public.employees to authenticated;
revoke insert, update, delete on public.attendance from anon, authenticated;

-- Hak akses fungsi
revoke execute on function public.save_employee(uuid, text, text, text, uuid, boolean) from public, anon;
revoke execute on function public.attendance_check_pin(uuid, text) from public, anon;
revoke execute on function public.clock_attendance(uuid, text, text) from public, anon;
revoke execute on function public.attendance_recap(uuid, date, date) from public, anon;
grant execute on function public.save_employee(uuid, text, text, text, uuid, boolean) to authenticated;
grant execute on function public.attendance_check_pin(uuid, text) to authenticated;
grant execute on function public.clock_attendance(uuid, text, text) to authenticated;
grant execute on function public.attendance_recap(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: bucket privat untuk selfie. Path file: <outlet_id>/<tanggal>/<uuid>.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absen', 'absen', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy absen_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'absen' and public.can_access_outlet(((storage.foldername(name))[1])::uuid));

create policy absen_view on storage.objects for select to authenticated
  using (bucket_id = 'absen' and public.can_manage_outlet(((storage.foldername(name))[1])::uuid));
