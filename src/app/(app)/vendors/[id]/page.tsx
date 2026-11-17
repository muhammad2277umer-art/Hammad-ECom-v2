import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addActivity, deleteActivity, deleteProduct, deletePurchaseItem, deleteVendor, savePurchaseItem,
  setVendorStatus, simulateReply, writeDraft, writeFollowUp,
} from "@/app/actions";
import { db } from "@/lib/db";
import {
  ACTIVITY_LABELS, FOLLOW_UP_AFTER_DAYS, MANUAL_ACTIVITY_TYPES, MARKETPLACE_LABELS, PURCHASE_UNITS,
  STATUSES, STATUS_LABELS, VENDOR_LABELS,
} from "@/lib/constants";
import { isFollowUpDue } from "@/lib/workflow";
import { MessageList } from "@/components/messages";
import { ProductForm } from "@/components/product-form";
import { VendorForm } from "@/components/vendor-form";
import {
  Card, ExtLink, Field, Flash, PageHeader, StatusBadge, btnDanger, btnPrimary, btnSecondary, btnSuccess,
  fmtDateTime, input, money, numFmt, one, type SearchParams,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "products", label: "Products" },
  { key: "contact", label: "Contact" },
  { key: "lead", label: "Lead Status" },
  { key: "purchasing", label: "Purchasing Plan" },
  { key: "emails", label: "Emails" },
  { key: "details", label: "Edit details" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 align-top";

function periodTag(days?: number | null) {
  return days ? <span className="ml-1 text-xs text-slate-400">{days}d</span> : null;
}

function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}

export default async function VendorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const vendor = await db.vendor.findUnique({
    where: { id },
    include: {
      category: true,
      client: { include: { mailboxes: true } },
      mailbox: true,
      products: { orderBy: { createdAt: "asc" } },
      activities: { orderBy: { date: "desc" } },
      purchaseItems: { orderBy: { createdAt: "asc" } },
      emailMessages: { include: { mailbox: { select: { address: true } } }, orderBy: { date: "desc" } },
    },
  });
  if (!vendor) notFound();
  const tab = (TABS.find((t) => t.key === one(sp.tab))?.key ?? "products") as Tab;

  const drafts = vendor.emailMessages.filter((e) => e.folder === "DRAFT");
  const sent = vendor.emailMessages.filter((e) => e.folder === "SENT");
  const inbox = vendor.emailMessages.filter((e) => e.folder === "INBOX");
  const pendingFollowUps = drafts.filter((d) => d.kind === "FOLLOW_UP").length;
  const followUpDue = isFollowUpDue(vendor, pendingFollowUps);
  const mailbox = vendor.mailbox ?? vendor.client?.mailboxes[0];
  const draftBlocker = !vendor.client
    ? "Link this vendor to a client first."
    : !vendor.emails[0]
      ? "Add the vendor's email address first."
      : !mailbox
        ? `Add a mailbox to ${vendor.client.name} first.`
        : null;
  const followUpAt = vendor.lastEmailedAt ? new Date(vendor.lastEmailedAt.getTime() + FOLLOW_UP_AFTER_DAYS * 86400000) : null;
  const followUpHint = followUpDue
    ? null
    : vendor.status !== "EMAILED"
      ? "Available once the vendor is Emailed and hasn't replied."
      : pendingFollowUps
        ? "A follow-up draft is already waiting."
        : followUpAt
          ? `Available from ${fmtDateTime(followUpAt)} if there's no reply.`
          : null;
  const approved = vendor.status === "APPROVED";
  const counts: Partial<Record<Tab, number>> = {
    products: vendor.products.length,
    lead: vendor.activities.length + sent.length + inbox.length,
    purchasing: vendor.purchaseItems.length,
    emails: drafts.length,
  };
  const here = (t: Tab) => `/vendors/${vendor.id}?tab=${t}`;

  // Lead history: logged activities plus every email sent to or received from the vendor.
  const history = [
    ...vendor.activities.map((a) => ({
      key: a.id, date: a.date, type: ACTIVITY_LABELS[a.type], summary: a.summary, details: a.details, by: a.by, activityId: a.id,
    })),
    ...[...sent, ...inbox].map((m) => ({
      key: m.id,
      date: m.date,
      type: m.folder === "SENT" ? (m.kind === "FOLLOW_UP" ? "Email sent (follow-up)" : "Email sent") : "Email received",
      summary: m.subject,
      details: m.folder === "SENT" ? `To ${m.toAddress}` : `From ${m.fromAddress}`,
      by: m.folder === "SENT" ? m.mailbox.address : null,
      activityId: null as string | null,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const planTotal = vendor.purchaseItems.reduce((n, i) => n + Number(i.costPrice) * i.quantity, 0);
  const editProduct = vendor.products.find((p) => p.id === one(sp.edit));
  const editItem = vendor.purchaseItems.find((p) => p.id === one(sp.edit));

  return (
    <div>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">{vendor.name} <StatusBadge status={vendor.status} /></span>}
        subtitle={
          <>
            <Link href={`/vendors?type=${vendor.type}`} className="hover:underline">{VENDOR_LABELS[vendor.type]}</Link>
            {" · "}{vendor.category?.name ?? "No category"} · hunted for{" "}
            {vendor.client ? (
              <Link href={`/clients/${vendor.client.id}`} className="text-indigo-600 hover:underline">
                {vendor.client.name} ({MARKETPLACE_LABELS[vendor.client.marketplace]})
              </Link>
            ) : (
              "no client yet"
            )}
          </>
        }
      />
      <Flash msg={one(sp.msg)} error={one(sp.error)} />

      <Card className="mb-6">
        <div className="flex flex-wrap items-start gap-2">
          <form action={writeDraft}>
            <Hidden name="vendorId" value={vendor.id} />
            <Hidden name="returnTo" value={here("emails")} />
            <button className={btnPrimary} disabled={!!draftBlocker}>Write draft</button>
          </form>
          <form action={writeFollowUp}>
            <Hidden name="vendorId" value={vendor.id} />
            <Hidden name="returnTo" value={here("emails")} />
            <button className={btnPrimary} disabled={!followUpDue}>Write follow-up draft</button>
          </form>
          {(["APPROVED", "REJECTED"] as const).map((s) => (
            <form key={s} action={setVendorStatus}>
              <Hidden name="id" value={vendor.id} />
              <Hidden name="status" value={s} />
              <Hidden name="returnTo" value={here(s === "APPROVED" ? "purchasing" : tab)} />
              <button className={s === "APPROVED" ? btnSuccess : btnDanger} disabled={vendor.status === s}>
                Mark {s === "APPROVED" ? "Approved" : "Rejected"}
              </button>
            </form>
          ))}
          {mailbox?.provider === "DEMO" && sent.length > 0 && (
            <form action={simulateReply}>
              <Hidden name="vendorId" value={vendor.id} />
              <Hidden name="returnTo" value={here("lead")} />
              <button className={btnSecondary} title="Demo mailboxes only">Simulate vendor reply</button>
            </form>
          )}
        </div>
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          {draftBlocker && <p>Write draft: {draftBlocker}</p>}
          {followUpHint && <p>Follow-up: {followUpHint}</p>}
          {mailbox && !draftBlocker && <p>Drafts go to {vendor.emails[0]} from {mailbox.address}.</p>}
        </div>
      </Card>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={here(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${
              t.key === tab ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {counts[t.key] ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "products" && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1300px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className={th}>ASIN</th><th className={th}>Sub-niche</th><th className={th}>BSR</th><th className={th}>Price</th>
                  <th className={th}>Monthly sales</th><th className={th}>Amazon stock rate</th><th className={th}>Dominant seller</th>
                  <th className={th}>A+</th><th className={th}>Reviews</th><th className={th}>Rating</th><th className={th}>Marketplace profile</th>
                  <th className={th}>Forecast purchase</th><th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendor.products.map((p) => (
                  <tr key={p.id} className={p.id === editProduct?.id ? "bg-indigo-50/50" : "hover:bg-slate-50"}>
                    <td className={`${td} font-mono text-xs`}>
                      <a href={`https://www.amazon.com/dp/${p.asin}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{p.asin}</a>
                    </td>
                    <td className={td}>{p.subNiche}</td>
                    <td className={td}>{numFmt(p.bsr)}{p.bsr !== null && periodTag(p.bsrDays)}</td>
                    <td className={td}>{money(p.price)}{p.price !== null && periodTag(p.priceDays)}</td>
                    <td className={td}>{numFmt(p.monthlySales)}</td>
                    <td className={td}>{numFmt(p.amazonStockRate, "%")}{p.amazonStockRate !== null && periodTag(p.amazonStockRateDays)}</td>
                    <td className={td}>{numFmt(p.dominantSellerPct, "%")}{p.dominantSellerPct !== null && periodTag(p.dominantSellerDays)}</td>
                    <td className={td}>{p.aPlus === null ? "" : p.aPlus ? "Yes" : "No"}</td>
                    <td className={td}>{numFmt(p.reviews)}</td>
                    <td className={td}>{p.rating !== null ? `${p.rating} ★` : ""}</td>
                    <td className={`${td} max-w-[180px] truncate`}><ExtLink href={p.marketplaceProfile} /></td>
                    <td className={td}>{numFmt(p.forecastPurchase)}</td>
                    <td className={td}>
                      <div className="flex justify-end gap-1">
                        <Link href={`${here("products")}&edit=${p.id}#product-form`} className={btnSecondary}>Edit</Link>
                        <form action={deleteProduct}><Hidden name="id" value={p.id} /><button className={btnDanger}>Delete</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
                {vendor.products.length === 0 && (
                  <tr><td colSpan={13} className="px-3 py-6 text-center text-slate-500">No products yet. Add the first one below.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Card
            title={editProduct ? `Edit ${editProduct.asin}` : "Add product"}
            actions={editProduct && <Link href={here("products")} className={btnSecondary}>Cancel</Link>}
          >
            <div id="product-form">
              <ProductForm key={editProduct?.id ?? "new"} vendorId={vendor.id} product={editProduct} />
            </div>
          </Card>
        </div>
      )}

      {tab === "contact" && (
        <div className="grid gap-6 md:grid-cols-2">
          {([
            ["Emails", vendor.emails, (v: string) => <a href={`mailto:${v}`} className="text-indigo-600 hover:underline">{v}</a>],
            ["Contact numbers", vendor.phones, (v: string) => <a href={`tel:${v.replace(/[^\d+]/g, "")}`} className="text-indigo-600 hover:underline">{v}</a>],
            ["Website links", vendor.websites, (v: string) => <ExtLink href={v} />],
            ["Social media links", vendor.socials, (v: string) => <ExtLink href={v} />],
          ] as const).map(([title, values, render]) => (
            <Card key={title} title={title} actions={<Link href={here("details")} className={btnSecondary}>Edit</Link>}>
              {values.length ? (
                <ul className="space-y-1 text-sm">{values.map((v, i) => <li key={i} className="break-all">{render(v)}{title === "Emails" && i === 0 && values.length > 1 && <span className="ml-2 text-xs text-slate-400">outreach</span>}</li>)}</ul>
              ) : (
                <p className="text-sm text-slate-500">None yet.</p>
              )}
            </Card>
          ))}
          <Card title="Other details" className="md:col-span-2">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">Contact person</dt><dd>{vendor.contactName ?? "Not set"}</dd></div>
              <div><dt className="text-xs text-slate-500">Physical address</dt><dd>{vendor.address ?? "Not set"}</dd></div>
              <div><dt className="text-xs text-slate-500">Added</dt><dd>{fmtDateTime(vendor.createdAt)}</dd></div>
            </dl>
            {vendor.description && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{vendor.description}</p>}
          </Card>
        </div>
      )}

      {tab === "lead" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Log an activity" className="lg:col-span-2">
              <form action={addActivity} className="space-y-3">
                <Hidden name="vendorId" value={vendor.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <select name="type" className={input} defaultValue="CALL">
                      {MANUAL_ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{ACTIVITY_LABELS[t]}</option>)}
                    </select>
                  </Field>
                  <Field label="Date (blank = now)"><input name="date" type="date" className={input} /></Field>
                  <Field label="By"><input name="by" placeholder="Team member" className={input} /></Field>
                </div>
                <Field label="Summary *"><input name="summary" required placeholder="e.g. Called Tom, asked for price list" className={input} /></Field>
                <Field label="Notes"><textarea name="details" rows={2} className={input} /></Field>
                <button className={btnPrimary}>Log activity</button>
              </form>
            </Card>
            <Card title="Lead status">
              <div className="mb-3"><StatusBadge status={vendor.status} /></div>
              <form action={setVendorStatus} className="space-y-2">
                <Hidden name="id" value={vendor.id} />
                <Hidden name="returnTo" value={here("lead")} />
                <select name="status" defaultValue={vendor.status} className={input}>
                  {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <input name="reason" placeholder="Reason (optional)" className={input} />
                <input name="by" placeholder="By (optional)" className={input} />
                <button className={btnSecondary}>Change status</button>
              </form>
              <dl className="mt-4 space-y-1 text-xs text-slate-500">
                {vendor.firstEmailedAt && <div>First emailed {fmtDateTime(vendor.firstEmailedAt)}</div>}
                {vendor.lastEmailedAt && <div>Last emailed {fmtDateTime(vendor.lastEmailedAt)}</div>}
                {vendor.repliedAt && <div>Replied {fmtDateTime(vendor.repliedAt)}</div>}
              </dl>
            </Card>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className={th}>Date</th><th className={th}>Activity</th><th className={th}>Summary</th><th className={th}>Details</th><th className={th}>By</th><th className={th} /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.key}>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{fmtDateTime(h.date)}</td>
                    <td className={`${td} whitespace-nowrap font-medium`}>{h.type}</td>
                    <td className={td}>{h.summary}</td>
                    <td className={`${td} whitespace-pre-wrap text-slate-600`}>{h.details}</td>
                    <td className={`${td} text-slate-500`}>{h.by}</td>
                    <td className={td}>
                      {h.activityId ? (
                        <form action={deleteActivity}><Hidden name="id" value={h.activityId} /><button className="text-xs text-rose-600 hover:underline">Delete</button></form>
                      ) : (
                        <Link href={here("emails")} className="text-xs text-indigo-600 hover:underline">Open</Link>
                      )}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No activity yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "purchasing" && (
        !approved ? (
          <Card>
            <p className="text-sm text-slate-600">
              The purchasing plan opens once this vendor is <strong>Approved</strong>. It&apos;s currently {STATUS_LABELS[vendor.status]}.
            </p>
            {vendor.purchaseItems.length > 0 && (
              <p className="mt-2 text-sm text-slate-500">{vendor.purchaseItems.length} saved line(s) will show again when it&apos;s approved.</p>
            )}
            <form action={setVendorStatus} className="mt-4">
              <Hidden name="id" value={vendor.id} />
              <Hidden name="status" value="APPROVED" />
              <Hidden name="returnTo" value={here("purchasing")} />
              <button className={btnSuccess}>Mark Approved</button>
            </form>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className={th}>ASIN</th><th className={th}>Product</th><th className={`${th} text-right`}>MOQ</th>
                    <th className={`${th} text-right`}>Cost price</th><th className={`${th} text-right`}>Quantity</th>
                    <th className={th}>Unit</th><th className={`${th} text-right`}>Total</th><th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendor.purchaseItems.map((i) => (
                    <tr key={i.id} className={i.id === editItem?.id ? "bg-indigo-50/50" : "hover:bg-slate-50"}>
                      <td className={`${td} font-mono text-xs`}>{i.asin}</td>
                      <td className={td}>{i.productName}</td>
                      <td className={`${td} text-right`}>{numFmt(i.moq)}</td>
                      <td className={`${td} text-right`}>{money(i.costPrice)}</td>
                      <td className={`${td} text-right`}>
                        {numFmt(i.quantity)}
                        {i.moq !== null && i.quantity < i.moq && (
                          <div className="text-xs text-rose-600">below MOQ</div>
                        )}
                      </td>
                      <td className={td}>{i.unit}</td>
                      <td className={`${td} text-right font-medium`}>{money(Number(i.costPrice) * i.quantity)}</td>
                      <td className={td}>
                        <div className="flex justify-end gap-1">
                          <Link href={`${here("purchasing")}&edit=${i.id}#plan-form`} className={btnSecondary}>Edit</Link>
                          <form action={deletePurchaseItem}><Hidden name="id" value={i.id} /><button className={btnDanger}>Delete</button></form>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {vendor.purchaseItems.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No products in the plan yet.</td></tr>
                  )}
                </tbody>
                {vendor.purchaseItems.length > 0 && (
                  <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
                    <tr>
                      <td className={td} colSpan={6}>Plan total ({vendor.purchaseItems.length} line{vendor.purchaseItems.length === 1 ? "" : "s"})</td>
                      <td className={`${td} text-right`}>{money(planTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Card
              title={editItem ? `Edit ${editItem.asin}` : "Add product to plan"}
              actions={editItem && <Link href={here("purchasing")} className={btnSecondary}>Cancel</Link>}
            >
              <form id="plan-form" key={editItem?.id ?? "new"} action={savePurchaseItem} className="space-y-3">
                <Hidden name="vendorId" value={vendor.id} />
                {editItem && <Hidden name="id" value={editItem.id} />}
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Field label="ASIN *">
                    <input name="asin" required list="vendor-asins" defaultValue={editItem?.asin} className={input} />
                    <datalist id="vendor-asins">
                      {vendor.products.map((p) => <option key={p.id} value={p.asin}>{p.subNiche ?? ""}</option>)}
                    </datalist>
                  </Field>
                  <Field label="Product name"><input name="productName" defaultValue={editItem?.productName ?? ""} className={input} /></Field>
                  <Field label="MOQ"><input name="moq" inputMode="numeric" defaultValue={editItem?.moq ?? ""} className={input} /></Field>
                  <Field label="Cost price ($) *"><input name="costPrice" required inputMode="decimal" defaultValue={editItem ? Number(editItem.costPrice) : ""} className={input} /></Field>
                  <Field label="Quantity *"><input name="quantity" required inputMode="numeric" defaultValue={editItem?.quantity ?? ""} className={input} /></Field>
                  <Field label="Measuring unit">
                    <select name="unit" defaultValue={editItem?.unit ?? "Units"} className={input}>
                      {PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>
                <p className="text-xs text-slate-500">Total is cost price × quantity. ASINs from this vendor&apos;s Products tab are suggested as you type.</p>
                <button className={btnPrimary}>{editItem ? "Save line" : "Add to plan"}</button>
              </form>
            </Card>
          </div>
        )
      )}

      {tab === "emails" && (
        <div className="space-y-6">
          <Card title={`Drafts pending (${drafts.length})`}>
            <MessageList messages={drafts} returnTo={here("emails")} showMailbox empty="No pending drafts for this vendor." />
          </Card>
          <Card title={`Sent (${sent.length})`}>
            <MessageList messages={sent} returnTo={here("emails")} showMailbox empty="Nothing sent yet." />
          </Card>
          <Card title={`Replies (${inbox.length})`}>
            <MessageList messages={inbox} returnTo={here("emails")} showMailbox empty="No replies yet." />
          </Card>
        </div>
      )}

      {tab === "details" && <EditDetails vendorId={vendor.id} />}
    </div>
  );
}

async function EditDetails({ vendorId }: { vendorId: string }) {
  const [vendor, clients, categories] = await Promise.all([
    db.vendor.findUniqueOrThrow({ where: { id: vendorId } }),
    db.client.findMany({ include: { mailboxes: true }, orderBy: { name: "asc" } }),
    db.category.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <Card>
      <VendorForm vendor={vendor} clients={clients} categories={categories} />
      <form action={deleteVendor} className="mt-6 border-t border-slate-100 pt-4">
        <Hidden name="id" value={vendor.id} />
        <button className={btnDanger}>Delete vendor</button>
        <span className="ml-2 text-xs text-slate-500">Also deletes its products, lead history and purchasing plan.</span>
      </form>
    </Card>
  );
}
