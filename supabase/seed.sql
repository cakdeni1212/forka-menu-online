-- Data contoh untuk coba-coba. Aman dihapus nanti.
insert into public.outlets (id, slug, name, address, phone) values
  ('11111111-1111-1111-1111-111111111111', 'forka-pusat', 'Forka Coffee - Pusat', 'Jl. Contoh No. 1', '081200000000');

insert into public.tables (outlet_id, label, token) values
  ('11111111-1111-1111-1111-111111111111', 'Meja 1', 'meja1demo'),
  ('11111111-1111-1111-1111-111111111111', 'Meja 2', 'meja2demo'),
  ('11111111-1111-1111-1111-111111111111', 'Meja 3', 'meja3demo');

insert into public.categories (id, outlet_id, name, sort_order) values
  ('22222222-2222-2222-2222-000000000001', '11111111-1111-1111-1111-111111111111', 'Kopi', 1),
  ('22222222-2222-2222-2222-000000000002', '11111111-1111-1111-1111-111111111111', 'Non Kopi', 2),
  ('22222222-2222-2222-2222-000000000003', '11111111-1111-1111-1111-111111111111', 'Makanan', 3);

insert into public.products (outlet_id, category_id, name, description, price, sort_order) values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 'Es Kopi Susu Forka', 'Espresso, susu segar, gula aren', 22000, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 'Americano', 'Hot / Iced', 18000, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000001', 'Cappuccino', 'Espresso dengan foam susu', 25000, 3),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000002', 'Matcha Latte', 'Matcha Jepang dan susu', 26000, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000002', 'Chocolate', 'Cokelat premium', 24000, 2),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000003', 'Croissant Butter', null, 20000, 1),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-000000000003', 'Kentang Goreng', null, 18000, 2);
