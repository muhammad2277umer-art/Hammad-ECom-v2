"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActivityType, LeadStatus, Marketplace, MailProvider, VendorType } from "@prisma/client";
import { AUTH_COOKIE, authToken } from "@/lib/auth";
import {
  BSR_DAYS, DOMINANT_SELLER_DAYS, PRICE_DAYS, PURCHASE_UNITS, STOCK_RATE_DAYS,
} from "@/lib/constants";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { adapterFor } from "@/lib/mail";
import * as wf from "@/lib/workflow";

function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function withParam(path: string, key: string, value: string) {
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("msg");
  params.delete("error");
  params.set(key, value);
  return `${base}?${params}`;
}

// Runs an action, then returns to the page with a success or error banner.
async function run(
  returnTo: string,
  fn: () => Promise<string | void>,
  success?: string,
  successTo?: () => string,
): Promise<never> {
  let target: string;
  try {
    const msg = (await fn()) || success;
    const to = successTo?.() ?? returnTo;
    target = msg ? withParam(to, "msg", msg) : to;
  } catch (err) {
    target = withParam(returnTo, "error", err instanceof Error ? err.message : String(err));
  }
  revalidatePath("/", "layout");
  redirect(target);
}

function back(form: FormData, fallback: string) {
  const r = str(form, "returnTo");
  return r && r.startsWith("/") ? r : fallback;
}

// ---- auth ----

export async function login(form: FormData) {
  const next = str(form, "next") ?? "/";
  if (str(form, "password") !== process.env.APP_PASSWORD) {
    redirect(`/login?error=${encodeURIComponent("Wrong password")}&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(AUTH_COOKIE, await authToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(AUTH_COOKIE);
  redirect("/login");
}

// ---- categories ----

export async function createCategory(form: FormData) {
  const name = str(form, "name");
  return run(back(form, "/categories"), async () => {
    if (!name) throw new Error("Category name is required.");
    await db.category.create({ data: { name } });
  }, "Category added");
}

export async function renameCategory(form: FormData) {
  const id = str(form, "id")!;
  const name = str(form, "name");
  return run("/categories", async () => {
    if (!name) throw new Error("Category name is required.");
    await db.category.update({ where: { id }, data: { name } });
  }, "Category renamed");
}

export async function deleteCategory(form: FormData) {
  const id = str(form, "id")!;
  return run("/categories", async () => {
    await db.category.delete({ where: { id } });
  }, "Category deleted");
}

// ---- clients ----

export async function saveClient(form: FormData) {
  const id = str(form, "id");
  const data = {
    name: str(form, "name") ?? "",
    storeName: str(form, "storeName"),
    businessName: str(form, "businessName"),
    email: str(form, "email"),
    phone: str(form, "phone"),
    domains: (str(form, "domains") ?? "").split(/[\s,]+/).filter(Boolean),
    website: str(form, "website"),
    instagram: str(form, "instagram"),
    facebook: str(form, "facebook"),
    tiktok: str(form, "tiktok"),
    linkedin: str(form, "linkedin"),
    address: str(form, "address"),
    marketplace: (str(form, "marketplace") ?? "AMAZON") as Marketplace,
    notes: str(form, "notes"),
  };
  let savedId = id;
  const returnTo = id ? `/clients/${id}` : "/clients/new";
  try {
    if (!data.name) throw new Error("Client name is required.");
    const saved = id
      ? await db.client.update({ where: { id }, data })
      : await db.client.create({ data });
    savedId = saved.id;
  } catch (err) {
    redirect(withParam(returnTo, "error", err instanceof Error ? err.message : String(err)));
  }
  revalidatePath("/", "layout");
  redirect(withParam(`/clients/${savedId}`, "msg", "Client saved"));
}

export async function deleteClient(form: FormData) {
  const id = str(form, "id")!;
  await db.client.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam("/clients", "msg", "Client deleted"));
}

// ---- vendors ----

function lines(form: FormData, key: string, lower = false) {
  return (str(form, key) ?? "")
    .split(/[\n,]+/)
    .map((v) => (lower ? v.trim().toLowerCase() : v.trim()))
    .filter(Boolean);
}

function num(form: FormData, key: string) {
  const v = str(form, key);
  if (v === null) return null;
  const n = Number(v.replace(/[,%$\s]/g, ""));
  if (Number.isNaN(n)) throw new Error(`${key} must be a number.`);
  return n;
}

function int(form: FormData, key: string) {
  const n = num(form, key);
  return n === null ? null : Math.round(n);
}

function days(form: FormData, key: string, allowed: number[]) {
  const n = int(form, key);
  return n !== null && allowed.includes(n) ? n : null;
}

export async function saveVendor(form: FormData) {
  const id = str(form, "id");
  const data = {
    name: str(form, "name") ?? "",
    type: (str(form, "type") ?? "BRAND") as VendorType,
    categoryId: str(form, "categoryId"),
    clientId: str(form, "clientId"),
    mailboxId: str(form, "mailboxId"),
    contactName: str(form, "contactName"),
    emails: lines(form, "emails", true),
    phones: lines(form, "phones"),
    websites: lines(form, "websites"),
    socials: lines(form, "socials"),
    address: str(form, "address"),
    description: str(form, "description"),
  };
  const status = (str(form, "status") ?? "UNTOUCHED") as LeadStatus;
  let savedId = id;
  const returnTo = id ? `/vendors/${id}?tab=details` : "/vendors/new";
  try {
    if (!data.name) throw new Error("Vendor name is required.");
    const newCategory = str(form, "newCategory");
    if (newCategory) {
      const cat = await db.category.upsert({ where: { name: newCategory }, update: {}, create: { name: newCategory } });
      data.categoryId = cat.id;
    }
    // A worker mailbox must belong to the vendor's client.
    if (data.mailboxId) {
      const mb = await db.mailbox.findUnique({ where: { id: data.mailboxId } });
      if (!mb || mb.clientId !== data.clientId) data.mailboxId = null;
    }
    if (id) {
      await db.vendor.update({ where: { id }, data });
      await wf.changeStatus(id, status, "Changed by hand");
    } else {
      savedId = (await db.vendor.create({ data: { ...data, status } })).id;
    }
  } catch (err) {
    redirect(withParam(returnTo, "error", err instanceof Error ? err.message : String(err)));
  }
  revalidatePath("/", "layout");
  redirect(withParam(`/vendors/${savedId}`, "msg", "Vendor saved"));
}

export async function deleteVendor(form: FormData) {
  const id = str(form, "id")!;
  const v = await db.vendor.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam(`/vendors?type=${v.type}`, "msg", "Vendor deleted"));
}

export async function setVendorStatus(form: FormData) {
  const id = str(form, "id")!;
  const status = str(form, "status") as LeadStatus;
  return run(back(form, `/vendors/${id}`), async () => {
    await wf.changeStatus(id, status, str(form, "reason") ?? undefined, str(form, "by"));
  }, "Status updated");
}

// ---- products ----

export async function saveProduct(form: FormData) {
  const vendorId = str(form, "vendorId");
  const id = str(form, "id");
  const returnTo = back(form, vendorId ? `/vendors/${vendorId}?tab=products` : "/products");
  // Adding from the Products page opens the new product.
  const fromProductsPage = returnTo.startsWith("/products/new");
  let target = returnTo;
  return run(returnTo, async () => {
    if (!vendorId) throw new Error("Choose the vendor that sells this product.");
    const asin = str(form, "asin")?.toUpperCase();
    if (!asin) throw new Error("ASIN is required.");
    const aPlus = str(form, "aPlus");
    const data = {
      asin,
      subNiche: str(form, "subNiche"),
      bsr: int(form, "bsr"),
      bsrDays: days(form, "bsrDays", BSR_DAYS),
      price: num(form, "price"),
      priceDays: days(form, "priceDays", PRICE_DAYS),
      monthlySales: int(form, "monthlySales"),
      amazonStockRate: num(form, "amazonStockRate"),
      amazonStockRateDays: days(form, "amazonStockRateDays", STOCK_RATE_DAYS),
      dominantSellerPct: num(form, "dominantSellerPct"),
      dominantSellerDays: days(form, "dominantSellerDays", DOMINANT_SELLER_DAYS),
      aPlus: aPlus === "yes" ? true : aPlus === "no" ? false : null,
      reviews: int(form, "reviews"),
      rating: num(form, "rating"),
      marketplaceProfile: str(form, "marketplaceProfile"),
      forecastPurchase: int(form, "forecastPurchase"),
    };
    if (data.rating !== null && (data.rating < 0 || data.rating > 5)) throw new Error("Rating must be between 0 and 5.");
    if (id) await db.product.update({ where: { id }, data: { ...data, vendorId } });
    else {
      const created = await db.product.create({ data: { ...data, vendorId } });
      if (fromProductsPage) target = `/products/${created.id}`;
    }
  }, id ? "Product updated" : "Product added", () => target);
}

export async function deleteProduct(form: FormData) {
  const id = str(form, "id")!;
  const p = await db.product.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam(back(form, `/vendors/${p.vendorId}?tab=products`), "msg", "Product deleted"));
}

// ---- lead activity ----

export async function addActivity(form: FormData) {
  const vendorId = str(form, "vendorId")!;
  return run(`/vendors/${vendorId}?tab=lead`, async () => {
    const summary = str(form, "summary");
    if (!summary) throw new Error("Write a short summary of the activity.");
    const date = str(form, "date");
    await db.activity.create({
      data: {
        vendorId,
        type: (str(form, "type") ?? "CALL") as ActivityType,
        summary,
        details: str(form, "details"),
        by: str(form, "by"),
        // A picked day is stored at midday UTC so it shows as that day in any time zone.
        date: date ? new Date(`${date}T12:00:00Z`) : new Date(),
      },
    });
  }, "Activity logged");
}

export async function deleteActivity(form: FormData) {
  const id = str(form, "id")!;
  const a = await db.activity.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam(`/vendors/${a.vendorId}?tab=lead`, "msg", "Activity deleted"));
}

// ---- purchasing plan ----

export async function savePurchaseItem(form: FormData) {
  const vendorId = str(form, "vendorId")!;
  const id = str(form, "id");
  return run(`/vendors/${vendorId}?tab=purchasing`, async () => {
    const vendor = await db.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    if (vendor.status !== "APPROVED") throw new Error("A purchasing plan is only available for Approved vendors.");
    const asin = str(form, "asin")?.toUpperCase();
    const costPrice = num(form, "costPrice");
    const quantity = int(form, "quantity");
    if (!asin) throw new Error("ASIN is required.");
    if (costPrice === null || costPrice < 0) throw new Error("Enter a cost price.");
    if (!quantity || quantity <= 0) throw new Error("Enter a quantity.");
    const unit = str(form, "unit") ?? "Units";
    const data = {
      asin,
      productName: str(form, "productName"),
      moq: int(form, "moq"),
      costPrice,
      quantity,
      unit: PURCHASE_UNITS.includes(unit) ? unit : "Units",
    };
    if (id) await db.purchaseItem.update({ where: { id }, data });
    else await db.purchaseItem.create({ data: { ...data, vendorId } });
  }, id ? "Line updated" : "Line added");
}

export async function deletePurchaseItem(form: FormData) {
  const id = str(form, "id")!;
  const item = await db.purchaseItem.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam(`/vendors/${item.vendorId}?tab=purchasing`, "msg", "Line deleted"));
}

// ---- drafts ----

export async function writeDraft(form: FormData) {
  const id = str(form, "vendorId")!;
  return run(back(form, `/vendors/${id}`), async () => {
    await wf.writeOutreachDraft(id);
  }, "Outreach draft written");
}

export async function writeFollowUp(form: FormData) {
  const id = str(form, "vendorId")!;
  return run(back(form, `/vendors/${id}`), async () => {
    await wf.writeFollowUpDraft(id);
  }, "Follow-up draft written");
}

export async function writeAllFollowUps(form: FormData) {
  return run(back(form, "/"), async () => {
    const due = await db.vendor.findMany({ where: wf.followUpDueWhere(), select: { id: true } });
    const failures: string[] = [];
    for (const v of due) {
      await wf.writeFollowUpDraft(v.id).catch((e) => failures.push(e.message));
    }
    const done = due.length - failures.length;
    if (failures.length) throw new Error(`${done} follow-up drafts written, ${failures.length} failed: ${failures[0]}`);
    return `${done} follow-up draft${done === 1 ? "" : "s"} written`;
  });
}

export async function saveDraft(form: FormData) {
  const id = str(form, "id")!;
  return run(back(form, "/"), async () => {
    await wf.updateDraft(id, {
      toAddress: str(form, "toAddress") ?? "",
      subject: str(form, "subject") ?? "",
      body: (form.get("body") as string) ?? "",
    });
  }, "Draft saved");
}

export async function sendDraft(form: FormData) {
  const id = str(form, "id")!;
  return run(back(form, "/"), async () => {
    if (form.get("body") !== null) {
      await wf.updateDraft(id, {
        toAddress: str(form, "toAddress") ?? "",
        subject: str(form, "subject") ?? "",
        body: (form.get("body") as string) ?? "",
      });
    }
    await wf.sendDraft(id);
  }, "Email sent");
}

export async function deleteDraft(form: FormData) {
  const id = str(form, "id")!;
  return run(back(form, "/"), async () => {
    await wf.deleteDraft(id);
  }, "Draft deleted");
}

export async function simulateReply(form: FormData) {
  const id = str(form, "vendorId")!;
  return run(back(form, `/vendors/${id}`), async () => {
    await wf.simulateReply(id);
  }, "Simulated reply received");
}

// ---- mailboxes ----

export async function addMailbox(form: FormData) {
  const clientId = str(form, "clientId")!;
  const provider = (str(form, "provider") ?? "DEMO") as MailProvider;
  const password = str(form, "password");
  return run(back(form, `/clients/${clientId}`), async () => {
    const address = str(form, "address")?.toLowerCase();
    if (!address) throw new Error("Mailbox address is required.");
    const mailbox = await db.mailbox.create({
      data: {
        clientId,
        address,
        displayName: str(form, "displayName"),
        provider,
        imapHost: str(form, "imapHost"),
        imapPort: Number(str(form, "imapPort")) || null,
        smtpHost: str(form, "smtpHost"),
        smtpPort: Number(str(form, "smtpPort")) || null,
        username: str(form, "username"),
        passwordEnc: password ? encrypt(password) : null,
        sentFolder: str(form, "sentFolder"),
        draftsFolder: str(form, "draftsFolder"),
      },
    });
    if (provider === "IMAP") {
      try {
        await adapterFor(mailbox).test(mailbox);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.mailbox.update({ where: { id: mailbox.id }, data: { lastError: message } });
        throw new Error(`Mailbox saved, but connecting failed: ${message}`);
      }
      const { imported } = await wf.syncMailbox(mailbox.id);
      return `Mailbox connected, ${imported} messages imported`;
    }
  }, "Mailbox added");
}

export async function deleteMailbox(form: FormData) {
  const id = str(form, "id")!;
  const mb = await db.mailbox.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect(withParam(`/clients/${mb.clientId}`, "msg", "Mailbox removed"));
}

export async function syncAll(form: FormData) {
  return run(back(form, "/"), async () => {
    const results = await wf.syncAllMailboxes();
    if (!results.length) return "No real mailboxes connected yet";
    const imported = results.reduce((n, r) => n + (r.imported ?? 0), 0);
    const failed = results.filter((r) => r.error);
    if (failed.length) throw new Error(`Synced with ${failed.length} failure(s). ${failed[0].address}: ${failed[0].error}`);
    return `Synced ${results.length} mailbox${results.length === 1 ? "" : "es"}, ${imported} new message${imported === 1 ? "" : "s"}`;
  });
}

export async function syncMailbox(form: FormData) {
  const id = str(form, "id")!;
  return run(back(form, "/"), async () => {
    const { imported } = await wf.syncMailbox(id);
    return `Synced, ${imported} new message${imported === 1 ? "" : "s"}`;
  });
}
