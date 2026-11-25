-- =====================================================================
-- Forka Menu Online - Area / lantai meja
-- Jalankan SETELAH 0003_fase3_absen.sql
--
-- Meja bisa dikelompokkan per area, misalnya "Lantai 1", "Lantai 2",
-- "Outdoor". Nama area bebas diisi per outlet dari Admin -> Meja & QR.
-- Nama meja boleh sama asal beda area (Meja 1 di Lantai 1 dan Lantai 2).
-- =====================================================================

alter table public.tables
  add column if not exists area text,
  add column if not exists sort_order int not null default 0;

alter table public.tables drop constraint if exists tables_outlet_id_label_key;
alter table public.tables drop constraint if exists tables_outlet_area_label_key;
alter table public.tables
  add constraint tables_outlet_area_label_key unique nulls not distinct (outlet_id, area, label);

-- Info meja untuk halaman menu, sekarang dengan area
create or replace function public.get_table_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'label', t.label, 'area', t.area, 'outlet_id', t.outlet_id, 'outlet_slug', o.slug)
    from public.tables t join public.outlets o on o.id = t.outlet_id
   where t.token = p_token and t.is_active and o.is_active
$$;

-- Status pesanan publik, sekarang dengan area meja dan potongan poin
create or replace function public.get_order_public(p_order_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'order_no', o.order_no, 'status', o.status, 'total', o.total,
    'subtotal', o.subtotal, 'discount', o.discount,
    'created_at', o.created_at, 'customer_name', o.customer_name,
    'outlet_name', ou.name, 'table_label', t.label, 'table_area', t.area,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'price', i.price, 'qty', i.qty, 'note', i.note))
                         from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  join public.outlets ou on ou.id = o.outlet_id
  left join public.tables t on t.id = o.table_id
  where o.id = p_order_id
$$;
