import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteProduct } from "@/app/actions";
import { db } from "@/lib/db";
import { VENDOR_LABELS } from "@/lib/constants";
import { ProductForm } from "@/components/product-form";
import {
  Card, ExtLink, Flash, Info, PageHeader, StatusBadge, btnDanger, btnSecondary, fmtDateTime, money, numFmt, one, type SearchParams,
} from "@/components/ui";

export const dynamic = "force-dynamic";

function withDays(value: string, days?: number | null) {
  return value && days ? `${value} (${days} days)` : value;
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const product = await db.product.findUnique({
    where: { id },
    include: { vendor: { include: { client: { select: { id: true, name: true } } } } },
  });
  if (!product) notFound();
  const [vendors, planLines, sameAsin] = await Promise.all([
    db.vendor.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    db.purchaseItem.findMany({ where: { asin: product.asin }, include: { vendor: { select: { id: true, name: true } } } }),
    db.product.findMany({
      where: { asin: product.asin, id: { not: product.id } },
      include: { vendor: { select: { id: true, name: true, type: true } } },
    }),
  ]);
  const v = product.vendor;

  return (
    <div>
      <PageHeader
        title={<span className="font-mono">{product.asin}</span>}
        subtitle={
          <>
            {product.subNiche ?? "No sub-niche"} · sold by{" "}
            <Link href={`/vendors/${v.id}?tab=products`} className="text-indigo-600 hover:underline">{v.name}</Link> ({VENDOR_LABELS[v.type]})
            {v.client && <> · for <Link href={`/clients/${v.client.id}`} className="text-indigo-600 hover:underline">{v.client.name}</Link></>}
          </>
        }
        actions={
          <a href={`https://www.amazon.com/dp/${product.asin}`} target="_blank" rel="noreferrer" className={btnSecondary}>View on Amazon</a>
        }
      />
      <Flash msg={one(sp.msg)} error={one(sp.error)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Research">
          <dl className="grid grid-cols-2 gap-3">
            <Info label="BSR" value={withDays(numFmt(product.bsr), product.bsrDays)} />
            <Info label="Price" value={withDays(money(product.price), product.priceDays)} />
            <Info label="Monthly sales" value={numFmt(product.monthlySales)} />
            <Info label="Amazon stock rate" value={withDays(numFmt(product.amazonStockRate, "%"), product.amazonStockRateDays)} />
            <Info label="Dominant seller" value={withDays(numFmt(product.dominantSellerPct, "%"), product.dominantSellerDays)} />
            <Info label="A+ content" value={product.aPlus === null ? "" : product.aPlus ? "Yes" : "No"} />
            <Info label="Reviews" value={numFmt(product.reviews)} />
            <Info label="Rating" value={product.rating !== null ? `${product.rating} ★` : ""} />
            <Info label="Forecast purchase" value={numFmt(product.forecastPurchase)} />
            <Info label="Updated" value={fmtDateTime(product.updatedAt)} />
          </dl>
          {product.marketplaceProfile && (
            <div className="mt-3 text-sm"><span className="text-xs text-slate-500">Marketplace profile</span><br /><ExtLink href={product.marketplaceProfile} /></div>
          )}
        </Card>

        <Card title="Vendor">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Link href={`/vendors/${v.id}`} className="font-medium text-indigo-700 hover:underline">{v.name}</Link>
              <StatusBadge status={v.status} />
            </div>
            <div className="text-slate-600">{VENDOR_LABELS[v.type]}</div>
            {v.emails[0] && <div className="text-slate-600">{v.emails[0]}</div>}
            {v.phones[0] && <div className="text-slate-600">{v.phones[0]}</div>}
          </div>
          {sameAsin.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1 text-xs font-medium text-slate-500">Also offered by</div>
              <ul className="space-y-1 text-sm">
                {sameAsin.map((o) => (
                  <li key={o.id}>
                    <Link href={`/products/${o.id}`} className="text-indigo-600 hover:underline">{o.vendor.name}</Link>
                    <span className="text-xs text-slate-500"> · {VENDOR_LABELS[o.vendor.type]}{o.price !== null && ` · ${money(o.price)}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title={`In purchasing plans (${planLines.length})`}>
          {planLines.length === 0 ? (
            <p className="text-sm text-slate-500">Not in any purchasing plan yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {planLines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <Link href={`/vendors/${l.vendor.id}?tab=purchasing`} className="text-indigo-600 hover:underline">{l.vendor.name}</Link>
                  <span className="text-slate-600">{numFmt(l.quantity)} {l.unit} · {money(Number(l.costPrice) * l.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Edit product" className="mt-6">
        <ProductForm product={product} vendors={vendors} vendorId={product.vendorId} returnTo={`/products/${product.id}`} />
        <form action={deleteProduct} className="mt-6 border-t border-slate-100 pt-4">
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="returnTo" value="/products" />
          <button className={btnDanger}>Delete product</button>
        </form>
      </Card>
    </div>
  );
}
