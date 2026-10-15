import { Router } from 'express';
import {
  sendOtp,
  verifyOtp,
  refreshToken,
  logout,
  getMe
} from '../controllers/authController.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// Apply auth rate limiter: 100 requests / 1 min per IP (1 min block time)
router.use(authRateLimiter);

/**
 * OTP-Only Authentication Endpoints
 */
// 1. Send OTP (Signup or Login based on email existence)
router.post('/send-otp', sendOtp);

// 2. Verify OTP (Verifies OTP, returns access + refresh tokens)
router.post('/verify-otp', verifyOtp);

// 3. Refresh Access Token
router.post('/refresh-token', refreshToken);

// 4. Logout (Revokes refresh token)
router.post('/logout', logout);

// 5. Get current user profile (Protected)
router.get('/me', protect, getMe);

export default router;
