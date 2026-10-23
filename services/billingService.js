import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import {
  validatePaymentVerification,
  validateWebhookSignature
} from 'razorpay/dist/utils/razorpay-utils.js';
import { sequelize } from '../config/db.js';
import {
  User,
  BirthDetail,
  Order,
  Invoice,
  Coupon,
  QuestionPack
} from '../models/index.js';
import {
  BILLING_CATALOG,
  DEFAULT_COUPONS,
  SELLER_GST_INFO,
  SUPPORTED_CURRENCIES
} from '../config/billingCatalog.js';
import { AppError } from '../utils/appError.js';

dotenv.config();

// Official Razorpay Node.js SDK instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const TIER_RANK = { free: 0, silver: 1, gold: 2, diamond: 3 };

/**
 * Computes GST breakdown (18% GST inclusive for INR; 0% tax for international currencies).
 */
export const computeGstBreakdown = (totalAmount, currency = 'INR', billingState = 'Delhi') => {
  const total = Number(Number(totalAmount).toFixed(2));

  if (currency !== 'INR') {
    return {
      taxableAmount: total,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
      totalAmount: total,
      billingState: 'International'
    };
  }

  const state = String(billingState || 'Delhi').trim();
  const isDelhi = ['delhi', 'new delhi', 'dl'].includes(state.toLowerCase());
  const taxableAmount = Number((total / 1.18).toFixed(2));
  const taxAmount = Number((total - taxableAmount).toFixed(2));

  const cgst = isDelhi ? Number((taxAmount / 2).toFixed(2)) : 0;
  const sgst = isDelhi ? Number((taxAmount - cgst).toFixed(2)) : 0;
  const igst = isDelhi ? 0 : taxAmount;

  return {
    taxableAmount,
    cgst,
    sgst,
    igst,
    taxAmount,
    totalAmount: total,
    billingState: state
  };
};

/**
 * Calculates server-verified pricing, coupon discount, and GST breakdown for a pack.
 * Dynamic: Reads question packs from QuestionPack model; fallbacks to BILLING_CATALOG for reports.
 */
export const calculateOrderPricing = async ({
  packId,
  currency = 'INR',
  couponCode = null,
  billingState = 'Delhi'
}) => {
  const normalizedCurrency = String(currency).toUpperCase();
  if (!SUPPORTED_CURRENCIES.includes(normalizedCurrency)) {
    throw new AppError(`Unsupported currency: "${currency}".`, 400);
  }

  // 1. Look up in QuestionPack model first (by UUID or code e.g. pack_gold_12)
  let item = null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packId);

  let questionPack = null;
  if (isUuid) {
    questionPack = await QuestionPack.findOne({ where: { id: packId, is_active: true } });
  }
  if (!questionPack) {
    questionPack = await QuestionPack.findOne({ where: { code: packId, is_active: true } });
  }

  if (questionPack) {
    const prices = questionPack.prices || {};
    const priceTier = prices[normalizedCurrency] || prices['INR'];
    if (!priceTier || (priceTier.offerPrice === undefined && priceTier.originalPrice === undefined)) {
      throw new AppError(`Pricing not configured for currency "${normalizedCurrency}".`, 400);
    }

    item = {
      packId: questionPack.code,
      packDbId: questionPack.id,
      itemType: 'questions',
      itemTitle: questionPack.title || `${questionPack.name} Question Pack (${questionPack.credits} Questions)`,
      tier: questionPack.tier,
      credits: questionPack.credits,
      originalPrice: Number(priceTier.originalPrice ?? priceTier.offerPrice),
      offerPrice: Number(priceTier.offerPrice ?? priceTier.originalPrice)
    };
  } else if (BILLING_CATALOG[packId]) {
    // 2. Fallback to static catalog (for report packs)
    const product = BILLING_CATALOG[packId];
    const priceTier = product.pricing[normalizedCurrency] || product.pricing['INR'];
    item = {
      packId: product.id,
      packDbId: product.id,
      itemType: product.productType,
      itemTitle: product.title,
      tier: product.tier,
      credits: product.credits,
      originalPrice: Number(priceTier.originalPrice ?? priceTier.offerPrice),
      offerPrice: Number(priceTier.offerPrice ?? priceTier.originalPrice)
    };
  } else {
    throw new AppError(`Invalid packId: "${packId}".`, 400);
  }

  const subtotal = item.originalPrice;
  let finalTotal = item.offerPrice;
  let appliedCoupon = null;

  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    const coupon = await Coupon.findOne({ where: { code, is_active: true } });

    if (!coupon) {
      throw new AppError(`Invalid or inactive coupon code "${code}".`, 400);
    }
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      throw new AppError(`Coupon "${code}" has expired.`, 400);
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      throw new AppError(`Coupon "${code}" usage limit reached.`, 400);
    }

    const applicable = Array.isArray(coupon.applicable_products)
      ? coupon.applicable_products
      : JSON.parse(coupon.applicable_products || '[]');

    const isApplicable =
      applicable.length === 0 ||
      applicable.includes(item.packId) ||
      applicable.includes(item.packDbId);

    if (!isApplicable) {
      throw new AppError(`Coupon "${code}" is not valid for ${item.itemTitle}.`, 400);
    }

    appliedCoupon = code;
    if (coupon.discount_type === 'percentage') {
      finalTotal = Number((item.offerPrice * (1 - Number(coupon.discount_value) / 100)).toFixed(2));
    } else if (coupon.discount_type === 'flat') {
      finalTotal = Math.max(0, Number((item.offerPrice - Number(coupon.discount_value)).toFixed(2)));
    } else {
      finalTotal = item.offerPrice;
    }
  }

  const discountAmount = Number((subtotal - finalTotal).toFixed(2));
  const gst = computeGstBreakdown(finalTotal, normalizedCurrency, billingState);

  return {
    packId: item.packId,
    packDbId: item.packDbId,
    itemType: item.itemType,
    itemTitle: item.itemTitle,
    tier: item.tier,
    credits: item.credits,
    currency: normalizedCurrency,
    subtotal,
    discountAmount,
    couponCode: appliedCoupon,
    ...gst,
    amountSubunits: Math.round(gst.totalAmount * 100)
  };
};

/**
 * Formats an Invoice database record for API responses.
 */
export const formatInvoice = (invoice, creditsGranted = null) => {
  const raw = invoice.toJSON ? invoice.toJSON() : invoice;
  return {
    id: raw.invoice_number,
    invoiceNumber: raw.invoice_number,
    orderId: raw.razorpay_order_id,
    paymentId: raw.razorpay_payment_id,
    date: raw.issued_at,
    itemType: raw.item_type,
    itemTitle: raw.item_title,
    sacCode: raw.sac_code,
    creditsGranted,
    currency: raw.currency,
    subtotal: Number(raw.subtotal),
    discount: Number(raw.discount),
    couponCode: raw.coupon_code,
    taxableAmount: Number(raw.taxable_amount),
    cgst: Number(raw.cgst),
    sgst: Number(raw.sgst),
    igst: Number(raw.igst),
    taxAmount: Number(raw.tax_amount),
    total: Number(raw.total),
    billingState: raw.billing_state,
    status: raw.status,
    method: raw.payment_method,
    userName: raw.customer_name,
    userEmail: raw.customer_email,
    seller: SELLER_GST_INFO
  };
};

/**
 * 1. Create Order via official Razorpay Node.js SDK (`razorpay.orders.create`)
 */
export const createRazorpayOrder = async ({
  user,
  packId,
  currency = 'INR',
  couponCode = null,
  billingState = 'Delhi'
}) => {
  const pricing = await calculateOrderPricing({
    packId,
    currency,
    couponCode,
    billingState
  });

  // Official Razorpay Orders API call
  const rzpOrder = await razorpay.orders.create({
    amount: pricing.amountSubunits,
    currency: pricing.currency,
    receipt: `rcpt_${Date.now()}`,
    notes: {
      userId: user.id,
      packId: pricing.packId,
      itemType: pricing.itemType,
      credits: String(pricing.credits),
      couponCode: pricing.couponCode || ''
    }
  });

  await Order.create({
    user_id: user.id,
    product_type: pricing.itemType,
    product_code: pricing.packId,
    item_title: pricing.itemTitle,
    credits_to_grant: pricing.credits,
    currency: pricing.currency,
    subtotal: pricing.subtotal,
    discount_amount: pricing.discountAmount,
    coupon_code: pricing.couponCode,
    taxable_amount: pricing.taxableAmount,
    cgst: pricing.cgst,
    sgst: pricing.sgst,
    igst: pricing.igst,
    tax_amount: pricing.taxAmount,
    total_amount: pricing.totalAmount,
    amount_subunits: pricing.amountSubunits,
    billing_state: pricing.billingState,
    razorpay_order_id: rzpOrder.id,
    status: 'pending',
    is_credited: false
  });

  return {
    orderId: rzpOrder.id,
    keyId: process.env.RAZORPAY_KEY_ID,
    amount: rzpOrder.amount,
    currency: rzpOrder.currency,
    breakdown: pricing
  };
};

/**
 * Marks an Order as paid, credits user balance, and generates a sequential GST Invoice.
 * Uses a database transaction and `is_credited` check for idempotency.
 */
export const fulfillPaidOrder = async ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = null,
  paymentMethod = 'razorpay'
}) => {
  return sequelize.transaction(async (t) => {
    const order = await Order.findOne({
      where: { razorpay_order_id: razorpayOrderId },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!order) {
      throw new AppError(`Order "${razorpayOrderId}" not found.`, 404);
    }

    const user = await User.findByPk(order.user_id, {
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (order.is_credited && order.status === 'paid') {
      const existingInvoice = await Invoice.findOne({
        where: { order_id: order.id },
        transaction: t
      });
      return {
        order,
        user,
        invoice: formatInvoice(existingInvoice, order.credits_to_grant)
      };
    }

    // 1. Update Order
    order.status = 'paid';
    order.is_credited = true;
    order.razorpay_payment_id = razorpayPaymentId;
    order.razorpay_signature = razorpaySignature;
    order.payment_method = paymentMethod;
    await order.save({ transaction: t });

    // 2. Credit User Balance & Tier
    if (order.product_type === 'questions') {
      user.credit_balance += order.credits_to_grant;
    } else {
      user.report_credits += order.credits_to_grant;
    }

    let packTier = BILLING_CATALOG[order.product_code]?.tier;
    if (!packTier) {
      const qp = await QuestionPack.findOne({
        where: { code: order.product_code },
        transaction: t
      });
      packTier = qp?.tier;
    }
    if (packTier && TIER_RANK[packTier] > TIER_RANK[user.tier]) {
      user.tier = packTier;
    }
    await user.save({ transaction: t });

    // 3. Increment Coupon Usage
    if (order.coupon_code) {
      await Coupon.increment('used_count', {
        by: 1,
        where: { code: order.coupon_code },
        transaction: t
      });
    }

    // 4. Create Sequential GST Invoice
    const primaryProfile = await BirthDetail.findOne({
      where: { user_id: user.id, is_primary: true },
      transaction: t
    });
    const customerName = primaryProfile?.full_name || user.email.split('@')[0];

    const count = await Invoice.count({ paranoid: false, transaction: t });
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await Invoice.create({
      invoice_number: invoiceNumber,
      order_id: order.id,
      user_id: user.id,
      razorpay_order_id: order.razorpay_order_id,
      razorpay_payment_id: order.razorpay_payment_id,
      payment_method: order.payment_method,
      item_type: order.product_type,
      item_title: order.item_title,
      sac_code: SELLER_GST_INFO.sacCode,
      currency: order.currency,
      subtotal: order.subtotal,
      discount: order.discount_amount,
      coupon_code: order.coupon_code,
      taxable_amount: order.taxable_amount,
      cgst: order.cgst,
      sgst: order.sgst,
      igst: order.igst,
      tax_amount: order.tax_amount,
      total: order.total_amount,
      billing_state: order.billing_state,
      customer_name: customerName,
      customer_email: user.email,
      status: 'PAID',
      issued_at: new Date()
    }, { transaction: t });

    return {
      order,
      user,
      invoice: formatInvoice(invoice, order.credits_to_grant)
    };
  });
};

/**
 * 2. Verify Payment Signature using official Razorpay utility (`validatePaymentVerification`)
 */
export const verifyRazorpayPayment = async ({
  userId,
  razorpay_order_id,
  razorpay_payment_id,
  razorpay_signature
}) => {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new AppError(
      'razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      400
    );
  }

  const order = await Order.findOne({ where: { razorpay_order_id } });
  if (!order) {
    throw new AppError('Order not found.', 404);
  }
  if (order.user_id !== userId) {
    throw new AppError('Unauthorized access to this order.', 403);
  }

  // Official Razorpay SDK payment signature verification
  const isValid = validatePaymentVerification(
    { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
    razorpay_signature,
    process.env.RAZORPAY_KEY_SECRET
  );

  if (!isValid) {
    order.status = 'failed';
    order.failure_reason = 'Invalid payment signature';
    await order.save();
    throw new AppError('Invalid payment signature.', 400);
  }

  const result = await fulfillPaidOrder({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature
  });

  return {
    orderId: result.order.razorpay_order_id,
    paymentId: result.order.razorpay_payment_id,
    productType: result.order.product_type,
    creditsAdded: result.order.credits_to_grant,
    creditsRemaining: result.user.credit_balance,
    reportCredits: result.user.report_credits,
    tier: result.user.tier,
    invoice: result.invoice
  };
};

/**
 * 3. Record Payment Failure or Cancellation
 */
export const markOrderFailedOrCancelled = async ({
  userId,
  razorpay_order_id,
  status = 'failed',
  reason = 'Payment cancelled or failed'
}) => {
  if (!razorpay_order_id) {
    throw new AppError('razorpay_order_id is required.', 400);
  }

  const order = await Order.findOne({ where: { razorpay_order_id } });
  if (!order) {
    throw new AppError('Order not found.', 404);
  }
  if (userId && order.user_id !== userId) {
    throw new AppError('Unauthorized access to this order.', 403);
  }

  if (order.status !== 'paid') {
    order.status = status === 'cancelled' ? 'cancelled' : 'failed';
    order.failure_reason = reason;
    await order.save();
  }

  return order;
};

/**
 * 4. Verify & Process Razorpay Webhooks using official `validateWebhookSignature`
 */
export const handleRazorpayWebhook = async (body, signature) => {
  if (!signature) {
    throw new AppError('Missing x-razorpay-signature header.', 400);
  }

  // Official Razorpay SDK webhook signature verification
  const isValid = validateWebhookSignature(
    JSON.stringify(body),
    signature,
    process.env.RAZORPAY_WEBHOOK_SECRET
  );

  if (!isValid) {
    throw new AppError('Invalid webhook signature.', 400);
  }

  const { event, payload } = body;
  const payment = payload?.payment?.entity;

  if (event === 'payment.captured' && payment?.order_id) {
    await fulfillPaidOrder({
      razorpayOrderId: payment.order_id,
      razorpayPaymentId: payment.id,
      paymentMethod: payment.method || 'razorpay'
    });
  } else if (event === 'payment.failed' && payment?.order_id) {
    await markOrderFailedOrCancelled({
      userId: null,
      razorpay_order_id: payment.order_id,
      status: 'failed',
      reason: payment.error_description || 'Payment failed'
    });
  } else if ((event === 'refund.created' || event === 'payment.refunded') && payment?.order_id) {
    await sequelize.transaction(async (t) => {
      const order = await Order.findOne({
        where: { razorpay_order_id: payment.order_id },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!order || order.status === 'refunded') return;

      const user = await User.findByPk(order.user_id, {
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (user && order.is_credited) {
        if (order.product_type === 'questions') {
          user.credit_balance = Math.max(0, user.credit_balance - order.credits_to_grant);
        } else {
          user.report_credits = Math.max(0, user.report_credits - order.credits_to_grant);
        }
        await user.save({ transaction: t });
      }

      order.status = 'refunded';
      order.is_credited = false;
      await order.save({ transaction: t });

      await Invoice.update(
        { status: 'REFUNDED' },
        { where: { order_id: order.id }, transaction: t }
      );
    });
  }

  return { received: true, event };
};
