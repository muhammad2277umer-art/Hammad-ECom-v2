import type { VendorType } from "@prisma/client";
import { db } from "@/lib/db";
import { VENDOR_TYPES } from "@/lib/constants";
import { VendorForm } from "@/components/vendor-form";
import { Card, Flash, PageHeader, one, type SearchParams } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewVendorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [clients, categories] = await Promise.all([
    db.client.findMany({ include: { mailboxes: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  const type = VENDOR_TYPES.find((t) => t === one(sp.type)) as VendorType | undefined;
  return (
    <div>
      <PageHeader title="Add vendor" subtitle="Products, lead history and the purchasing plan are added on the vendor's page." />
      <Flash error={one(sp.error)} />
      <Card><VendorForm clients={clients} categories={categories} defaultClientId={one(sp.clientId)} defaultType={type} /></Card>
    </div>
  );
}
