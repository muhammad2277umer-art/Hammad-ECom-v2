import type { Product } from "@prisma/client";
import { saveProduct } from "@/app/actions";
import { BSR_DAYS, DOMINANT_SELLER_DAYS, PRICE_DAYS, STOCK_RATE_DAYS } from "@/lib/constants";
import { Field, btnPrimary, input } from "./ui";

function Days({ name, options, value }: { name: string; options: number[]; value?: number | null }) {
  return (
    <select name={name} defaultValue={value ?? options[0]} className={`${input.replace("w-full", "")} w-28 shrink-0 px-2`} aria-label={`${name} period`}>
      {options.map((d) => <option key={d} value={d}>{d} days</option>)}
    </select>
  );
}

// Product research fields. Metrics with a period take one value plus the
// window it was measured over (only the allowed windows can be picked).
export function ProductForm({ vendorId, product }: { vendorId: string; product?: Product | null }) {
  const v = (k: keyof Product) => {
    const x = product?.[k];
    return x === null || x === undefined ? "" : String(x);
  };
  return (
    <form action={saveProduct} className="space-y-3">
      <input type="hidden" name="vendorId" value={vendorId} />
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="ASIN *"><input name="asin" required defaultValue={v("asin")} placeholder="B0XXXXXXXX" className={input} /></Field>
        <Field label="Sub-niche"><input name="subNiche" defaultValue={v("subNiche")} className={input} /></Field>
        <Field label="BSR">
          <div className="flex gap-1"><input name="bsr" inputMode="numeric" defaultValue={v("bsr")} className={`${input} min-w-0`} /><Days name="bsrDays" options={BSR_DAYS} value={product?.bsrDays} /></div>
        </Field>
        <Field label="Price ($)">
          <div className="flex gap-1"><input name="price" inputMode="decimal" defaultValue={v("price")} className={`${input} min-w-0`} /><Days name="priceDays" options={PRICE_DAYS} value={product?.priceDays} /></div>
        </Field>
        <Field label="Monthly sales (units)"><input name="monthlySales" inputMode="numeric" defaultValue={v("monthlySales")} className={input} /></Field>
        <Field label="Amazon stock rate (%)">
          <div className="flex gap-1"><input name="amazonStockRate" inputMode="decimal" defaultValue={v("amazonStockRate")} className={`${input} min-w-0`} /><Days name="amazonStockRateDays" options={STOCK_RATE_DAYS} value={product?.amazonStockRateDays} /></div>
        </Field>
        <Field label="Dominant seller (%)">
          <div className="flex gap-1"><input name="dominantSellerPct" inputMode="decimal" defaultValue={v("dominantSellerPct")} className={`${input} min-w-0`} /><Days name="dominantSellerDays" options={DOMINANT_SELLER_DAYS} value={product?.dominantSellerDays} /></div>
        </Field>
        <Field label="A+ content">
          <select name="aPlus" defaultValue={product?.aPlus === true ? "yes" : product?.aPlus === false ? "no" : ""} className={input}>
            <option value="">Not checked</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
        <Field label="Reviews"><input name="reviews" inputMode="numeric" defaultValue={v("reviews")} className={input} /></Field>
        <Field label="Rating (0 to 5)"><input name="rating" inputMode="decimal" defaultValue={v("rating")} className={input} /></Field>
        <Field label="Marketplace profile (link)"><input name="marketplaceProfile" defaultValue={v("marketplaceProfile")} placeholder="amazon.com/dp/..." className={input} /></Field>
        <Field label="Forecast purchase (units)"><input name="forecastPurchase" inputMode="numeric" defaultValue={v("forecastPurchase")} className={input} /></Field>
      </div>
      <button className={btnPrimary}>{product ? "Save product" : "Add product"}</button>
    </form>
  );
}
