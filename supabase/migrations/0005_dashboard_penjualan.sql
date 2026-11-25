-- =====================================================================
-- Forka Menu Online - Dashboard penjualan (halaman depan admin)
-- Jalankan SETELAH 0004_area_meja.sql
--
-- Satu fungsi yang menghitung semua angka dashboard untuk 1 outlet
-- (atau semua outlet untuk owner, p_outlet_id = null) dalam periode
-- harian / mingguan / bulanan, dibandingkan dengan periode sebelumnya.
-- Semua tanggal pakai zona waktu WIB (business_date pesanan).
-- Pesanan yang dibatalkan tidak dihitung.
-- =====================================================================

create index if not exists orders_outlet_bizdate_idx on public.orders (outlet_id, business_date);

create or replace function public.sales_dashboard(
  p_outlet_id uuid,          -- null = semua outlet (khusus owner)
  p_period    text,          -- 'day' | 'week' | 'month'
  p_date      date           -- tanggal acuan; minggu mulai Senin
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_start      date;
  v_end        date;   -- eksklusif
  v_prev_start date;
  v_prev_end   date;
  v_today      date := (now() at time zone 'Asia/Jakarta')::date;
  v_month0     date := date_trunc('month', p_date)::date;
  v_month_end  date := (date_trunc('month', p_date) + interval '1 month')::date;
  v_mtd_end    date;
  v_mtd        bigint;
  v_days_in    int;
  v_days_gone  int;
  cur          jsonb;
  prev         jsonb;
  series       jsonb;
begin
  if p_outlet_id is null then
    if public.current_staff_role() is distinct from 'owner' then raise exception 'Khusus owner'; end if;
  elsif not public.can_manage_outlet(p_outlet_id) then
    raise exception 'Khusus admin/owner outlet ini';
  end if;

  if p_period = 'day' then
    v_start := p_date;                                   v_end := p_date + 1;
    v_prev_start := p_date - 1;                          v_prev_end := p_date;
  elsif p_period = 'week' then
    v_start := date_trunc('week', p_date)::date;         v_end := v_start + 7;
    v_prev_start := v_start - 7;                         v_prev_end := v_start;
  elsif p_period = 'month' then
    v_start := v_month0;                                 v_end := v_month_end;
    v_prev_start := (v_month0 - interval '1 month')::date; v_prev_end := v_month0;
  else
    raise exception 'Periode harus day, week, atau month';
  end if;

  -- Ringkasan untuk satu rentang tanggal
  with rng(tag, s, e) as (values ('cur', v_start, v_end), ('prev', v_prev_start, v_prev_end)),
  o as (
    select r.tag, x.id, x.status, x.total
      from rng r
      join public.orders x on x.business_date >= r.s and x.business_date < r.e
     where x.status <> 'cancelled' and (p_outlet_id is null or x.outlet_id = p_outlet_id)
  ),
  agg as (
    select r.tag,
           coalesce(sum(o.total), 0)                                   as total_sales,
           coalesce(sum(o.total) filter (where o.status = 'paid'), 0)    as paid_sales,
           coalesce(sum(o.total) filter (where o.status = 'pending'), 0) as unpaid_sales,
           count(o.id)                                                  as transactions,
           coalesce((select sum(i.qty) from public.order_items i join o o2 on o2.id = i.order_id where o2.tag = r.tag), 0) as items_sold
      from rng r left join o on o.tag = r.tag
     group by r.tag
  )
  select
    (select to_jsonb(a) - 'tag' from agg a where tag = 'cur'),
    (select to_jsonb(a) - 'tag' from agg a where tag = 'prev')
  into cur, prev;

  -- Grafik: harian = per jam, mingguan = per hari (Sen-Min), bulanan = per tanggal.
  -- Periode sebelumnya disejajarkan per posisi (jam ke-n / hari ke-n).
  with o as (
    select case when x.business_date >= v_start then 'cur' else 'prev' end as tag,
           case p_period
             when 'day' then extract(hour from x.created_at at time zone 'Asia/Jakarta')::int
             when 'week' then x.business_date - (case when x.business_date >= v_start then v_start else v_prev_start end)
             else extract(day from x.business_date)::int - 1
           end as idx,
           x.total
      from public.orders x
     where x.status <> 'cancelled'
       and (p_outlet_id is null or x.outlet_id = p_outlet_id)
       and x.business_date >= v_prev_start and x.business_date < v_end
  ),
  buckets as (
    select g as idx from generate_series(0, case p_period when 'day' then 23 when 'week' then 6 else 30 end) g
  )
  select jsonb_agg(jsonb_build_object(
           'idx', b.idx,
           'cur',  coalesce((select sum(total) from o where o.tag = 'cur'  and o.idx = b.idx), 0),
           'prev', coalesce((select sum(total) from o where o.tag = 'prev' and o.idx = b.idx), 0)
         ) order by b.idx)
    into series
    from buckets b
   where p_period <> 'month' or b.idx < (v_end - v_start);

  -- Akumulasi dari awal bulan s/d akhir periode yang dipilih (maks. hari ini)
  v_mtd_end := least(v_end, v_month_end, v_today + 1);
  select coalesce(sum(total), 0) into v_mtd
    from public.orders
   where status <> 'cancelled' and (p_outlet_id is null or outlet_id = p_outlet_id)
     and business_date >= v_month0 and business_date < greatest(v_mtd_end, v_month0);

  -- Proyeksi: rata-rata per hari berjalan x jumlah hari di bulan itu
  v_days_in   := v_month_end - v_month0;
  v_days_gone := greatest(v_mtd_end - v_month0, 0);

  return jsonb_build_object(
    'period', p_period,
    'start', v_start, 'end', v_end - 1,
    'prev_start', v_prev_start, 'prev_end', v_prev_end - 1,
    'current', cur,
    'previous', prev,
    'month_to_date', v_mtd,
    'month_projection', case
      when v_days_gone = 0 then null                     -- bulan depan: belum ada data
      when v_days_gone >= v_days_in then v_mtd           -- bulan sudah lewat: angka final
      else round(v_mtd::numeric / v_days_gone * v_days_in)::bigint end,
    'series', coalesce(series, '[]'::jsonb),
    'generated_at', now()
  );
end $$;

revoke execute on function public.sales_dashboard(uuid, text, date) from public, anon;
grant execute on function public.sales_dashboard(uuid, text, date) to authenticated;
