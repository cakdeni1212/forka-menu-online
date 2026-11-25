# Forka Menu Online

Sistem coffee shop Forka: menu online, order dari HP lewat QR meja, dan kasir. Siap multi-outlet.

## Fase 1 (yang ada sekarang)

| Halaman | Untuk siapa | Fungsi |
|---|---|---|
| `/` | Customer | Pilih outlet |
| `/menu/[outlet]` | Customer | Lihat menu. Kalau dibuka dari QR meja (`?meja=...`), bisa langsung pesan |
| `/pesanan/[id]` | Customer | Nomor pesanan + status (menunggu bayar / lunas), update otomatis |
| `/kasir` | Kasir | Pesanan masuk realtime (ada bunyi), order walk-in, bayar (Tunai/QRIS/Debit/Transfer), kembalian, cetak struk 58mm, rekap omzet hari ini |
| `/admin` | Admin/Owner | Kelola kategori & menu, tandai menu habis, tambah meja, cetak QR meja |

Alur order: customer scan QR di meja → pilih menu → kirim → dapat nomor pesanan → bayar di kasir → kasir klik Lunas → struk tercetak.

Peran staff:
- `owner`: semua outlet
- `admin`: kelola menu & meja di 1 outlet
- `cashier`: kasir di 1 outlet

Harga selalu dihitung ulang di database, jadi customer tidak bisa mengubah harga dari HP.

## Setup

1. **Buat project di [Supabase](https://supabase.com)** (tier gratis cukup untuk mulai).
2. Buka **SQL Editor**, jalankan isi `supabase/migrations/0001_fase1_menu_kasir.sql`.
   > Database yang dibuat dengan `0001` versi lama (sebelum 25 Nov 2026) perlu juga menjalankan `supabase/migrations/0001b_fix_staff_policy.sql`. Gejalanya: login kasir/admin selalu muncul "belum terdaftar sebagai staff". Aman dijalankan ulang.
3. (Opsional) Jalankan `supabase/seed.sql` untuk data contoh (1 outlet, 3 meja, 7 menu).
4. **Buat akun owner**: Authentication → Users → Add user (email + password). Salin User UID-nya, lalu di SQL Editor:
   ```sql
   insert into public.staff (id, name, role) values ('<USER_UID>', 'Deni', 'owner');
   ```
   Untuk kasir: buat user lagi, lalu
   ```sql
   insert into public.staff (id, outlet_id, name, role)
   values ('<USER_UID>', (select id from outlets where slug = 'forka-pusat'), 'Kasir 1', 'cashier');
   ```
5. Tambah outlet baru (kalau buka cabang):
   ```sql
   insert into public.outlets (slug, name, address) values ('forka-cabang2', 'Forka Coffee - Cabang 2', 'Jl. ...');
   ```
6. Salin `.env.example` jadi `.env.local`, isi dari Supabase → Project Settings → API.
7. Jalankan:
   ```bash
   npm install
   npm run dev
   ```
   Buka http://localhost:3000. Kalau pakai seed, coba order di http://localhost:3000/menu/forka-pusat?meja=meja1demo

## Deploy

Paling gampang di [Vercel](https://vercel.com): import repo ini, isi 2 environment variable dari `.env.example`, deploy. Setelah dapat domain, cetak ulang QR meja dari `/admin` supaya link-nya pakai domain asli.

## Rencana berikutnya

- **Fase 2 – Member & poin**: poin otomatis dari nomor HP di pesanan, halaman cek poin via QR (masukin nomor HP + OTP), tukar poin.
- **Fase 3 – Absen**: PIN + selfie di tablet kasir, rekap jam kerja per outlet.
- **Fase 4**: QRIS otomatis (Midtrans/Xendit), laporan lengkap, stok bahan, kelola staff dari aplikasi.
