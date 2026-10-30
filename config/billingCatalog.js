/**
 * Server-Side Billing Catalog & GST Constants
 * All prices, discounts, and credits are resolved strictly on the backend.
 */

export const SELLER_GST_INFO = {
  companyName: "VELTEX SERVICES PRIVATE LIMITED",
  brandName: "Japaika",
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

/**
 * System-wide supported currencies:
 * - INR: Domestic payments, 18% inclusive GST (CGST/SGST in Delhi, IGST elsewhere).
 * - USD: International payments, 0% Indian GST, charged in USD cents via Razorpay.
 */
export const SUPPORTED_CURRENCIES = Object.freeze(["INR", "USD"]);

