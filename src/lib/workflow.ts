import { randomUUID } from "crypto";
import type { EmailMessage, LeadStatus, Mailbox, Prisma, Vendor } from "@prisma/client";
import { db } from "./db";
import { FOLLOW_UP_AFTER_DAYS, STATUS_LABELS } from "./constants";
import { followUpDraft, outreachDraft } from "./drafts";
import { adapterFor } from "./mail";
import type { OutgoingMessage } from "./mail/types";

const DAY = 24 * 60 * 60 * 1000;

export function followUpCutoff(now = new Date()) {
  return new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY);
}

// Vendors that were emailed, haven't replied, were last emailed 3+ days ago,
// and don't already have a follow-up draft waiting.
export function followUpDueWhere(now = new Date()): Prisma.VendorWhereInput {
  return {
    status: "EMAILED",
    repliedAt: null,
    lastEmailedAt: { lte: followUpCutoff(now) },
    emailMessages: { none: { folder: "DRAFT", kind: "FOLLOW_UP" } },
  };
}

export function isFollowUpDue(
  vendor: Pick<Vendor, "status" | "repliedAt" | "lastEmailedAt">,
  pendingFollowUps: number,
  now = new Date(),
) {
  return (
    vendor.status === "EMAILED" &&
    !vendor.repliedAt &&
    !!vendor.lastEmailedAt &&
    vendor.lastEmailedAt <= followUpCutoff(now) &&
    pendingFollowUps === 0
  );
}

function newMessageId(mailbox: Mailbox) {
  const domain = mailbox.address.split("@")[1] || "localhost";
  return `<${randomUUID()}@${domain}>`;
}

function toOutgoing(mailbox: Mailbox, m: EmailMessage): OutgoingMessage {
  return {
    messageId: m.messageId,
    inReplyTo: m.inReplyTo,
    from: mailbox.address,
    fromName: mailbox.displayName,
    to: m.toAddress,
    subject: m.subject,
    body: m.body,
  };
}

export function primaryEmail(vendor: Pick<Vendor, "emails">) {
  return vendor.emails[0] ?? null;
}

async function loadVendorForDraft(vendorId: string) {
  const vendor = await db.vendor.findUniqueOrThrow({
    where: { id: vendorId },
    include: { category: true, client: { include: { mailboxes: true } }, mailbox: true },
  });
  if (!vendor.client) throw new Error("Link this vendor to a client before writing a draft.");
  if (!primaryEmail(vendor)) throw new Error("Add the vendor's email address before writing a draft.");
  const mailbox = vendor.mailbox ?? vendor.client.mailboxes[0];
  if (!mailbox) throw new Error(`Add a mailbox to ${vendor.client.name} before writing a draft.`);
  return { vendor: { ...vendor, client: vendor.client }, mailbox, to: primaryEmail(vendor)! };
}

// Every status change lands in the vendor's Lead Status history.
export async function changeStatus(vendorId: string, status: LeadStatus, reason?: string, by?: string | null) {
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: vendorId } });
  if (vendor.status === status) return;
  await db.$transaction([
    db.vendor.update({ where: { id: vendorId }, data: { status } }),
    db.activity.create({
      data: {
        vendorId,
        type: "STATUS",
        summary: `${STATUS_LABELS[vendor.status]} → ${STATUS_LABELS[status]}`,
        details: reason,
        by,
      },
    }),
  ]);
}

async function storeDraft(mailbox: Mailbox, data: Omit<Prisma.EmailMessageUncheckedCreateInput, "mailboxId" | "folder" | "messageId" | "fromAddress">) {
  const messageId = newMessageId(mailbox);
  const draft = await db.emailMessage.create({
    data: { ...data, mailboxId: mailbox.id, folder: "DRAFT", messageId, fromAddress: mailbox.address },
  });
  const { uid } = await adapterFor(mailbox).saveDraft(mailbox, toOutgoing(mailbox, draft));
  if (uid) return db.emailMessage.update({ where: { id: draft.id }, data: { imapUid: uid } });
  return draft;
}

export async function writeOutreachDraft(vendorId: string) {
  const { vendor, mailbox, to } = await loadVendorForDraft(vendorId);
  const content = await outreachDraft(vendor, mailbox);
  return storeDraft(mailbox, {
    vendorId: vendor.id,
    kind: "OUTREACH",
    toAddress: to,
    subject: content.subject,
    body: content.body,
  });
}

export async function writeFollowUpDraft(vendorId: string) {
  const { vendor, mailbox, to } = await loadVendorForDraft(vendorId);
  const pending = await db.emailMessage.count({ where: { vendorId, folder: "DRAFT", kind: "FOLLOW_UP" } });
  if (!isFollowUpDue(vendor, pending)) {
    throw new Error(
      `A follow-up is only available for Emailed vendors with no reply ${FOLLOW_UP_AFTER_DAYS} days after the last email, and no follow-up draft already waiting.`,
    );
  }
  const lastSent = await db.emailMessage.findFirst({
    where: { vendorId, folder: "SENT" },
    orderBy: { date: "desc" },
  });
  const content = await followUpDraft(vendor, mailbox, lastSent ?? { subject: vendor.name, body: "" });
  return storeDraft(mailbox, {
    vendorId: vendor.id,
    kind: "FOLLOW_UP",
    inReplyTo: lastSent?.messageId,
    toAddress: to,
    subject: content.subject,
    body: content.body,
  });
}

export async function updateDraft(id: string, data: { toAddress: string; subject: string; body: string }) {
  const draft = await db.emailMessage.findUniqueOrThrow({ where: { id }, include: { mailbox: true } });
  if (draft.folder !== "DRAFT") throw new Error("Only drafts can be edited.");
  const adapter = adapterFor(draft.mailbox);
  await adapter.deleteDraft(draft.mailbox, draft.messageId);
  const updated = await db.emailMessage.update({ where: { id }, data });
  const { uid } = await adapter.saveDraft(draft.mailbox, toOutgoing(draft.mailbox, updated));
  return uid ? db.emailMessage.update({ where: { id }, data: { imapUid: uid } }) : updated;
}

export async function deleteDraft(id: string) {
  const draft = await db.emailMessage.findUniqueOrThrow({ where: { id }, include: { mailbox: true } });
  if (draft.folder !== "DRAFT") throw new Error("Only drafts can be deleted.");
  await adapterFor(draft.mailbox).deleteDraft(draft.mailbox, draft.messageId);
  await db.emailMessage.delete({ where: { id } });
}

// Sent mail to a vendor moves an UnTouched vendor to Emailed.
async function applySent(vendorId: string, date: Date) {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return;
  await db.vendor.update({
    where: { id: vendorId },
    data: {
      firstEmailedAt: vendor.firstEmailedAt ?? date,
      lastEmailedAt: !vendor.lastEmailedAt || vendor.lastEmailedAt < date ? date : undefined,
    },
  });
  if (vendor.status === "UNTOUCHED") await changeStatus(vendorId, "EMAILED", "Outreach email sent");
}

// A reply from an Emailed vendor moves it to Follow Up.
async function applyReply(vendorId: string, date: Date) {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || !vendor.firstEmailedAt || date < vendor.firstEmailedAt) return;
  await db.vendor.update({ where: { id: vendorId }, data: { repliedAt: vendor.repliedAt ?? date } });
  if (vendor.status === "EMAILED") await changeStatus(vendorId, "FOLLOW_UP", "Vendor replied");
}

export async function sendDraft(id: string) {
  const draft = await db.emailMessage.findUniqueOrThrow({ where: { id }, include: { mailbox: true } });
  if (draft.folder !== "DRAFT") throw new Error("This message was already sent.");
  const adapter = adapterFor(draft.mailbox);
  await adapter.send(draft.mailbox, toOutgoing(draft.mailbox, draft));
  await adapter.deleteDraft(draft.mailbox, draft.messageId).catch(() => {});
  const now = new Date();
  const sent = await db.emailMessage.update({
    where: { id },
    data: { folder: "SENT", date: now, imapUid: null },
  });
  if (sent.vendorId) await applySent(sent.vendorId, now);
  return sent;
}

function domainOf(value?: string | null) {
  if (!value) return null;
  const v = value.toLowerCase().trim();
  const host = v.includes("@") ? v.split("@")[1] : v.replace(/^https?:\/\//, "").split("/")[0];
  return host.replace(/^www\./, "") || null;
}

type MatchVendor = Pick<Vendor, "id" | "emails" | "websites">;

function matchVendor(vendors: MatchVendor[], address: string) {
  const a = address.toLowerCase();
  const exact = vendors.find((v) => v.emails.some((e) => e.toLowerCase() === a));
  if (exact) return exact;
  const d = domainOf(a);
  if (!d) return undefined;
  return vendors.find((v) => [...v.emails, ...v.websites].some((x) => domainOf(x) === d));
}

// Mirrors a real mailbox into the app and applies status changes for any
// mail sent to, or received from, this client's vendors.
export async function syncMailbox(mailboxId: string) {
  const mailbox = await db.mailbox.findUniqueOrThrow({ where: { id: mailboxId } });
  const since = new Date((mailbox.lastSyncedAt?.getTime() ?? Date.now() - 30 * DAY) - DAY);
  let result;
  try {
    result = await adapterFor(mailbox).fetch(mailbox, since);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.mailbox.update({ where: { id: mailboxId }, data: { lastError: message } });
    throw err;
  }
  if (!result) return { imported: 0 };

  const vendors = await db.vendor.findMany({
    where: { clientId: mailbox.clientId },
    select: { id: true, emails: true, websites: true },
  });
  let imported = 0;

  for (const m of result.messages) {
    const counterpart = m.folder === "INBOX" ? m.from : m.to;
    const vendor = matchVendor(vendors, counterpart);
    const existing = await db.emailMessage.findUnique({
      where: { mailboxId_folder_messageId: { mailboxId, folder: m.folder, messageId: m.messageId } },
    });
    if (existing) {
      if (m.folder === "DRAFT" && existing.imapUid !== m.uid) {
        await db.emailMessage.update({ where: { id: existing.id }, data: { imapUid: m.uid } });
      }
      continue;
    }

    // A draft created here and sent from the mail client keeps its kind.
    const asDraft =
      m.folder === "SENT"
        ? await db.emailMessage.findUnique({
            where: { mailboxId_folder_messageId: { mailboxId, folder: "DRAFT", messageId: m.messageId } },
          })
        : null;
    let kind = asDraft?.kind ?? (m.folder === "INBOX" ? (vendor ? "REPLY" : "OTHER") : "OTHER");
    if (!asDraft && m.folder !== "INBOX" && vendor) {
      const priorSent = await db.emailMessage.count({ where: { vendorId: vendor.id, folder: "SENT" } });
      kind = priorSent ? "FOLLOW_UP" : "OUTREACH";
    }

    await db.emailMessage.create({
      data: {
        mailboxId,
        vendorId: asDraft?.vendorId ?? vendor?.id,
        folder: m.folder,
        kind,
        messageId: m.messageId,
        inReplyTo: m.inReplyTo,
        imapUid: m.folder === "DRAFT" ? m.uid : null,
        fromAddress: m.from,
        toAddress: m.to,
        subject: m.subject,
        body: m.body,
        date: m.date,
      },
    });
    imported++;

    const vendorId = asDraft?.vendorId ?? vendor?.id;
    if (vendorId && m.folder === "SENT") await applySent(vendorId, m.date);
    if (vendorId && m.folder === "INBOX") await applyReply(vendorId, m.date);
  }

  // Drafts sent or deleted in the mail client disappear here too.
  await db.emailMessage.deleteMany({
    where: {
      mailboxId,
      folder: "DRAFT",
      imapUid: { not: null },
      messageId: { notIn: [...result.draftIds] },
    },
  });

  await db.mailbox.update({ where: { id: mailboxId }, data: { lastSyncedAt: new Date(), lastError: null } });
  return { imported };
}

export async function syncAllMailboxes() {
  const mailboxes = await db.mailbox.findMany({ where: { provider: { not: "DEMO" } } });
  const results: { address: string; imported?: number; error?: string }[] = [];
  for (const mb of mailboxes) {
    try {
      const r = await syncMailbox(mb.id);
      results.push({ address: mb.address, imported: r.imported });
    } catch (err) {
      results.push({ address: mb.address, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// Demo mailboxes only: pretend the vendor answered, to try the workflow.
export async function simulateReply(vendorId: string) {
  const vendor = await db.vendor.findUniqueOrThrow({ where: { id: vendorId } });
  const lastSent = await db.emailMessage.findFirst({
    where: { vendorId, folder: "SENT" },
    orderBy: { date: "desc" },
    include: { mailbox: true },
  });
  if (!lastSent) throw new Error("Send an email to this vendor first.");
  if (lastSent.mailbox.provider !== "DEMO") throw new Error("Simulated replies only work on demo mailboxes.");
  const now = new Date();
  await db.emailMessage.create({
    data: {
      mailboxId: lastSent.mailboxId,
      vendorId,
      folder: "INBOX",
      kind: "REPLY",
      messageId: newMessageId(lastSent.mailbox),
      inReplyTo: lastSent.messageId,
      fromAddress: primaryEmail(vendor) ?? "vendor@example.com",
      toAddress: lastSent.mailbox.address,
      subject: lastSent.subject.startsWith("Re:") ? lastSent.subject : `Re: ${lastSent.subject}`,
      body: `Hi,\n\nThanks for reaching out. Happy to talk. Can you share more about your store's monthly sales volume?\n\nBest,\n${vendor.contactName ?? vendor.name}`,
      date: now,
    },
  });
  await applyReply(vendorId, now);
}
