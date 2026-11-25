-- =====================================================================
-- Forka Menu Online - Fase 1
-- Menu online, order dari HP (scan QR meja), dan kasir.
-- Sudah siap multi-outlet dari awal.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Outlet & meja
-- ---------------------------------------------------------------------
create table public.outlets (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name        text not null,
  address     text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.tables (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets(id) on delete cascade,
  label       text not null,                      -- contoh: "Meja 1", "Outdoor 3"
  token       text not null unique default encode(gen_random_bytes(9), 'hex'), -- dipakai di URL QR
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (outlet_id, label)
);

-- ---------------------------------------------------------------------
-- Staff (terhubung ke auth.users Supabase)
-- role: owner = semua outlet, admin = kelola 1 outlet, cashier = kasir 1 outlet
-- ---------------------------------------------------------------------
create type public.staff_role as enum ('owner', 'admin', 'cashier');

create table public.staff (
  id          uuid primary key references auth.users(id) on delete cascade,
  outlet_id   uuid references public.outlets(id) on delete set null, -- null untuk owner
  name        text not null,
  role        public.staff_role not null default 'cashier',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    uuid not null references public.outlets(id) on delete cascade,
  category_id  uuid references public.categories(id) on delete set null,
  name         text not null,
  description  text,
  price        integer not null check (price >= 0),  -- dalam Rupiah
  image_url    text,
  is_available boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index products_outlet_idx on public.products (outlet_id);

-- ---------------------------------------------------------------------
-- Pesanan
-- status: pending (baru masuk, belum bayar) -> paid (lunas) | cancelled
-- ---------------------------------------------------------------------
create type public.order_status   as enum ('pending', 'paid', 'cancelled');
create type public.order_source   as enum ('qr', 'pos');
create type public.payment_method as enum ('cash', 'qris', 'debit', 'transfer');

create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  outlet_id       uuid not null references public.outlets(id) on delete restrict,
  table_id        uuid references public.tables(id) on delete set null,
  order_no        text not null,                    -- contoh: "A-0012" (reset tiap hari per outlet)
  business_date   date not null default (now() at time zone 'Asia/Jakarta')::date,
  source          public.order_source not null,
  status          public.order_status not null default 'pending',
  customer_name   text,
  customer_phone  text,                             -- dipakai modul member di fase 2
  note            text,
  subtotal        integer not null default 0,
  total           integer not null default 0,
  payment_method  public.payment_method,
  amount_paid     integer,
  change_amount   integer,
  paid_at         timestamptz,
  cashier_id      uuid references public.staff(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (outlet_id, business_date, order_no)
);

create index orders_outlet_status_idx on public.orders (outlet_id, status, created_at desc);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,      -- snapshot nama saat dipesan
  price       integer not null,   -- snapshot harga saat dipesan
  qty         integer not null check (qty > 0 and qty <= 99),
  note        text
);

create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- Helper: data staff yang sedang login
-- ---------------------------------------------------------------------
create or replace function public.current_staff_role()
returns public.staff_role language sql stable security definer set search_path = public as $$
  select role from public.staff where id = auth.uid() and is_active
$$;

-- outlet staff yang sedang login (security definer supaya policy tabel staff tidak rekursif)
create or replace function public.current_staff_outlet()
returns uuid language sql stable security definer set search_path = public as $$
  select outlet_id from public.staff where id = auth.uid() and is_active
$$;

create or replace function public.can_access_outlet(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active
      and (s.role = 'owner' or s.outlet_id = p_outlet)
  )
$$;

create or replace function public.can_manage_outlet(p_outlet uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.is_active
      and (s.role = 'owner' or (s.role = 'admin' and s.outlet_id = p_outlet))
  )
$$;

-- ---------------------------------------------------------------------
-- Nomor pesanan harian per outlet
-- ---------------------------------------------------------------------
create or replace function public.next_order_no(p_outlet uuid, p_date date)
returns text language plpgsql as $$
declare
  n int;
begin
  -- kunci per outlet+tanggal supaya nomor tidak dobel saat ramai
  perform pg_advisory_xact_lock(hashtext(p_outlet::text || p_date::text));
  select count(*) + 1 into n from public.orders where outlet_id = p_outlet and business_date = p_date;
  return 'A-' || lpad(n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- RPC: customer pesan dari HP (scan QR meja). Harga dihitung di server.
-- p_items: [{"product_id": "...", "qty": 2, "note": "less sugar"}]
-- ---------------------------------------------------------------------
create or replace function public.place_qr_order(
  p_table_token   text,
  p_items         jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note          text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table   public.tables;
  v_order   public.orders;
  v_date    date := (now() at time zone 'Asia/Jakarta')::date;
  v_item    jsonb;
  v_product public.products;
  v_qty     int;
  v_total   int := 0;
begin
  select t.* into v_table from public.tables t
    join public.outlets o on o.id = t.outlet_id
   where t.token = p_table_token and t.is_active and o.is_active;
  if not found then
    raise exception 'Meja tidak ditemukan atau tidak aktif';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Terlalu banyak item dalam satu pesanan';
  end if;

  insert into public.orders (outlet_id, table_id, order_no, business_date, source, customer_name, customer_phone, note)
  values (v_table.outlet_id, v_table.id, public.next_order_no(v_table.outlet_id, v_date), v_date, 'qr',
          left(nullif(trim(p_customer_name), ''), 60),
          left(nullif(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g'), ''), 20),
          left(nullif(trim(p_note), ''), 300))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Jumlah item tidak valid';
    end if;

    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and outlet_id = v_table.outlet_id and is_available;
    if not found then
      raise exception 'Ada menu yang sudah tidak tersedia, silakan muat ulang menu';
    end if;

    insert into public.order_items (order_id, product_id, name, price, qty, note)
    values (v_order.id, v_product.id, v_product.name, v_product.price, v_qty, left(nullif(trim(v_item->>'note'), ''), 120));
    v_total := v_total + v_product.price * v_qty;
  end loop;

  update public.orders set subtotal = v_total, total = v_total where id = v_order.id;

  return jsonb_build_object('id', v_order.id, 'order_no', v_order.order_no, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------
-- RPC: customer cek status pesanan (pakai id pesanan yang tidak bisa ditebak)
-- ---------------------------------------------------------------------
create or replace function public.get_order_public(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'total', o.total,
    'created_at', o.created_at, 'customer_name', o.customer_name,
    'outlet_name', ou.name, 'table_label', t.label,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price, 'qty', i.qty, 'note', i.note))
                         from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.outlets ou on ou.id = o.outlet_id
  left join public.tables t on t.id = o.table_id
  where o.id = p_order_id
$$;

-- ---------------------------------------------------------------------
-- RPC: kasir buat pesanan langsung (walk-in) dari layar kasir
-- ---------------------------------------------------------------------
create or replace function public.place_pos_order(
  p_outlet_id     uuid,
  p_items         jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note          text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_order   public.orders;
  v_date    date := (now() at time zone 'Asia/Jakarta')::date;
  v_item    jsonb;
  v_product public.products;
  v_qty     int;
  v_total   int := 0;
begin
  if not public.can_access_outlet(p_outlet_id) then
    raise exception 'Tidak punya akses ke outlet ini';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;

  insert into public.orders (outlet_id, order_no, business_date, source, customer_name, customer_phone, note, cashier_id)
  values (p_outlet_id, public.next_order_no(p_outlet_id, v_date), v_date, 'pos',
          left(nullif(trim(p_customer_name), ''), 60),
          left(nullif(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g'), ''), 20),
          left(nullif(trim(p_note), ''), 300), auth.uid())
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Jumlah item tidak valid';
    end if;
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and outlet_id = p_outlet_id;
    if not found then
      raise exception 'Menu tidak ditemukan';
    end if;
    insert into public.order_items (order_id, product_id, name, price, qty, note)
    values (v_order.id, v_product.id, v_product.name, v_product.price, v_qty, left(nullif(trim(v_item->>'note'), ''), 120));
    v_total := v_total + v_product.price * v_qty;
  end loop;

  update public.orders set subtotal = v_total, total = v_total where id = v_order.id;
  return jsonb_build_object('id', v_order.id, 'order_no', v_order.order_no, 'total', v_total);
end $$;

-- ---------------------------------------------------------------------
-- RPC: kasir terima pembayaran
-- ---------------------------------------------------------------------
create or replace function public.pay_order(
  p_order_id    uuid,
  p_method      public.payment_method,
  p_amount_paid integer default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_paid  int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.can_access_outlet(v_order.outlet_id) then raise exception 'Tidak punya akses'; end if;
  if v_order.status <> 'pending' then raise exception 'Pesanan sudah diproses'; end if;

  v_paid := coalesce(p_amount_paid, v_order.total);
  if v_paid < v_order.total then raise exception 'Uang yang dibayar kurang'; end if;

  update public.orders
     set status = 'paid', payment_method = p_method, amount_paid = v_paid,
         change_amount = v_paid - v_order.total, paid_at = now(), cashier_id = auth.uid()
   where id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Pesanan tidak ditemukan'; end if;
  if not public.can_access_outlet(v_order.outlet_id) then raise exception 'Tidak punya akses'; end if;
  if v_order.status <> 'pending' then raise exception 'Hanya pesanan yang belum dibayar yang bisa dibatalkan'; end if;
  update public.orders set status = 'cancelled' where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.outlets     enable row level security;
alter table public.tables      enable row level security;
alter table public.staff       enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- Publik (customer) boleh lihat outlet aktif & menu
create policy outlets_public_read on public.outlets for select using (is_active or public.can_access_outlet(id));
create policy outlets_owner_write on public.outlets for all
  using (public.current_staff_role() = 'owner') with check (public.current_staff_role() = 'owner');

create policy categories_public_read on public.categories for select using (true);
create policy categories_manage on public.categories for all
  using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));

create policy products_public_read on public.products for select using (true);
create policy products_manage on public.products for all
  using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));

-- Meja: token hanya terlihat oleh staff (customer cukup tahu token dari QR)
create policy tables_staff_read on public.tables for select using (public.can_access_outlet(outlet_id));
create policy tables_manage on public.tables for all
  using (public.can_manage_outlet(outlet_id)) with check (public.can_manage_outlet(outlet_id));

-- Staff: lihat diri sendiri, admin/owner lihat staff outletnya
create policy staff_read on public.staff for select
  using (id = auth.uid() or public.current_staff_role() = 'owner'
         or (public.current_staff_role() = 'admin' and outlet_id = public.current_staff_outlet()));
create policy staff_owner_write on public.staff for all
  using (public.current_staff_role() = 'owner') with check (public.current_staff_role() = 'owner');

-- Pesanan: hanya staff outlet. Insert/update lewat RPC di atas.
create policy orders_staff_read on public.orders for select using (public.can_access_outlet(outlet_id));
create policy order_items_staff_read on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and public.can_access_outlet(o.outlet_id)));

-- Info meja untuk halaman menu (tanpa membuka token meja lain)
create or replace function public.get_table_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'label', t.label, 'outlet_id', t.outlet_id, 'outlet_slug', o.slug)
    from public.tables t join public.outlets o on o.id = t.outlet_id
   where t.token = p_token and t.is_active and o.is_active
$$;

-- Hak akses fungsi
revoke execute on function public.next_order_no(uuid, date) from public, anon, authenticated;
grant execute on function public.place_qr_order(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_order_public(uuid) to anon, authenticated;
grant execute on function public.get_table_by_token(text) to anon, authenticated;
revoke execute on function public.place_pos_order(uuid, jsonb, text, text, text) from public, anon;
revoke execute on function public.pay_order(uuid, public.payment_method, integer) from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
grant execute on function public.place_pos_order(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.pay_order(uuid, public.payment_method, integer) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;

-- Realtime: kasir langsung dapat notifikasi pesanan baru
alter publication supabase_realtime add table public.orders;
