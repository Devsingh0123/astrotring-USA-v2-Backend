import rateLimit from 'express-rate-limit';

/**
 * Rate Limiter Configuration:
 * - Max: 100 requests per 1 minute per IP
 * - Block time: 1 minute (windowMs = 60000ms)
 */
export const rateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 1 minute.'
  }
});

export const authRateLimiter = rateLimiter;
export const apiRateLimiter = rateLimiter;

export default rateLimiter;

