import { Op } from 'sequelize';
import { Invoice, Order, QuestionPack, ReportPack, Coupon } from '../models/index.js';
import {
  DEFAULT_COUPONS,
  SELLER_GST_INFO,
  SUPPORTED_CURRENCIES
} from '../config/billingCatalog.js';
import {
  calculateOrderPricing,
  createRazorpayOrder,
  verifyRazorpayPayment,
  markOrderFailedOrCancelled,
  handleRazorpayWebhook,
  formatInvoice
} from '../services/billingService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. GET /api/v1/billing/packs?currency=INR
 * Fetches dynamic question packs from database and report packs from catalog.
 */
export const getPacksCatalog = asyncHandler(async (req, res) => {
  const currency = String(req.query.currency || 'INR').trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    throw new AppError(`Unsupported currency "${req.query.currency}". Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}.`, 400);
  }

  // Fetch all active question packs dynamically from DB
  const activeQuestionPacks = await QuestionPack.findAll({
    where: { is_active: true },
    order: [
      ['sort_order', 'ASC'],
      ['credits', 'ASC']
    ]
  });

  const questionPacks = activeQuestionPacks.map((pack) => {
    const prices = pack.prices || {};
    const priceTier = prices[currency] || {};
    const originalPrice = Number(priceTier.originalPrice ?? priceTier.offerPrice ?? 0);
    const offerPrice = Number(priceTier.offerPrice ?? originalPrice ?? 0);

    return {
      id: pack.code,
      packDbId: pack.id,
      code: pack.code,
      tier: pack.tier,
      name: pack.name,
      title: pack.title || `${pack.name} Question Pack (${pack.credits} Questions)`,
      productType: 'questions',
      credits: pack.credits,
      currency,
      originalPrice,
      offerPrice
    };
  });

  // Fetch all active report packs dynamically from DB
  const activeReportPacks = await ReportPack.findAll({
    where: { is_active: true },
    order: [
      ['sort_order', 'ASC'],
      ['credits', 'ASC']
    ]
  });

  const reportPacks = activeReportPacks.map((pack) => {
    const prices = pack.prices || {};
    const priceTier = prices[currency] || {};
    const originalPrice = Number(priceTier.originalPrice ?? priceTier.offerPrice ?? 0);
    const offerPrice = Number(priceTier.offerPrice ?? originalPrice ?? 0);

    return {
      id: pack.code,
      packDbId: pack.id,
      code: pack.code,
      tier: pack.tier,
      name: pack.name,
      title: pack.title || `${pack.name} Report Pack (${pack.credits} Report Credits)`,
      productType: 'report_pack',
      credits: pack.credits,
      currency,
      originalPrice,
      offerPrice,
      discountAmount: Math.max(0, originalPrice - offerPrice),
      defaultPromoCode: 'VAULT'
    };
  });

  let coupons = await Coupon.findAll({ where: { is_active: true } });
  if (!coupons || coupons.length === 0) {
    coupons = DEFAULT_COUPONS;
  }

  res.status(200).json({
    success: true,
    message: 'Billing catalog fetched successfully.',
    data: {
      currency,
      supportedCurrencies: SUPPORTED_CURRENCIES,
      questionPacks,
      reportPacks,
      coupons
    }
  });
});

/**
 * 2. POST /api/v1/billing/validate-coupon
 */
export const validateCoupon = asyncHandler(async (req, res) => {
  const { packId, couponCode, currency = 'INR', billingState = 'Delhi' } = req.body;

  if (!packId || !couponCode) {
    throw new AppError('packId and couponCode are required.', 400);
  }

  const normalizedCurrency = String(currency || 'INR').trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    throw new AppError(`Unsupported currency "${currency}". Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}.`, 400);
  }

  const breakdown = await calculateOrderPricing({
    packId,
    currency: normalizedCurrency,
    couponCode,
    billingState
  });

  res.status(200).json({
    success: true,
    message: `Coupon "${breakdown.couponCode}" applied successfully.`,
    data: breakdown
  });
});

/**
 * 3. POST /api/v1/billing/create-order
 */
export const createOrder = asyncHandler(async (req, res) => {
  const { packId, currency = 'INR', couponCode = null, billingState = 'Delhi' } = req.body;

  if (!packId) {
    throw new AppError('packId is required.', 400);
  }

  const normalizedCurrency = String(currency || 'INR').trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    throw new AppError(`Unsupported currency "${currency}". Supported currencies are: ${SUPPORTED_CURRENCIES.join(', ')}.`, 400);
  }

  const orderData = await createRazorpayOrder({
    user: req.user,
    packId,
    currency: normalizedCurrency,
    couponCode,
    billingState
  });

  res.status(201).json({
    success: true,
    message: 'Razorpay order created successfully.',
    data: orderData
  });
});

/**
 * 4. POST /api/v1/billing/verify-payment
 */
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const result = await verifyRazorpayPayment({
    userId: req.user.id,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature
  });

  res.status(200).json({
    success: true,
    message: 'Payment verified and credits added.',
    data: result
  });
});

/**
 * 5. POST /api/v1/billing/payment-failed
 */
export const paymentFailed = asyncHandler(async (req, res) => {
  const { razorpay_order_id, status = 'failed', reason } = req.body;

  const order = await markOrderFailedOrCancelled({
    userId: req.user.id,
    razorpay_order_id,
    status,
    reason
  });

  res.status(200).json({
    success: true,
    message: `Order marked as ${order.status}.`,
    data: {
      orderId: order.razorpay_order_id,
      status: order.status
    }
  });
});

/**
 * 6. POST /api/v1/billing/webhook
 */
export const razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const result = await handleRazorpayWebhook(req.body, signature);

  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * 7. GET /api/v1/billing/invoices
 */
export const getUserInvoices = asyncHandler(async (req, res) => {
  const invoices = await Invoice.findAll({
    where: { user_id: req.user.id },
    include: [{ model: Order, as: 'order', attributes: ['credits_to_grant'] }],
    order: [['issued_at', 'DESC']]
  });

  res.status(200).json({
    success: true,
    message: 'Invoices fetched successfully.',
    data: {
      invoices: invoices.map((inv) => formatInvoice(inv, inv.order?.credits_to_grant)),
      seller: SELLER_GST_INFO
    }
  });
});

/**
 * 8. GET /api/v1/billing/invoices/:invoiceId
 */
export const getInvoiceById = asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  const invoice = await Invoice.findOne({
    where: {
      user_id: req.user.id,
      [Op.or]: [{ invoice_number: invoiceId }, { id: invoiceId }]
    },
    include: [{ model: Order, as: 'order', attributes: ['credits_to_grant'] }]
  });

  if (!invoice) {
    throw new AppError('Invoice not found.', 404);
  }

  res.status(200).json({
    success: true,
    message: 'Invoice fetched successfully.',
    data: {
      invoice: formatInvoice(invoice, invoice.order?.credits_to_grant),
      seller: SELLER_GST_INFO
    }
  });
});
