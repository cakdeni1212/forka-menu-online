import { rupiah, tanggalJam, PAYMENT_LABEL } from "@/lib/format";
import type { Order, Outlet } from "@/lib/types";

/** Struk 58mm. Disembunyikan di layar, hanya muncul saat dicetak. */
export default function Receipt({ order, outlet }: { order: Order; outlet: Outlet | undefined }) {
  return (
    <div className="struk hidden print:block p-2 font-mono">
      <div className="text-center">
        <div className="font-bold">{outlet?.name}</div>
        {outlet?.address && <div>{outlet.address}</div>}
        {outlet?.phone && <div>{outlet.phone}</div>}
      </div>
      <div className="my-1 border-t border-dashed" />
      <div>No: {order.order_no}{order.tables?.label ? ` · ${order.tables.label}` : ""}</div>
      <div>{tanggalJam(order.paid_at ?? order.created_at)}</div>
      {order.customer_name && <div>Nama: {order.customer_name}</div>}
      <div className="my-1 border-t border-dashed" />
      {order.order_items?.map((i, k) => (
        <div key={k}>
          <div>{i.name}</div>
          <div className="flex justify-between">
            <span>{i.qty} x {i.price.toLocaleString("id-ID")}</span>
            <span>{(i.qty * i.price).toLocaleString("id-ID")}</span>
          </div>
        </div>
      ))}
      <div className="my-1 border-t border-dashed" />
      <div className="flex justify-between font-bold"><span>TOTAL</span><span>{rupiah(order.total)}</span></div>
      {order.payment_method && (
        <>
          <div className="flex justify-between"><span>{PAYMENT_LABEL[order.payment_method]}</span><span>{rupiah(order.amount_paid ?? order.total)}</span></div>
          {!!order.change_amount && <div className="flex justify-between"><span>Kembali</span><span>{rupiah(order.change_amount)}</span></div>}
        </>
      )}
      <div className="my-1 border-t border-dashed" />
      <div className="text-center">Terima kasih!</div>
    </div>
  );
}
