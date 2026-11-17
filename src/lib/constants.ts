import type { ActivityType, LeadStatus, Marketplace, VendorType } from "@prisma/client";

export const FOLLOW_UP_AFTER_DAYS = 3;

export const STATUS_LABELS: Record<LeadStatus, string> = {
  UNTOUCHED: "UnTouched",
  EMAILED: "Emailed",
  FOLLOW_UP: "Follow Up",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const STATUS_STYLES: Record<LeadStatus, string> = {
  UNTOUCHED: "bg-slate-100 text-slate-700",
  EMAILED: "bg-blue-100 text-blue-700",
  FOLLOW_UP: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export const VENDOR_LABELS: Record<VendorType, string> = {
  BRAND: "Brand",
  WHOLESALER: "Wholesaler",
  RETAILER: "Retailer",
};

export const VENDOR_PLURAL: Record<VendorType, string> = {
  BRAND: "Brands",
  WHOLESALER: "Wholesalers",
  RETAILER: "Retailers",
};

export const MARKETPLACE_LABELS: Record<Marketplace, string> = {
  AMAZON: "Amazon",
  WALMART: "Walmart",
  SHOPIFY: "Shopify",
  TIKTOK: "TikTok Shop",
  EBAY: "eBay",
  ETSY: "Etsy",
  OTHER: "Other",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  MESSAGE: "Message",
  NOTE: "Note",
  STATUS: "Status change",
};

// Allowed look-back windows (days) for the Amazon product metrics.
export const BSR_DAYS = [30, 90, 180];
export const PRICE_DAYS = [30, 90, 180];
export const STOCK_RATE_DAYS = [90, 180];
export const DOMINANT_SELLER_DAYS = [90, 180];

export const PURCHASE_UNITS = ["Units", "Packs", "Cases", "Boxes", "Cartons", "Dozens", "Pallets", "Kg", "Lbs"];

export const STATUSES = Object.keys(STATUS_LABELS) as LeadStatus[];
export const VENDOR_TYPES = Object.keys(VENDOR_LABELS) as VendorType[];
export const MARKETPLACES = Object.keys(MARKETPLACE_LABELS) as Marketplace[];
export const MANUAL_ACTIVITY_TYPES = (Object.keys(ACTIVITY_LABELS) as ActivityType[]).filter((t) => t !== "STATUS");
