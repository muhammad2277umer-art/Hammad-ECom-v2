// Sample data so the app has something to click through. Run: npm run db:seed
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);

async function main() {
  if (await db.client.count()) {
    console.log("Database already has clients, skipping seed.");
    return;
  }
  const [beauty, pets, home] = await Promise.all(
    ["Beauty & Personal Care", "Pet Supplies", "Home & Kitchen"].map((name) => db.category.create({ data: { name } })),
  );

  const abc = await db.client.create({
    data: {
      name: "ABC",
      storeName: "ABC Essentials",
      businessName: "ABC Trading LLC",
      email: "owner@abc.com",
      domains: ["abc.com"],
      website: "abc.com",
      marketplace: "WALMART",
      mailboxes: { create: { address: "worker1@abc.com", displayName: "Sarah, ABC Essentials", provider: "DEMO" } },
    },
    include: { mailboxes: true },
  });
  const xyz = await db.client.create({
    data: {
      name: "XYZ",
      storeName: "XYZ Home Store",
      businessName: "XYZ Retail Inc",
      email: "hello@xyz.com",
      domains: ["xyz.com"],
      website: "xyz.com",
      marketplace: "AMAZON",
      mailboxes: { create: { address: "worker1@xyz.com", displayName: "Ali, XYZ Home Store", provider: "DEMO" } },
    },
    include: { mailboxes: true },
  });
  const abcBox = abc.mailboxes[0];

  await db.vendor.create({
    data: {
      name: "GlowLab Skincare", type: "BRAND", categoryId: beauty.id, clientId: abc.id, contactName: "Emma",
      emails: ["partners@glowlab.example"], phones: ["+1 555 010 2020"], websites: ["glowlab.example"],
      socials: ["instagram.com/glowlab"], description: "Clean skincare, strong reviews on DTC site.",
      products: {
        create: [
          { asin: "B0GLOW0001", subNiche: "Vitamin C serum", bsr: 4210, bsrDays: 90, price: 24.99, priceDays: 90, monthlySales: 1800, amazonStockRate: 72, amazonStockRateDays: 90, dominantSellerPct: 45, dominantSellerDays: 90, aPlus: true, reviews: 3120, rating: 4.5, marketplaceProfile: "amazon.com/dp/B0GLOW0001", forecastPurchase: 300 },
          { asin: "B0GLOW0002", subNiche: "Night cream", bsr: 15800, bsrDays: 30, price: 32, priceDays: 30, monthlySales: 450, aPlus: false, reviews: 640, rating: 4.2, forecastPurchase: 80 },
        ],
      },
    },
  });
  await db.vendor.create({
    data: {
      name: "PawPerfect", type: "BRAND", categoryId: pets.id, clientId: abc.id, emails: ["sales@pawperfect.example"], websites: ["pawperfect.example"],
      status: "APPROVED",
      activities: {
        create: [
          { type: "CALL", summary: "Intro call with sales team", details: "They sell to 3 other Walmart sellers; MAP policy applies.", by: "Sarah", date: daysAgo(9) },
          { type: "STATUS", summary: "Follow Up → Approved", details: "Wholesale account opened", by: "Sarah", date: daysAgo(5) },
        ],
      },
      purchaseItems: {
        create: [
          { asin: "B0PAW00001", productName: "Chew toy, large", moq: 48, costPrice: 6.4, quantity: 96, unit: "Units" },
          { asin: "B0PAW00002", productName: "Dog shampoo 500ml", moq: 12, costPrice: 38, quantity: 10, unit: "Cases" },
        ],
      },
    },
  });
  await db.vendor.create({
    data: { name: "KitchenCraft Supply", type: "WHOLESALER", categoryId: home.id, clientId: xyz.id, emails: ["wholesale@kitchencraft.example"], phones: ["+1 555 300 4000"], websites: ["kitchencraft.example"] },
  });
  await db.vendor.create({
    data: { name: "MegaMart Clearance", type: "RETAILER", categoryId: home.id, emails: ["b2b@megamart.example"], websites: ["megamart.example"] },
  });

  // A vendor emailed 4 days ago with no reply, so the follow-up button is live.
  const fresh = await db.vendor.create({
    data: {
      name: "HerbalRoots",
      type: "BRAND",
      categoryId: beauty.id,
      clientId: abc.id,
      emails: ["hello@herbalroots.example"],
      websites: ["herbalroots.example"],
      status: "EMAILED",
      firstEmailedAt: daysAgo(4),
      lastEmailedAt: daysAgo(4),
      activities: { create: { type: "STATUS", summary: "UnTouched → Emailed", details: "Outreach email sent", date: daysAgo(4) } },
    },
  });
  await db.emailMessage.create({
    data: {
      mailboxId: abcBox.id,
      vendorId: fresh.id,
      folder: "SENT",
      kind: "OUTREACH",
      messageId: "<seed-herbalroots@abc.com>",
      fromAddress: abcBox.address,
      toAddress: "hello@herbalroots.example",
      subject: "Partnership inquiry: HerbalRoots x ABC Essentials on Walmart",
      body: "Hi HerbalRoots team,\n\nWe'd love to carry your products on Walmart...\n\nBest,\nSarah",
      date: daysAgo(4),
    },
  });
  console.log(`Seeded clients ${abc.name}, ${xyz.name} with sample vendors.`);
}

main().finally(() => db.$disconnect());
