import { db } from "@/lib/db";
import { ProductForm } from "@/components/product-form";
import { Card, Flash, PageHeader, one, type SearchParams } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const vendors = await db.vendor.findMany({ select: { id: true, name: true, type: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader title="Add product" />
      <Flash error={one(sp.error)} />
      <Card>
        {vendors.length ? (
          <ProductForm vendors={vendors} vendorId={one(sp.vendorId)} returnTo="/products/new" />
        ) : (
          <p className="text-sm text-slate-500">Add a vendor first. Every product belongs to the brand, wholesaler or retailer that sells it.</p>
        )}
      </Card>
    </div>
  );
}
