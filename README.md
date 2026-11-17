# Brand Hunting CRM

Track hunted brands, wholesalers and retailers for your e-commerce clients, write outreach and follow-up emails from each client's worker mailbox, and see every client's inbox, sent and drafts in one place.

Built with Next.js 15 (React + server in one app), TypeScript, Prisma and Postgres (Neon). Deploys to Vercel.

## What it does

- **Vendors** come in three types, each with its own tab: **Brands**, **Wholesalers** and **Retailers**. Every vendor has a category (create as many as you like), lead status, client, and these sections:
  - **Products**: ASIN, sub-niche, BSR (30/90/180 days), price (30/90/180 days), monthly sales, Amazon stock rate (90/180 days), dominant seller % (90/180 days), A+ content (yes/no), reviews, rating, marketplace profile link and forecast purchase.
  - **Contact**: any number of emails, contact numbers, website links and social media links. The first email receives outreach.
  - **Lead Status**: the full history of calls, meetings, messages, notes, status changes and every email sent or received. Log new activities from the same tab.
  - **Purchasing Plan**: opens once the vendor is **Approved**. A table of products with MOQ, ASIN, cost price, quantity, measuring unit and total, with a plan total. Lines below MOQ are flagged.
- **Status workflow**: every vendor starts as **UnTouched**. Sending the outreach email sets it to **Emailed**. A reply sets it to **Follow Up**. You mark it **Approved** or **Rejected**. Every change is recorded in Lead Status.
- **Write draft**: one click writes an outreach email (worded for a brand, wholesaler or retailer) and saves it to the client's mailbox Drafts. Edit it, then send.
- **Write follow-up draft**: available for Emailed vendors with no reply 3 days after the last email. The dashboard lists every vendor that's due, with a "write all" button.
- **Pending drafts**: shown per vendor, per client, and in total on the dashboard.
- **Clients**: name, store name, business name, email, domains, website, socials, phone, address, and marketplace. Each client page lists the vendors hunted for them.
- **Per-client mailbox**: connect each worker mailbox (for example worker1@abc.com) to its client. The client page shows Inbox, Sent and Drafts, filterable by vendor. Mail is matched to vendors by their email addresses or website domains.

## Run it on your computer

You need Node.js 20 or newer.

1. Install packages:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill it in. In the Neon console, **Connect** shows your connection string: use the pooled one (host contains `-pooler`, add `&pgbouncer=true` at the end) for `DATABASE_URL`, and the same string without `-pooler` for `DIRECT_URL`. Set `APP_SECRET`, `APP_PASSWORD` and `CRON_SECRET` to your own values, and `APP_TIMEZONE` to your time zone (for example `Asia/Karachi`).
3. Create the tables in the database:
   ```bash
   npm run db:push
   ```
   If the database still has tables from an older version of this app, reset it instead. This **deletes all data** in that database:
   ```bash
   npx prisma db push --force-reset
   ```
4. Optional: load sample clients and vendors to click around with:
   ```bash
   npm run db:seed
   ```
5. Start the app:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and sign in with your `APP_PASSWORD`.

## Connecting mailboxes

On a client's page, open **Add a mailbox**.

- **Real mailbox (IMAP/SMTP)** works with Gmail / Google Workspace, Outlook / Microsoft 365, Zoho, Titan and most other providers. Server settings for the common ones are shown on the form. Gmail and Google Workspace need an **app password** (Google Account, Security, 2-Step Verification, App passwords) rather than the normal password. Microsoft 365 tenants must have SMTP AUTH and IMAP enabled for the mailbox.
- **Demo** mailboxes keep everything inside the app and never send real email. A "Simulate vendor reply" button on the vendor page lets you try the whole workflow.

Drafts written in the app are saved to the real mailbox's Drafts folder, so your team can also send them from Gmail or Outlook. Use **Sync now** on the client page to pull in new mail. Mail sent from the mail client and replies from vendors update lead statuses on sync. Passwords are stored encrypted with `APP_SECRET`.

### Drafting with AI (optional)

Set `ANTHROPIC_API_KEY` and the Write draft buttons use Claude to write a personalised email from the vendor's details. Without a key, built-in templates are used. Claude requests use the server-side refusal fallback, so a declined request is retried on another model automatically.

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. In Vercel, **Add New Project**, import the repository.
3. Add the same environment variables as your `.env` (`DATABASE_URL`, `DIRECT_URL`, `APP_SECRET`, `APP_PASSWORD`, `CRON_SECRET`, `APP_TIMEZONE`, optional `ANTHROPIC_API_KEY`).
4. Deploy. `vercel.json` runs a mailbox sync once a day at 06:00 UTC, the most Vercel's Hobby plan allows. For fresher mail, use **Sync all mailboxes** on the dashboard or **Sync now** on a client page any time. On Vercel Pro you can change the schedule to something like `0 */2 * * *`.

## Project layout

- `prisma/schema.prisma`: database tables
- `src/lib/workflow.ts`: drafts, sending, follow-up rules, mailbox sync and status changes
- `src/lib/mail/`: mailbox providers (`imap.ts`, `demo.ts`). Add a Gmail API or Microsoft Graph provider here by implementing `MailAdapter`.
- `src/lib/drafts.ts`: outreach and follow-up email text
- `src/app/(app)/`: pages (dashboard, vendors, clients, categories)
- `src/app/actions.ts`: form actions
