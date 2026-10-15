import { Op } from 'sequelize';
import { User, Otp, RefreshToken } from '../models/index.js';
import { hashValue, compareValue } from '../utils/bcrypt.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../utils/jwt.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Cooldown and expiry constants
const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_SECONDS = 30;
const MAX_OTP_ATTEMPTS = 3;

/**
 * Helper: Generate secure 6-digit numeric OTP string
 */
const generateNumericOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * 1. POST /api/v1/auth/send-otp
 * Handles both Signup and Login initiation:
 * - Checks if email exists.
 * - If not: creates user (is_email_verified = false).
 * - Enforces resend cooldown (30s).
 * - Generates & hashes OTP, saves in DB, sends email.
 */
export const sendOtp = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return next(new AppError('Please provide a valid email address.', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Find or create user
  let user = await User.findOne({ where: { email: normalizedEmail } });
  let isNewUser = false;

  if (!user) {
    user = await User.create({
      email: normalizedEmail,
      is_email_verified: false,
      role: 'user'
    });
    isNewUser = true;
  }

  // Check cooldown timer to prevent spamming OTP requests (30 seconds)
  const recentOtp = await Otp.findOne({
    where: {
      user_id: user.id,
      purpose: 'auth'
    },
    order: [['created_at', 'DESC']]
  });

  if (recentOtp) {
    const diffMs = Date.now() - new Date(recentOtp.created_at).getTime();
    if (diffMs < OTP_COOLDOWN_SECONDS * 1000) {
      const waitTimeSeconds = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - diffMs) / 1000);
      return next(
        new AppError(
          `Please wait ${waitTimeSeconds} seconds before requesting a new OTP.`,
          429
        )
      );
    }
  }

  // Generate 6-digit OTP and store hash
  const otpCode = generateNumericOtp();
  const otpHash = await hashValue(otpCode);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await Otp.create({
    user_id: user.id,
    otp_hash: otpHash,
    purpose: 'auth',
    expires_at: expiresAt,
    attempts: 0
  });

  // Dispatch OTP email
  await sendOtpEmail(user.email, otpCode);

  res.status(200).json({
    success: true,
    message: isNewUser
      ? 'Account created. A verification code has been sent to your email.'
      : 'Verification code has been sent to your email.',
    data: {
      email: user.email,
      isNewUser,
      cooldownSeconds: OTP_COOLDOWN_SECONDS
    }
  });
});

/**
 * 2. POST /api/v1/auth/verify-otp
 * Verifies OTP for both Signup and Login:
 * - Validates OTP code, expiry, and max attempts.
 * - Marks email verified.
 * - Issues Access Token & Refresh Token.
 */
export const verifyOtp = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError('Email and OTP are required.', 400));
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail } });

  if (!user) {
    return next(new AppError('No account found with this email.', 404));
  }

  // Retrieve latest valid unexpired OTP
  const otpRecord = await Otp.findOne({
    where: {
      user_id: user.id,
      purpose: 'auth',
      expires_at: { [Op.gt]: new Date() }
    },
    order: [['created_at', 'DESC']]
  });

  if (!otpRecord) {
    return next(
      new AppError('OTP has expired or is invalid. Please request a new one.', 400)
    );
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    return next(
      new AppError(
        'Maximum OTP verification attempts exceeded. Please request a new OTP.',
        400
      )
    );
  }

  const isMatch = await compareValue(otp.toString().trim(), otpRecord.otp_hash);
  if (!isMatch) {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return next(new AppError('Invalid OTP code. Please check and try again.', 400));
  }

  // Valid OTP: mark email verified and consume OTP record
  if (!user.is_email_verified) {
    user.is_email_verified = true;
    await user.save();
  }
  await otpRecord.destroy();

  // Issue Access & Refresh Tokens
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  const accessToken = generateAccessToken(payload);
  const rawRefreshToken = generateRefreshToken(payload);

  const tokenHash = await hashValue(rawRefreshToken);
  const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await RefreshToken.create({
    user_id: user.id,
    token_hash: tokenHash,
    expires_at: refreshTokenExpiresAt
  });

  res.status(200).json({
    success: true,
    message: 'Authentication successful.',
    data: {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.is_email_verified,
        onboardingCompleted: user.onboarding_completed
      }
    }
  });
});

/**
 * 3. POST /api/v1/auth/refresh-token
 * Issues new access token using a valid unrevoked refresh token
 */
export const refreshToken = asyncHandler(async (req, res, next) => {
  const { refreshToken: rawToken } = req.body;

  if (!rawToken) {
    return next(new AppError('Refresh token is required.', 400));
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (err) {
    return next(new AppError('Invalid or expired refresh token.', 401));
  }

  const activeTokens = await RefreshToken.findAll({
    where: {
      user_id: decoded.id,
      revoked_at: null,
      expires_at: { [Op.gt]: new Date() }
    }
  });

  let matchingTokenRecord = null;
  for (const tokenRecord of activeTokens) {
    const isMatch = await compareValue(rawToken, tokenRecord.token_hash);
    if (isMatch) {
      matchingTokenRecord = tokenRecord;
      break;
    }
  }

  if (!matchingTokenRecord) {
    return next(
      new AppError('Refresh token has been revoked or is invalid.', 401)
    );
  }

  const user = await User.findByPk(decoded.id);
  if (!user) {
    return next(
      new AppError('User belonging to this token no longer exists.', 401)
    );
  }

  const newAccessToken = generateAccessToken({
    id: user.id,
    email: user.email,
    role: user.role
  });

  res.status(200).json({
    success: true,
    message: 'Access token refreshed successfully.',
    data: {
      accessToken: newAccessToken
    }
  });
});

/**
 * 4. POST /api/v1/auth/logout
 * Revokes refresh token in DB
 */
export const logout = asyncHandler(async (req, res, next) => {
  const { refreshToken: rawToken } = req.body;

  if (!rawToken) {
    return next(new AppError('Refresh token is required to log out.', 400));
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (err) {
    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });
  }

  const activeTokens = await RefreshToken.findAll({
    where: {
      user_id: decoded.id,
      revoked_at: null
    }
  });

  for (const tokenRecord of activeTokens) {
    const isMatch = await compareValue(rawToken, tokenRecord.token_hash);
    if (isMatch) {
      tokenRecord.revoked_at = new Date();
      await tokenRecord.save();
      break;
    }
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully. Refresh token revoked.'
  });
});

/**
 * 5. GET /api/v1/auth/me
 * Protected by auth middleware; returns current logged-in user profile
 */
export const getMe = asyncHandler(async (req, res, next) => {
  const user = req.user;

  // Retrieve primary birth details if present
  const { BirthDetail, BirthChart } = await import('../models/index.js');
  const primaryBirthDetail = await BirthDetail.findOne({
    where: {
      user_id: user.id,
      is_primary: true
    },
    include: [{ model: BirthChart, as: 'chart' }]
  });

  res.status(200).json({
    success: true,
    message: 'User profile fetched successfully.',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.is_email_verified,
        onboardingCompleted: user.onboarding_completed,
        createdAt: user.created_at
      },
      birthDetails: primaryBirthDetail ? {
        id: primaryBirthDetail.id,
        fullName: primaryBirthDetail.full_name,
        gender: primaryBirthDetail.gender,
        dateOfBirth: primaryBirthDetail.date_of_birth,
        timeOfBirth: primaryBirthDetail.time_of_birth,
        isTimeUnknown: primaryBirthDetail.is_time_unknown,
        birthCity: primaryBirthDetail.birth_city,
        latitude: primaryBirthDetail.latitude,
        longitude: primaryBirthDetail.longitude,
        timezone: primaryBirthDetail.timezone,
        profileType: primaryBirthDetail.profile_type,
        isPrimary: primaryBirthDetail.is_primary,
        chartId: primaryBirthDetail.chart_id,
        chartSummary: primaryBirthDetail.chart ? {
          ascendantSign: primaryBirthDetail.chart.ascendant_sign,
          moonSign: primaryBirthDetail.chart.moon_sign,
          sunSign: primaryBirthDetail.chart.sun_sign,
          nakshatra: primaryBirthDetail.chart.nakshatra,
          pada: primaryBirthDetail.chart.nakshatra_pada
        } : null
      } : null
    }
  });
});

