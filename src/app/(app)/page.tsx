import Link from "next/link";
import { syncAll, writeAllFollowUps, writeFollowUp } from "@/app/actions";
import { db } from "@/lib/db";
import { STATUSES, STATUS_LABELS, VENDOR_LABELS, VENDOR_PLURAL, VENDOR_TYPES } from "@/lib/constants";
import { followUpDueWhere } from "@/lib/workflow";
import { MessageList } from "@/components/messages";
import { Card, Flash, PageHeader, Stat, StatusBadge, btnPrimary, btnSecondary, fmtDate, one, type SearchParams } from "@/components/ui";

export const dynamic = "force-dynamic";

const TONES: Record<string, string> = {
  EMAILED: "text-blue-700",
  FOLLOW_UP: "text-amber-700",
  APPROVED: "text-emerald-700",
  REJECTED: "text-rose-700",
};

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [byStatus, byType, pendingDrafts, due, clientCount, recentDrafts, recentReplies] = await Promise.all([
    db.vendor.groupBy({ by: ["status"], _count: true }),
    db.vendor.groupBy({ by: ["type"], _count: true }),
    db.emailMessage.count({ where: { folder: "DRAFT" } }),
    db.vendor.findMany({
      where: followUpDueWhere(),
      include: { client: true },
      orderBy: { lastEmailedAt: "asc" },
    }),
    db.client.count(),
    db.emailMessage.findMany({
      where: { folder: "DRAFT" },
      include: { vendor: { select: { id: true, name: true } }, mailbox: { select: { address: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.emailMessage.findMany({
      where: { folder: "INBOX", vendorId: { not: null } },
      include: { vendor: { select: { id: true, name: true } }, mailbox: { select: { address: true } } },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const total = byStatus.reduce((n, s) => n + s._count, 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${total} hunted vendors across ${clientCount} clients`}
        actions={
          <form action={syncAll}>
            <input type="hidden" name="returnTo" value="/" />
            <button className={btnSecondary}>Sync all mailboxes</button>
          </form>
        }
      />
      <Flash msg={one(sp.msg)} error={one(sp.error)} />

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VENDOR_TYPES.map((t) => (
          <Stat key={t} label={VENDOR_PLURAL[t]} value={byType.find((x) => x.type === t)?._count ?? 0} href={`/vendors?type=${t}`} />
        ))}
        <Stat label="Pending drafts" value={pendingDrafts} tone="text-amber-700" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((s) => (
          <Stat key={s} label={STATUS_LABELS[s]} value={counts[s] ?? 0} tone={TONES[s]} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={`Follow-ups due (${due.length})`}
          actions={
            due.length > 0 && (
              <form action={writeAllFollowUps}>
                <input type="hidden" name="returnTo" value="/" />
                <button className={btnPrimary}>Write all follow-up drafts</button>
              </form>
            )
          }
          className="lg:col-span-2"
        >
          {due.length === 0 ? (
            <p className="text-sm text-slate-500">No vendors waiting on a follow-up. Vendors appear here 3 days after an email with no reply.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="pb-2">Vendor</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Client</th>
                    <th className="pb-2">Last emailed</th>
                    <th className="pb-2">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {due.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2"><Link href={`/vendors/${b.id}`} className="font-medium text-indigo-700 hover:underline">{b.name}</Link></td>
                      <td className="py-2">{VENDOR_LABELS[b.type]}</td>
                      <td className="py-2">{b.client?.name}</td>
                      <td className="py-2">{fmtDate(b.lastEmailedAt)}</td>
                      <td className="py-2"><StatusBadge status={b.status} /></td>
                      <td className="py-2 text-right">
                        <form action={writeFollowUp}>
                          <input type="hidden" name="vendorId" value={b.id} />
                          <input type="hidden" name="returnTo" value="/" />
                          <button className={btnSecondary}>Write follow-up draft</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Latest drafts waiting to send">
          <MessageList messages={recentDrafts} returnTo="/" showMailbox empty="No pending drafts." />
        </Card>
        <Card title="Latest vendor replies">
          <MessageList messages={recentReplies} returnTo="/" showMailbox empty="No replies yet." />
        </Card>
      </div>
    </div>
  );
}
