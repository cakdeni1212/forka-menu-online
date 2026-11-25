-- =====================================================================
-- Forka Menu Online - Fase 2: Member & Poin
-- Jalankan SETELAH 0001_fase1_menu_kasir.sql
--
-- - Member dikenali dari nomor HP (tanpa install aplikasi)
-- - Poin otomatis masuk saat pesanan dibayar
-- - Poin bisa ditukar jadi potongan harga di kasir
-- - Customer cek poin di /poin dengan nomor HP
-- - Poin berlaku di semua outlet
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengaturan poin (1 baris, berlaku semua outlet)
-- ---------------------------------------------------------------------
create table public.loyalty_settings (
  id                  boolean primary key default true check (id),  -- memaksa hanya 1 baris
  rupiah_per_point    integer not null default 10000 check (rupiah_per_point > 0),  -- belanja Rp10.000 = 1 poin
  point_value_rupiah  integer not null default 1000  check (point_value_rupiah > 0), -- 1 poin = potongan Rp1.000
  min_redeem_points   integer not null default 10    check (min_redeem_points >= 1),
  updated_at          timestamptz not null default now()
);
insert into public.loyalty_settings default values;

-- ---------------------------------------------------------------------
-- Member
-- ---------------------------------------------------------------------
create table public.members (
  id             uuid primary key default gen_random_uuid(),
  phone          text not null unique check (phone ~ '^0[0-9]{8,14}$'),  -- format 08xxxxxxxxxx
  name           text,
  points         integer not null default 0 check (points >= 0),
  total_spent    bigint  not null default 0,
  visit_count    integer not null default 0,
  first_outlet_id uuid references public.outlets(id) on delete set null,
  last_visit_at  timestamptz,
  created_at     timestamptz not null default now()
);

create type public.point_tx_type as enum ('earn', 'redeem', 'adjust', 'reversal');

create table public.point_transactions (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id) on delete cascade,
  outlet_id   uuid references public.outlets(id) on delete set null,
  order_id    uuid references public.orders(id) on delete set null,
  type        public.point_tx_type not null,
  points      integer not null,       -- positif = tambah, negatif = kurang
  note        text,
  created_by  uuid references public.staff(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index point_tx_member_idx on public.point_transactions (member_id, created_at desc);

-- Kolom baru di pesanan
alter table public.orders
  add column member_id       uuid references public.members(id) on delete set null,
  add column discount        integer not null default 0 check (discount >= 0),
  add column points_redeemed integer not null default 0 check (points_redeemed >= 0),
  add column points_earned   integer not null default 0 check (points_earned >= 0);

-- ---------------------------------------------------------------------
-- Normalisasi nomor HP: "+62 812-3456-789" / "62812..." / "0812..." -> "0812..."
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when d is null or d = '' then null
    when d like '62%' then '0' || substr(d, 3)
    when d like '8%'  then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function public.is_valid_phone(p text)
returns boolean language sql immutable as $$
  select coalesce(public.normalize_phone(p) ~ '^0[0-9]{8,14}$', false)
$$;

-- ---------------------------------------------------------------------
-- RPC publik: cek poin pakai nomor HP (halaman /poin)
-- Catatan: siapa pun yang tahu nomor HP bisa lihat poinnya. Verifikasi OTP
-- direncanakan menyusul. Data yang dibuka sengaja dibatasi.
-- ---------------------------------------------------------------------
create or replace function public.check_member_points(p_phone text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when m.id is null then null else jsonb_build_object(
    'name', case when m.name is null then null else split_part(m.name, ' ', 1) end,
    'phone_masked', left(m.phone, 4) || repeat('*', greatest(length(m.phone) - 7, 0)) || right(m.phone, 3),
    'points', m.points,
    'point_value_rupiah', s.point_value_rupiah,
    'rupiah_per_point', s.rupiah_per_point,
    'min_redeem_points', s.min_redeem_points,
    'member_since', m.created_at,
    'history', coalesce((
      select jsonb_agg(h order by h.created_at desc) from (
        select t.type, t.points, t.created_at, o.name as outlet_name
          from public.point_transactions t left join public.outlets o on o.id = t.outlet_id
         where t.member_id = m.id order by t.created_at desc limit 10
      ) h), '[]'::jsonb)
  ) end
  from public.loyalty_settings s
  left join public.members m on m.phone = public.normalize_phone(p_phone)
$$;

-- ---------------------------------------------------------------------
-- RPC staff: cari member (dipakai kasir saat bayar)
-- ---------------------------------------------------------------------
create or replace function public.find_member(p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m public.members;
  s public.loyalty_settings;
begin
  if public.current_staff_role() is null then raise exception 'Khusus staff'; end if;
  select * into s from public.loyalty_settings;
  select * into m from public.members where phone = public.normalize_phone(p_phone);
  if not found then
    return jsonb_build_object('found', false, 'settings', to_jsonb(s));
  end if;
  return jsonb_build_object('found', true, 'member', to_jsonb(m), 'settings', to_jsonb(s));
end $$;

-- ---------------------------------------------------------------------
-- pay_order versi baru: bisa pasang member + tukar poin
-- (menggantikan pay_order dari Fase 1)
-- ---------------------------------------------------------------------
drop function if exists public.pay_order(uuid, public.payment_method, integer);

create or replace function public.pay_order(
  p_order_id      uuid,
  p_method        public.payment_method,
  p_amount_paid   integer default null,
  p_member_phone  text    default null,  -- kosong = pakai no. HP di pesanan (kalau ada)
  p_member_name   text    default null,
  p_redeem_points integer default 0
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order    public.orders;
  v_set      public.loyalty_settings;
  v_member   public.members;
  v_phone    text;
  v_redeem   int := greatest(coalesce(p_redeem_points, 0), 0);
  v_discount int := 0;
  v_total    int;
  v_earn     int := 0;
  v_paid     int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.can_access_outlet(v_order.outlet_id) then raise exception 'Tidak punya akses'; end if;
  if v_order.status <> 'pending' then raise exception 'Pesanan sudah diproses'; end if;

  select * into v_set from public.loyalty_settings;

  -- Tentukan member
  v_phone := public.normalize_phone(coalesce(nullif(trim(p_member_phone), ''), v_order.customer_phone));
  if v_phone is not null then
    if not public.is_valid_phone(v_phone) then
      if nullif(trim(p_member_phone), '') is not null then
        raise exception 'Nomor HP member tidak valid';
      end if;
      v_phone := null; -- no. HP dari pesanan tidak valid: abaikan saja
    end if;
  end if;

  if v_phone is not null then
    insert into public.members (phone, name, first_outlet_id)
    values (v_phone, left(nullif(trim(coalesce(p_member_name, v_order.customer_name)), ''), 60), v_order.outlet_id)
    on conflict (phone) do update
      set name = coalesce(public.members.name, excluded.name)
    returning * into v_member;
    -- kunci baris member supaya poin tidak dobel dipakai di 2 kasir sekaligus
    select * into v_member from public.members where id = v_member.id for update;
  end if;

  -- Tukar poin
  if v_redeem > 0 then
    if v_member.id is null then raise exception 'Isi nomor HP member untuk tukar poin'; end if;
    if v_redeem < v_set.min_redeem_points then
      raise exception 'Minimal tukar % poin', v_set.min_redeem_points;
    end if;
    if v_redeem > v_member.points then raise exception 'Poin member tidak cukup'; end if;
    v_discount := least(v_redeem * v_set.point_value_rupiah, v_order.subtotal);
    -- jangan potong poin lebih dari yang terpakai
    v_redeem := ceil(v_discount::numeric / v_set.point_value_rupiah)::int;
  end if;

  v_total := v_order.subtotal - v_discount;

  if p_method = 'cash' then
    v_paid := coalesce(p_amount_paid, v_total);
    if v_paid < v_total then raise exception 'Uang yang dibayar kurang'; end if;
  else
    v_paid := v_total;
  end if;

  -- Poin dihitung dari jumlah yang benar-benar dibayar
  if v_member.id is not null then
    v_earn := floor(v_total::numeric / v_set.rupiah_per_point)::int;
  end if;

  update public.orders
     set status = 'paid', payment_method = p_method, amount_paid = v_paid,
         change_amount = v_paid - v_total, paid_at = now(), cashier_id = auth.uid(),
         member_id = v_member.id, customer_phone = coalesce(v_phone, customer_phone),
         discount = v_discount, total = v_total,
         points_redeemed = v_redeem, points_earned = v_earn
   where id = p_order_id
  returning * into v_order;

  if v_member.id is not null then
    if v_redeem > 0 then
      insert into public.point_transactions (member_id, outlet_id, order_id, type, points, created_by)
      values (v_member.id, v_order.outlet_id, v_order.id, 'redeem', -v_redeem, auth.uid());
    end if;
    if v_earn > 0 then
      insert into public.point_transactions (member_id, outlet_id, order_id, type, points, created_by)
      values (v_member.id, v_order.outlet_id, v_order.id, 'earn', v_earn, auth.uid());
    end if;
    update public.members
       set points = points - v_redeem + v_earn,
           total_spent = total_spent + v_total,
           visit_count = visit_count + 1,
           last_visit_at = now()
     where id = v_member.id;
  end if;

  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Admin/owner: koreksi poin manual
-- ---------------------------------------------------------------------
create or replace function public.adjust_member_points(p_member_id uuid, p_points integer, p_note text)
returns public.members
language plpgsql security definer set search_path = public as $$
declare
  m public.members;
begin
  if public.current_staff_role() not in ('owner', 'admin') then raise exception 'Khusus admin/owner'; end if;
  if coalesce(p_points, 0) = 0 then raise exception 'Jumlah poin tidak boleh 0'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'Isi alasan koreksi poin'; end if;
  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception 'Member tidak ditemukan'; end if;
  if m.points + p_points < 0 then raise exception 'Poin tidak boleh minus'; end if;
  insert into public.point_transactions (member_id, type, points, note, created_by)
  values (m.id, 'adjust', p_points, left(trim(p_note), 200), auth.uid());
  update public.members set points = points + p_points where id = m.id returning * into m;
  return m;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.loyalty_settings   enable row level security;
alter table public.members            enable row level security;
alter table public.point_transactions enable row level security;

create policy loyalty_read on public.loyalty_settings for select using (true);
create policy loyalty_owner_write on public.loyalty_settings for update
  using (public.current_staff_role() = 'owner') with check (public.current_staff_role() = 'owner');

-- Member berlaku lintas outlet, jadi semua staff boleh lihat.
-- Perubahan poin hanya lewat RPC supaya selalu tercatat di riwayat.
create policy members_staff_read on public.members for select using (public.current_staff_role() is not null);
create policy point_tx_staff_read on public.point_transactions for select using (public.current_staff_role() is not null);

-- Hak akses fungsi
grant execute on function public.check_member_points(text) to anon, authenticated;
revoke execute on function public.find_member(text) from public, anon;
grant execute on function public.find_member(text) to authenticated;
revoke execute on function public.pay_order(uuid, public.payment_method, integer, text, text, integer) from public, anon;
grant execute on function public.pay_order(uuid, public.payment_method, integer, text, text, integer) to authenticated;
revoke execute on function public.adjust_member_points(uuid, integer, text) from public, anon;
grant execute on function public.adjust_member_points(uuid, integer, text) to authenticated;
