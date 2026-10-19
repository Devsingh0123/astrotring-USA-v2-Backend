import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/index.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please provide a token to gain access.', 401));
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your access token has expired. Please refresh your token.', 401));
    }
    return next(new AppError('Invalid token. Please log in again.', 401));
  }

  const currentUser = await User.findByPk(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  req.user = currentUser;
  next();
});

/**
 * Optional authentication middleware:
 * Attaches `req.user` if a valid Bearer JWT is provided, or sets `req.user = null`
 * for unauthenticated guests without throwing an error (used by Astropedia).
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  req.user = null;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const currentUser = await User.findByPk(decoded.id);
    if (currentUser) {
      req.user = currentUser;
    }
  } catch {
    // Ignore invalid/expired token for optional auth endpoints
    req.user = null;
  }

  next();
});

