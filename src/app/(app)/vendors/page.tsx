import Link from "next/link";
import type { LeadStatus, Prisma, VendorType } from "@prisma/client";
import { writeDraft, writeFollowUp } from "@/app/actions";
import { db } from "@/lib/db";
import { STATUSES, STATUS_LABELS, VENDOR_LABELS, VENDOR_PLURAL, VENDOR_TYPES } from "@/lib/constants";
import { isFollowUpDue } from "@/lib/workflow";
import { Flash, PageHeader, StatusBadge, btnPrimary, btnSecondary, fmtDate, input, one, type SearchParams } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function VendorsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const type = (VENDOR_TYPES.find((t) => t === one(sp.type)) ?? "BRAND") as VendorType;
  const q = one(sp.q);
  const status = one(sp.status) as LeadStatus | undefined;
  const clientId = one(sp.clientId);
  const categoryId = one(sp.categoryId);
  const onlyDrafts = one(sp.drafts) === "1";

  const where: Prisma.VendorWhereInput = {
    type,
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { emails: { has: q.toLowerCase() } },
        { products: { some: { asin: { equals: q.toUpperCase() } } } },
      ],
    }),
    ...(status && STATUSES.includes(status) && { status }),
    ...(clientId && { clientId: clientId === "none" ? null : clientId }),
    ...(categoryId && { categoryId }),
    ...(onlyDrafts && { emailMessages: { some: { folder: "DRAFT" } } }),
  };

  const [vendors, typeCounts, clients, categories] = await Promise.all([
    db.vendor.findMany({
      where,
      include: { client: true, category: true, _count: { select: { products: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.vendor.groupBy({ by: ["type"], _count: true }),
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  const drafts = await db.emailMessage.groupBy({
    by: ["vendorId", "kind"],
    where: { folder: "DRAFT", vendorId: { in: vendors.map((v) => v.id) } },
    _count: true,
  });
  const draftCount = (id: string, kind?: string) =>
    drafts.filter((d) => d.vendorId === id && (!kind || d.kind === kind)).reduce((n, d) => n + d._count, 0);
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && !["msg", "error"].includes(k) ? [[k, v]] : [])),
  );
  query.set("type", type);
  const returnTo = `/vendors?${query}`;

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle={`${vendors.length} ${VENDOR_PLURAL[type].toLowerCase()}${q || status || clientId || categoryId || onlyDrafts ? " match your filters" : ""}`}
        actions={<Link href={`/vendors/new?type=${type}`} className={btnPrimary}>Add {VENDOR_LABELS[type].toLowerCase()}</Link>}
      />
      <Flash msg={one(sp.msg)} error={one(sp.error)} />

      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {VENDOR_TYPES.map((t) => (
          <Link
            key={t}
            href={`/vendors?type=${t}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              t === type ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {VENDOR_PLURAL[t]}
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">
              {typeCounts.find((c) => c.type === t)?._count ?? 0}
            </span>
          </Link>
        ))}
      </div>

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="type" value={type} />
        <input name="q" defaultValue={q} placeholder="Search name, email or ASIN" className={`${input} lg:col-span-2`} />
        <select name="status" defaultValue={status ?? ""} className={input}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select name="clientId" defaultValue={clientId ?? ""} className={input}>
          <option value="">All clients</option>
          <option value="none">Not linked to a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="categoryId" defaultValue={categoryId ?? ""} className={input}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" name="drafts" value="1" defaultChecked={onlyDrafts} /> Has drafts
          </label>
          <button className={btnSecondary}>Filter</button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">{VENDOR_LABELS[type]}</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Lead status</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Pending drafts</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vendors.map((v) => {
              const pending = draftCount(v.id);
              const due = isFollowUpDue(v, draftCount(v.id, "FOLLOW_UP"));
              return (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/vendors/${v.id}`} className="font-medium text-indigo-700 hover:underline">{v.name}</Link>
                    {v.emails[0] && <div className="text-xs text-slate-500">{v.emails[0]}</div>}
                  </td>
                  <td className="px-3 py-2">{v.category?.name ?? <span className="text-slate-400">None</span>}</td>
                  <td className="px-3 py-2">
                    {v.client ? <Link href={`/clients/${v.client.id}`} className="hover:underline">{v.client.name}</Link> : <span className="text-slate-400">Not linked</span>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={v.status} /></td>
                  <td className="px-3 py-2">
                    <Link href={`/vendors/${v.id}?tab=products`} className={v._count.products ? "hover:underline" : "text-slate-400"}>{v._count.products}</Link>
                  </td>
                  <td className="px-3 py-2">
                    {pending ? (
                      <Link href={`/vendors/${v.id}?tab=emails`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{pending} pending</Link>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{fmtDate(v.createdAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {due && (
                        <form action={writeFollowUp}>
                          <input type="hidden" name="vendorId" value={v.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button className={btnPrimary}>Write follow-up</button>
                        </form>
                      )}
                      <form action={writeDraft}>
                        <input type="hidden" name="vendorId" value={v.id} />
                        <input type="hidden" name="returnTo" value={returnTo} />
                        <button className={btnSecondary} disabled={!v.clientId || !v.emails[0]} title={!v.clientId ? "Link a client first" : !v.emails[0] ? "Add an email first" : ""}>
                          Write draft
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {vendors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No {VENDOR_PLURAL[type].toLowerCase()} here yet.{" "}
                  <Link href={`/vendors/new?type=${type}`} className="text-indigo-600 hover:underline">Add one</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
