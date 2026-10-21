/**
 * Server-Side Billing Catalog & GST Constants
 * All prices, discounts, and credits are resolved strictly on the backend.
 */

export const SELLER_GST_INFO = {
  companyName: "VELTEX SERVICES PRIVATE LIMITED",
  brandName: "Astrotring",
  gstin: "07AAGCK6574Q1ZO",
  cin: "U72900DL2017PTC319827",
  pan: "AAGCK6574Q",
  address:
    "711, Plot A09, ITL Towers, Netaji Subhash Place, Pitampura, North West Delhi, Delhi, 110034",
  state: "Delhi",
  stateCode: "07",
  sacCode: "9983",
  serviceDescription: "Consultation Services",
  gstRatePercent: 18,
};

export const SUPPORTED_CURRENCIES = ["INR", "USD", "GBP", "EUR"];

export const BILLING_CATALOG = {
  // Question Packs (Vaani Chat Credits)
  pack_silver_7: {
    id: "pack_silver_7",
    productType: "questions",
    tier: "silver",
    name: "Silver",
    title: "Silver Question Pack (7 Questions)",
    credits: 7,
    pricing: {
      INR: { originalPrice: 1399, offerPrice: 699 },
      USD: { originalPrice: 14.99, offerPrice: 7.99 },
      GBP: { originalPrice: 12.99, offerPrice: 6.99 },
      EUR: { originalPrice: 13.99, offerPrice: 7.49 },
    },
  },
  pack_gold_12: {
    id: "pack_gold_12",
    productType: "questions",
    tier: "gold",
    name: "Gold",
    title: "Gold Question Pack (12 Questions)",
    credits: 12,
    pricing: {
      INR: { originalPrice: 2399, offerPrice: 799 },
      USD: { originalPrice: 29.99, offerPrice: 9.99 },
      GBP: { originalPrice: 24.99, offerPrice: 8.49 },
      EUR: { originalPrice: 27.99, offerPrice: 9.49 },
    },
  },
  pack_diamond_20: {
    id: "pack_diamond_20",
    productType: "questions",
    tier: "diamond",
    name: "Diamond",
    title: "Diamond Question Pack (20 Questions)",
    credits: 20,
    pricing: {
      INR: { originalPrice: 3999, offerPrice: 1199 },
      USD: { originalPrice: 49.99, offerPrice: 14.99 },
      GBP: { originalPrice: 39.99, offerPrice: 12.99 },
      EUR: { originalPrice: 44.99, offerPrice: 13.99 },
    },
  },

  // Report Packs (Report Credits)
  report_silver_1: {
    id: "report_silver_1",
    productType: "report_pack",
    tier: "silver",
    name: "Silver",
    title: "Silver Report Pack (1 Report Credit)",
    credits: 1,
    pricing: {
      INR: { originalPrice: 2999, offerPrice: 1999 },
      USD: { originalPrice: 29.99, offerPrice: 19.99 },
      GBP: { originalPrice: 24.99, offerPrice: 16.99 },
      EUR: { originalPrice: 27.99, offerPrice: 18.99 },
    },
  },
  report_gold_2: {
    id: "report_gold_2",
    productType: "report_pack",
    tier: "gold",
    name: "Gold",
    title: "Gold Report Pack (2 Report Credits)",
    credits: 2,
    pricing: {
      INR: { originalPrice: 5999, offerPrice: 2299 },
      USD: { originalPrice: 59.99, offerPrice: 24.99 },
      GBP: { originalPrice: 49.99, offerPrice: 20.99 },
      EUR: { originalPrice: 54.99, offerPrice: 22.99 },
    },
  },
  report_diamond_4: {
    id: "report_diamond_4",
    productType: "report_pack",
    tier: "diamond",
    name: "Diamond",
    title: "Diamond Report Pack (4 Report Credits)",
    credits: 4,
    pricing: {
      INR: { originalPrice: 11999, offerPrice: 2499 },
      USD: { originalPrice: 99.99, offerPrice: 29.99 },
      GBP: { originalPrice: 79.99, offerPrice: 24.99 },
      EUR: { originalPrice: 89.99, offerPrice: 27.99 },
    },
  },
};

export const DEFAULT_COUPONS = [
  {
    code: "QUICKGOLD",
    description: "67% OFF on Gold 12-Question Pack",
    discount_type: "pack_offer",
    discount_value: 67,
    applicable_products: ["pack_gold_12"],
    is_active: true,
  },
  {
    code: "GOLDNOW",
    description: "67% OFF on Gold 12-Question Pack",
    discount_type: "pack_offer",
    discount_value: 67,
    applicable_products: ["pack_gold_12"],
    is_active: true,
  },
  {
    code: "ASKMAX",
    description: "Discount on Silver & Diamond Question Packs",
    discount_type: "pack_offer",
    discount_value: 50,
    applicable_products: ["pack_silver_7", "pack_diamond_20"],
    is_active: true,
  },
  {
    code: "VAULT",
    description: "Discount on All Report Packs",
    discount_type: "pack_offer",
    discount_value: 60,
    applicable_products: [
      "report_silver_1",
      "report_gold_2",
      "report_diamond_4",
    ],
    is_active: true,
  },
];
