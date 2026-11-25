-- =====================================================================
-- Forka Menu Online - Alur order customer
-- Jalankan SETELAH 0005_dashboard_penjualan.sql. Aman dijalankan ulang.
--
-- Alur: customer pesan langsung di kasir, ATAU scan QR lalu pilih menu
-- sendiri di HP. Setelah kirim, customer dapat nomor antrian dan tinggal
-- sebut nama / nomor antrian ke kasir. Pembayaran selalu di kasir
-- (tunai atau QRIS lewat mesin EDC), kasir yang menandai lunas.
--
-- Perubahan:
-- 1. QR umum per outlet (ditempel di pintu masuk / dekat kasir), selain QR meja.
--    Pesanan dari QR umum tidak terikat meja.
-- 2. Nomor antrian lebih pendek: A-001, A-002, ... (reset tiap hari per outlet).
-- 3. Nama customer wajib untuk pesanan dari HP, supaya kasir gampang memanggil.
-- =====================================================================

-- 1. Token QR umum per outlet
alter table public.outlets
  add column if not exists qr_token text unique default encode(gen_random_bytes(9), 'hex');
update public.outlets set qr_token = encode(gen_random_bytes(9), 'hex') where qr_token is null;
alter table public.outlets alter column qr_token set not null;

-- qr_token hanya boleh dilihat staff (customer cukup tahu dari QR yang discan)
revoke select on public.outlets from anon, authenticated;
grant select (id, slug, name, address, phone, is_active, created_at) on public.outlets to anon, authenticated;

create or replace function public.get_outlet_qr_token(p_outlet_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select qr_token from public.outlets where id = p_outlet_id and public.can_access_outlet(p_outlet_id)
$$;
revoke execute on function public.get_outlet_qr_token(uuid) from public, anon;
grant execute on function public.get_outlet_qr_token(uuid) to authenticated;

-- 2. Nomor antrian: A-001 (lebih dari 999 sehari otomatis jadi A-1000)
create or replace function public.next_order_no(p_outlet uuid, p_date date)
returns text language plpgsql as $$
declare
  n int;
begin
  perform pg_advisory_xact_lock(hashtext(p_outlet::text || p_date::text));
  select count(*) + 1 into n from public.orders where outlet_id = p_outlet and business_date = p_date;
  return 'A-' || case when n < 1000 then lpad(n::text, 3, '0') else n::text end;
end $$;
revoke execute on function public.next_order_no(uuid, date) from public, anon, authenticated;

-- Info dari token QR: bisa token meja atau token QR umum outlet
create or replace function public.get_table_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('id', t.id, 'label', t.label, 'area', t.area, 'outlet_id', t.outlet_id, 'outlet_slug', o.slug)
       from public.tables t join public.outlets o on o.id = t.outlet_id
      where t.token = p_token and t.is_active and o.is_active),
    (select jsonb_build_object('id', null, 'label', null, 'area', null, 'outlet_id', o.id, 'outlet_slug', o.slug)
       from public.outlets o
      where o.qr_token = p_token and o.is_active)
  )
$$;

-- 3. Pesan dari HP: terima token meja ATAU token QR umum, nama wajib
create or replace function public.place_qr_order(
  p_table_token   text,
  p_items         jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note          text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_outlet_id uuid;
  v_table_id  uuid;
  v_order     public.orders;
  v_date      date := (now() at time zone 'Asia/Jakarta')::date;
  v_item      jsonb;
  v_product   public.products;
  v_qty       int;
  v_total     int := 0;
begin
  select t.outlet_id, t.id into v_outlet_id, v_table_id
    from public.tables t join public.outlets o on o.id = t.outlet_id
   where t.token = p_table_token and t.is_active and o.is_active;
  if v_outlet_id is null then
    select o.id into v_outlet_id from public.outlets o where o.qr_token = p_table_token and o.is_active;
  end if;
  if v_outlet_id is null then
    raise exception 'QR tidak valid atau outlet sedang tutup';
  end if;

  if nullif(trim(p_customer_name), '') is null then
    raise exception 'Isi nama dulu ya, biar kasir gampang manggil';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang masih kosong';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Terlalu banyak item dalam satu pesanan';
  end if;

  insert into public.orders (outlet_id, table_id, order_no, business_date, source, customer_name, customer_phone, note)
  values (v_outlet_id, v_table_id, public.next_order_no(v_outlet_id, v_date), v_date, 'qr',
          left(trim(p_customer_name), 60),
          left(nullif(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9+]', '', 'g'), ''), 20),
          left(nullif(trim(p_note), ''), 300))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Jumlah item tidak valid';
    end if;
    select * into v_product from public.products
     where id = (v_item->>'product_id')::uuid and outlet_id = v_outlet_id and is_available;
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

grant execute on function public.place_qr_order(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_table_by_token(text) to anon, authenticated;
