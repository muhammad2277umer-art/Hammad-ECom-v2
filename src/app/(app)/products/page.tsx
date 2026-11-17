import Link from "next/link";
import type { Prisma, VendorType } from "@prisma/client";
import { db } from "@/lib/db";
import { VENDOR_LABELS, VENDOR_TYPES } from "@/lib/constants";
import {
  ExtLink, Flash, PageHeader, Stat, StatusBadge, btnPrimary, btnSecondary, input, money, numFmt, one, type SearchParams,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const SORTS = {
  newest: { label: "Newest first", orderBy: { createdAt: "desc" } },
  sales: { label: "Monthly sales (high to low)", orderBy: { monthlySales: { sort: "desc", nulls: "last" } } },
  bsr: { label: "BSR (best first)", orderBy: { bsr: { sort: "asc", nulls: "last" } } },
  price: { label: "Price (high to low)", orderBy: { price: { sort: "desc", nulls: "last" } } },
  reviews: { label: "Reviews (most first)", orderBy: { reviews: { sort: "desc", nulls: "last" } } },
  rating: { label: "Rating (high to low)", orderBy: { rating: { sort: "desc", nulls: "last" } } },
  forecast: { label: "Forecast purchase (high to low)", orderBy: { forecastPurchase: { sort: "desc", nulls: "last" } } },
} satisfies Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput }>;

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 align-top";

function period(days?: number | null) {
  return days ? <span className="ml-1 text-xs text-slate-400">{days}d</span> : null;
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q)?.trim();
  const type = VENDOR_TYPES.find((t) => t === one(sp.type)) as VendorType | undefined;
  const vendorId = one(sp.vendorId);
  const clientId = one(sp.clientId);
  const aPlus = one(sp.aPlus);
  const sortKey = (one(sp.sort) ?? "newest") as keyof typeof SORTS;
  const sort = SORTS[sortKey] ?? SORTS.newest;

  const where: Prisma.ProductWhereInput = {
    ...(q && {
      OR: [
        { asin: { contains: q, mode: "insensitive" } },
        { subNiche: { contains: q, mode: "insensitive" } },
        { vendor: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(aPlus === "yes" && { aPlus: true }),
    ...(aPlus === "no" && { aPlus: false }),
    ...(vendorId && { vendorId }),
    vendor: {
      ...(type && { type }),
      ...(clientId && { clientId }),
    },
  };

  const [products, totals, vendors, clients] = await Promise.all([
    db.product.findMany({
      where,
      include: { vendor: { include: { client: { select: { id: true, name: true } } } } },
      orderBy: sort.orderBy,
    }),
    db.product.aggregate({ where, _sum: { forecastPurchase: true, monthlySales: true } }),
    db.vendor.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const filtered = Boolean(q || type || vendorId || clientId || aPlus);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Every product researched across your brands, wholesalers and retailers."
        actions={<Link href="/products/new" className={btnPrimary}>Add product</Link>}
      />
      <Flash msg={one(sp.msg)} error={one(sp.error)} />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={filtered ? "Products (filtered)" : "Products"} value={products.length} />
        <Stat label="Monthly sales (units)" value={totals._sum.monthlySales ?? 0} />
        <Stat label="Forecast purchase (units)" value={totals._sum.forecastPurchase ?? 0} />
      </div>

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-8">
        <input name="q" defaultValue={q} placeholder="ASIN, sub-niche or vendor" className={`${input} lg:col-span-2`} />
        <select name="type" defaultValue={type ?? ""} className={input}>
          <option value="">All vendor types</option>
          {VENDOR_TYPES.map((t) => <option key={t} value={t}>{VENDOR_LABELS[t]}s</option>)}
        </select>
        <select name="vendorId" defaultValue={vendorId ?? ""} className={input}>
          <option value="">All vendors</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <select name="clientId" defaultValue={clientId ?? ""} className={input}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="aPlus" defaultValue={aPlus ?? ""} className={input}>
          <option value="">A+ any</option>
          <option value="yes">A+ yes</option>
          <option value="no">A+ no</option>
        </select>
        <div className="flex gap-2 lg:col-span-2">
          <select name="sort" defaultValue={sortKey} className={input} aria-label="Sort">
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
          <button className={btnSecondary}>Apply</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1400px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className={th}>ASIN</th><th className={th}>Vendor</th><th className={th}>Client</th><th className={th}>Sub-niche</th>
              <th className={th}>BSR</th><th className={th}>Price</th><th className={th}>Monthly sales</th><th className={th}>Amazon stock rate</th>
              <th className={th}>Dominant seller</th><th className={th}>A+</th><th className={th}>Reviews</th><th className={th}>Rating</th>
              <th className={th}>Marketplace profile</th><th className={th}>Forecast purchase</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className={`${td} font-mono text-xs`}>
                  <Link href={`/products/${p.id}`} className="font-medium text-indigo-700 hover:underline">{p.asin}</Link>
                </td>
                <td className={td}>
                  <Link href={`/vendors/${p.vendor.id}?tab=products`} className="hover:underline">{p.vendor.name}</Link>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                    {VENDOR_LABELS[p.vendor.type]} <StatusBadge status={p.vendor.status} />
                  </div>
                </td>
                <td className={td}>
                  {p.vendor.client ? <Link href={`/clients/${p.vendor.client.id}`} className="hover:underline">{p.vendor.client.name}</Link> : <span className="text-slate-400">None</span>}
                </td>
                <td className={td}>{p.subNiche}</td>
                <td className={td}>{numFmt(p.bsr)}{p.bsr !== null && period(p.bsrDays)}</td>
                <td className={td}>{money(p.price)}{p.price !== null && period(p.priceDays)}</td>
                <td className={td}>{numFmt(p.monthlySales)}</td>
                <td className={td}>{numFmt(p.amazonStockRate, "%")}{p.amazonStockRate !== null && period(p.amazonStockRateDays)}</td>
                <td className={td}>{numFmt(p.dominantSellerPct, "%")}{p.dominantSellerPct !== null && period(p.dominantSellerDays)}</td>
                <td className={td}>{p.aPlus === null ? "" : p.aPlus ? "Yes" : "No"}</td>
                <td className={td}>{numFmt(p.reviews)}</td>
                <td className={td}>{p.rating !== null ? `${p.rating} ★` : ""}</td>
                <td className={`${td} max-w-[180px] truncate`}><ExtLink href={p.marketplaceProfile} /></td>
                <td className={td}>{numFmt(p.forecastPurchase)}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-slate-500">
                  {filtered ? "No products match these filters." : "No products yet."}{" "}
                  <Link href="/products/new" className="text-indigo-600 hover:underline">Add one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
