import type { Category, Client, Mailbox, Vendor, VendorType } from "@prisma/client";
import { saveVendor } from "@/app/actions";
import { STATUSES, STATUS_LABELS, VENDOR_LABELS, VENDOR_TYPES } from "@/lib/constants";
import { Field, btnPrimary, input } from "./ui";

export function VendorForm({ vendor, clients, categories, defaultClientId, defaultType }: {
  vendor?: Vendor | null;
  clients: (Client & { mailboxes: Mailbox[] })[];
  categories: Category[];
  defaultClientId?: string;
  defaultType?: VendorType;
}) {
  const t = (k: keyof Vendor) => (vendor?.[k] as string | null | undefined) ?? "";
  const list = (k: "emails" | "phones" | "websites" | "socials") => vendor?.[k].join("\n") ?? "";
  return (
    <form action={saveVendor} className="space-y-4">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Vendor name *"><input name="name" required defaultValue={t("name")} className={input} /></Field>
        <Field label="Vendor type">
          <select name="type" defaultValue={vendor?.type ?? defaultType ?? "BRAND"} className={input}>
            {VENDOR_TYPES.map((v) => <option key={v} value={v}>{VENDOR_LABELS[v]}</option>)}
          </select>
        </Field>
        <Field label="Lead status">
          <select name="status" defaultValue={vendor?.status ?? "UNTOUCHED"} className={input}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select name="categoryId" defaultValue={t("categoryId")} className={input}>
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Or create a new category"><input name="newCategory" placeholder="e.g. Pet supplies" className={input} /></Field>
        <Field label="Client (hunted for)">
          <select name="clientId" defaultValue={vendor?.clientId ?? defaultClientId ?? ""} className={input}>
            <option value="">Not linked yet</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.storeName ? ` (${c.storeName})` : ""}</option>)}
          </select>
        </Field>
        <Field label="Send from mailbox">
          <select name="mailboxId" defaultValue={t("mailboxId")} className={input}>
            <option value="">Client&apos;s first mailbox</option>
            {clients.filter((c) => c.mailboxes.length).map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.address}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Contact person"><input name="contactName" defaultValue={t("contactName")} className={input} /></Field>
        <Field label="Physical address"><input name="address" defaultValue={t("address")} className={input} /></Field>
      </div>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact (one per line)</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Emails (first one gets outreach)">
          <textarea name="emails" rows={3} defaultValue={list("emails")} placeholder="sales@vendor.com" className={input} />
        </Field>
        <Field label="Contact numbers">
          <textarea name="phones" rows={3} defaultValue={list("phones")} placeholder="+1 555 123 4567" className={input} />
        </Field>
        <Field label="Website links">
          <textarea name="websites" rows={3} defaultValue={list("websites")} placeholder="vendor.com" className={input} />
        </Field>
        <Field label="Social media links">
          <textarea name="socials" rows={3} defaultValue={list("socials")} placeholder="instagram.com/vendor" className={input} />
        </Field>
      </div>
      <Field label="Description">
        <textarea name="description" rows={3} defaultValue={t("description")} className={input} />
      </Field>
      <button className={btnPrimary}>{vendor ? "Save changes" : "Add vendor"}</button>
    </form>
  );
}
