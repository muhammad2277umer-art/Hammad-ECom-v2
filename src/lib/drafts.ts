import Anthropic from "@anthropic-ai/sdk";
import type { Category, Client, Mailbox, Vendor } from "@prisma/client";
import { MARKETPLACE_LABELS } from "./constants";

type VendorCtx = Vendor & { category: Category | null; client: Client };

export type DraftContent = { subject: string; body: string };

function senderName(mailbox: Mailbox, client: Client) {
  return mailbox.displayName || `${client.businessName || client.storeName || client.name} Team`;
}

function storeName(client: Client) {
  return client.storeName || client.businessName || client.name;
}

const ASK: Record<Vendor["type"], (name: string) => string> = {
  BRAND: (name) => `We'd love to explore becoming an authorized reseller of ${name}.`,
  WHOLESALER: (name) => `We'd like to open a wholesale account with ${name} and source products from your catalog.`,
  RETAILER: (name) => `We'd like to discuss buying from ${name} at volume for resale.`,
};

const ROLE: Record<Vendor["type"], string> = {
  BRAND: "a brand, asking to become an authorized reseller",
  WHOLESALER: "a wholesaler, asking to open a wholesale account",
  RETAILER: "a retailer, asking to buy stock at volume for resale",
};

function templateOutreach(vendor: VendorCtx, mailbox: Mailbox): DraftContent {
  const c = vendor.client;
  const market = MARKETPLACE_LABELS[c.marketplace];
  const greeting = vendor.contactName ? `Hi ${vendor.contactName},` : `Hi ${vendor.name} team,`;
  const category = vendor.category ? ` in the ${vendor.category.name} category` : "";
  return {
    subject: `Partnership inquiry: ${vendor.name} x ${storeName(c)} on ${market}`,
    body: `${greeting}

I'm reaching out from ${storeName(c)}, an established seller on ${market}. We've been following ${vendor.name} and think your products${category} would be a strong fit for our customers.

${ASK[vendor.type](vendor.name)} We handle listing optimization, advertising and fulfillment, and we protect brand pricing and presentation on the marketplace.

Could you share your wholesale terms, or point me to the right person to talk to about an account?

Best regards,
${senderName(mailbox, c)}
${storeName(c)}${c.website ? `\n${c.website}` : ""}
${mailbox.address}`,
  };
}

function templateFollowUp(vendor: VendorCtx, mailbox: Mailbox, previousSubject: string): DraftContent {
  const c = vendor.client;
  const greeting = vendor.contactName ? `Hi ${vendor.contactName},` : `Hi ${vendor.name} team,`;
  return {
    subject: previousSubject.startsWith("Re:") ? previousSubject : `Re: ${previousSubject}`,
    body: `${greeting}

I wanted to follow up on my note from a few days ago about working with ${vendor.name} for ${storeName(c)} on ${MARKETPLACE_LABELS[c.marketplace]}.

If now isn't a good time, or there's someone else I should speak with about wholesale accounts, just let me know and I'll reach out to them instead.

Thanks, and looking forward to hearing from you.

Best regards,
${senderName(mailbox, c)}
${storeName(c)}
${mailbox.address}`,
  };
}

// When ANTHROPIC_API_KEY is set, Claude writes a personalised draft; otherwise
// (or on any error) the templates above are used.
async function aiDraft(prompt: string): Promise<DraftContent | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system:
        "You write short, professional B2B outreach emails for an e-commerce reseller contacting brands, wholesalers and retailers. " +
        "Reply with the subject on the first line as 'Subject: ...', a blank line, then the plain-text body. " +
        "No markdown, no placeholders in brackets.",
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const match = text.match(/^Subject:\s*(.+)\n+([\s\S]+)$/);
    if (!match) return null;
    return { subject: match[1].trim(), body: match[2].trim() };
  } catch (err) {
    console.error("AI draft failed, using template", err);
    return null;
  }
}

function vendorFacts(vendor: VendorCtx, mailbox: Mailbox) {
  const c = vendor.client;
  return [
    `Vendor: ${vendor.name} (${ROLE[vendor.type]})`,
    vendor.category && `Category: ${vendor.category.name}`,
    vendor.websites[0] && `Vendor website: ${vendor.websites[0]}`,
    vendor.description && `About the vendor: ${vendor.description}`,
    vendor.contactName && `Contact name: ${vendor.contactName}`,
    `Our store: ${storeName(c)} on ${MARKETPLACE_LABELS[c.marketplace]}`,
    c.website && `Our website: ${c.website}`,
    `Sign as: ${senderName(mailbox, c)}, ${mailbox.address}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function outreachDraft(vendor: VendorCtx, mailbox: Mailbox): Promise<DraftContent> {
  const ai = await aiDraft(
    `Write a first outreach email to this vendor.\n\n${vendorFacts(vendor, mailbox)}`,
  );
  return ai ?? templateOutreach(vendor, mailbox);
}

export async function followUpDraft(
  vendor: VendorCtx,
  mailbox: Mailbox,
  previous: { subject: string; body: string },
): Promise<DraftContent> {
  const ai = await aiDraft(
    `The vendor has not replied for 3 days. Write a brief, polite follow-up to the email below. Keep the subject as "Re: <original subject>".\n\n${vendorFacts(vendor, mailbox)}\n\nOriginal email:\nSubject: ${previous.subject}\n\n${previous.body}`,
  );
  const fallback = templateFollowUp(vendor, mailbox, previous.subject);
  return ai ? { ...ai, subject: fallback.subject } : fallback;
}
