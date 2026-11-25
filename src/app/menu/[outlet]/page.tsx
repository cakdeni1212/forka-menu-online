import { Suspense } from "react";
import MenuClient from "./MenuClient";

export default async function MenuPage({ params }: { params: Promise<{ outlet: string }> }) {
  const { outlet } = await params;
  return (
    <Suspense fallback={<p className="p-6 text-sm text-gray-500">Memuat menu...</p>}>
      <MenuClient outletSlug={outlet} />
    </Suspense>
  );
}
