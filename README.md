# Forka Menu Online

Sistem coffee shop Forka: menu online, order dari HP lewat QR meja, kasir, member & poin, dan absen karyawan. Siap multi-outlet.

## Fase 1: Menu online & kasir

| Halaman | Untuk siapa | Fungsi |
|---|---|---|
| `/` | Customer | Pilih outlet |
| `/menu/[outlet]` | Customer | Lihat menu. Kalau dibuka dari QR meja (`?meja=...`), bisa langsung pesan |
| `/pesanan/[id]` | Customer | Nomor pesanan + status (menunggu bayar / lunas), update otomatis |
| `/kasir` | Kasir | Antrian pesanan realtime (ada bunyi), cari pakai nama/nomor antrian, order walk-in, bayar Tunai / QRIS (EDC) dengan konfirmasi manual, kembalian, cetak struk 58mm, rekap omzet hari ini |
| `/admin` | Admin/Owner | Kelola kategori & menu, tandai menu habis, tambah meja per area (Lantai 1, Lantai 2, Outdoor, ...), cetak QR meja per area |

Alur order:
1. Customer pesan langsung di kasir, **atau** scan QR (QR Umum di pintu masuk/kasir, atau QR meja) lalu pilih menu sendiri di HP.
2. Setelah kirim, customer dapat **nomor antrian** (A-001, A-002, ... reset tiap hari) dan namanya tampil besar di HP.
3. Customer ke kasir, sebut nama atau nomor antrian. Kasir ketik di kolom cari, Enter untuk buka pembayaran.
4. Bayar tunai atau QRIS di mesin EDC (terpisah dari sistem). Kasir klik **Lunas** setelah pembayaran berhasil, struk tercetak.

Tidak ada payment gateway: sistem hanya mencatat metode bayar (Tunai / QRIS) yang dipilih kasir.

Peran staff:
- `owner`: semua outlet
- `admin`: kelola menu & meja di 1 outlet
- `cashier`: kasir di 1 outlet

Harga selalu dihitung ulang di database, jadi customer tidak bisa mengubah harga dari HP.

## Dashboard penjualan

Halaman pertama di `/admin`. Pilih Harian / Mingguan / Bulanan, geser periode dengan tombol ‹ ›, atau klik tanggal untuk loncat.

- Total penjualan + perubahan % dibanding periode sebelumnya
- Akumulasi dari awal bulan dan proyeksi akhir bulan (rata-rata per hari × jumlah hari)
- Penjualan belum dibayar vs terbayar
- Jumlah transaksi, rata-rata per transaksi, produk terjual, produk per transaksi
- Grafik penjualan per jam / hari / tanggal vs periode sebelumnya (bisa dilihat sebagai tabel)
- Per outlet; owner bisa pilih "Semua outlet"

Pesanan batal tidak dihitung. Semua tanggal pakai WIB.

## Fase 2: Member & poin

| Halaman | Untuk siapa | Fungsi |
|---|---|---|
| `/poin` | Customer | Masukkan nomor HP, lihat poin + riwayat. Tanpa install aplikasi. QR-nya bisa dicetak dari Admin → Member |
| `/kasir` (saat bayar) | Kasir | Isi/cek nomor HP member, member baru otomatis terdaftar, tukar poin jadi potongan |
| `/admin` → Member | Admin/Owner | Daftar & cari member, riwayat poin, koreksi poin manual (wajib isi alasan), atur nilai poin (owner) |

Aturan default (bisa diubah owner): belanja Rp10.000 = 1 poin, 1 poin = potongan Rp1.000, minimal tukar 10 poin. Poin dihitung dari total setelah potongan, berlaku di semua outlet. Semua perubahan poin tercatat di riwayat.

Catatan: saat ini siapa pun yang tahu nomor HP bisa melihat poinnya (nama disingkat, nomor disamarkan). Verifikasi OTP direncanakan menyusul.

## Fase 3: Absen karyawan

| Halaman | Untuk siapa | Fungsi |
|---|---|---|
| `/absen` | Karyawan | Di tablet outlet: masukkan PIN → ambil selfie → otomatis tercatat masuk/pulang |
| `/admin` → Karyawan | Admin/Owner | Tambah karyawan + PIN (4-6 angka, unik per outlet), nonaktifkan, ganti PIN |
| `/admin` → Absen | Admin/Owner | Rekap jam kerja per periode, log absen dengan foto selfie, download CSV |

Karyawan tidak perlu akun login. Tablet absen cukup login sekali pakai akun kasir outlet tersebut. Foto disimpan di Supabase Storage (bucket privat `absen`), hanya admin/owner yang bisa melihat. Kamera butuh HTTPS (otomatis di Vercel; di laptop `localhost` juga boleh).

## Setup

1. **Buat project di [Supabase](https://supabase.com)** (tier gratis cukup untuk mulai).
2. Buka **SQL Editor**, jalankan file migration **berurutan** (copy-paste isinya, klik Run):
   - `supabase/migrations/0001_fase1_menu_kasir.sql`
   - `supabase/migrations/0002_fase2_member_poin.sql`
   - `supabase/migrations/0003_fase3_absen.sql`
   - `supabase/migrations/0004_area_meja.sql` (area/lantai meja)
   - `supabase/migrations/0005_dashboard_penjualan.sql` (dashboard admin)
   - `supabase/migrations/0006_alur_order_qr_umum.sql` (QR umum, nomor antrian A-001, nama wajib)

   Kalau 0001 sudah pernah dijalankan, cukup jalankan 0002 lalu 0003.
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

- OTP untuk cek poin (WhatsApp/SMS)
- Laporan lengkap lintas outlet, stok bahan, kelola akun staff dari aplikasi
- Poles tampilan
