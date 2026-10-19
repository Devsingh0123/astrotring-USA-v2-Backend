import { Router } from 'express';
import {
  getPacksCatalog,
  validateCoupon,
  createOrder,
  verifyPayment,
  paymentFailed,
  razorpayWebhook,
  getUserInvoices,
  getInvoiceById
} from '../controllers/billingController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/packs', getPacksCatalog);
router.post('/validate-coupon', protect, validateCoupon);
router.post('/create-order', protect, createOrder);
router.post('/verify-payment', protect, verifyPayment);
router.post('/payment-failed', protect, paymentFailed);
router.post('/webhook', razorpayWebhook);
router.get('/invoices', protect, getUserInvoices);
router.get('/invoices/:invoiceId', protect, getInvoiceById);

export default router;
