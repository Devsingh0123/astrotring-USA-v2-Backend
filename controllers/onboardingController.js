import { BirthDetail, BirthChart, User } from '../models/index.js';
import { vedicAstrologyService } from '../services/vedicAstrologyService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. POST /api/v1/onboarding
 * Submit 2-step onboarding data together:
 * Step 1: name, gender
 * Step 2: dob, tob, isTimeUnknown, location (city, lat, lng, timezone)
 *
 * Saves primary birth details, automatically computes initial natal chart,
 * updates user.onboarding_completed = true.
 */
export const submitOnboarding = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const {
    name,
    gender,
    dob,
    tob,
    isTimeUnknown = false,
    location,
    date,
    time,
    place,
    latitude,
    longitude,
    timezone
  } = req.body;

  // Validation
  const fullName = (name || '').trim();
  if (!fullName) {
    return next(new AppError('Full name is required.', 400));
  }

  const normalizedGender = (gender || 'male').toLowerCase();
  if (!['male', 'female', 'other'].includes(normalizedGender)) {
    return next(new AppError('Gender must be male, female, or other.', 400));
  }

  const birthDate = dob || date;
  if (!birthDate) {
    return next(new AppError('Date of birth (YYYY-MM-DD) is required.', 400));
  }

  const birthTime = tob || time || (isTimeUnknown ? '12:00:00' : null);
  if (!birthTime) {
    return next(new AppError('Time of birth (HH:MM) is required.', 400));
  }

  const birthCity = (location?.city || place || '').trim();
  const lat = location?.lat ?? latitude;
  const lon = location?.lng ?? location?.lon ?? longitude;
  const tz = location?.timezoneOffset ?? location?.timezone ?? timezone;

  if (lat === undefined || lon === undefined || tz === undefined) {
    return next(new AppError('Birth location coordinates and timezone are required.', 400));
  }

  // 1. Calculate Natal Horoscope using Vedic Engine
  const horoscopeData = await vedicAstrologyService.getHoroscope({
    date: birthDate,
    time: birthTime,
    place: birthCity,
    latitude: lat,
    longitude: lon,
    timezone: tz,
    gender: normalizedGender
  });

  // 2. Persist BirthChart record
  const birthChart = await BirthChart.create({
    user_id: user.id,
    person_name: fullName,
    gender: normalizedGender,
    date_of_birth: birthDate,
    time_of_birth: birthTime,
    is_time_unknown: isTimeUnknown,
    birth_city: birthCity || 'Unknown City',
    latitude: lat,
    longitude: lon,
    timezone: tz,
    ascendant_sign: horoscopeData.summary?.ascendantSign,
    moon_sign: horoscopeData.summary?.moonSign,
    sun_sign: horoscopeData.summary?.sunSign,
    nakshatra: horoscopeData.summary?.nakshatra,
    nakshatra_pada: horoscopeData.summary?.pada,
    chart_data: horoscopeData
  });

  // 3. Persist or Update primary BirthDetail record in `birth_details` table
  let birthDetail = await BirthDetail.findOne({
    where: {
      user_id: user.id,
      is_primary: true
    }
  });

  if (birthDetail) {
    birthDetail.full_name = fullName;
    birthDetail.gender = normalizedGender;
    birthDetail.date_of_birth = birthDate;
    birthDetail.time_of_birth = birthTime;
    birthDetail.is_time_unknown = isTimeUnknown;
    birthDetail.birth_city = birthCity;
    birthDetail.latitude = lat;
    birthDetail.longitude = lon;
    birthDetail.timezone = tz;
    birthDetail.chart_id = birthChart.id;
    await birthDetail.save();
  } else {
    birthDetail = await BirthDetail.create({
      user_id: user.id,
      profile_type: 'self',
      is_primary: true,
      full_name: fullName,
      gender: normalizedGender,
      date_of_birth: birthDate,
      time_of_birth: birthTime,
      is_time_unknown: isTimeUnknown,
      birth_city: birthCity || 'Unknown City',
      latitude: lat,
      longitude: lon,
      timezone: tz,
      chart_id: birthChart.id
    });
  }

  // 4. Update user onboarding_completed state
  user.onboarding_completed = true;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Onboarding completed successfully.',
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.is_email_verified,
        onboardingCompleted: true
      },
      birthDetails: {
        id: birthDetail.id,
        fullName: birthDetail.full_name,
        gender: birthDetail.gender,
        dateOfBirth: birthDetail.date_of_birth,
        timeOfBirth: birthDetail.time_of_birth,
        isTimeUnknown: birthDetail.is_time_unknown,
        birthCity: birthDetail.birth_city,
        latitude: birthDetail.latitude,
        longitude: birthDetail.longitude,
        timezone: birthDetail.timezone,
        chartId: birthChart.id
      },
      chartSummary: horoscopeData.summary
    }
  });
});

/**
 * 2. GET /api/v1/onboarding/status
 * Check current user onboarding state and primary profile
 */
export const getOnboardingStatus = asyncHandler(async (req, res, next) => {
  const user = req.user;

  const primaryBirthDetail = await BirthDetail.findOne({
    where: {
      user_id: user.id,
      is_primary: true
    },
    include: [{ model: BirthChart, as: 'chart' }]
  });

  res.status(200).json({
    success: true,
    data: {
      onboardingCompleted: user.onboarding_completed,
      hasBirthDetails: !!primaryBirthDetail,
      primaryProfile: primaryBirthDetail ? {
        id: primaryBirthDetail.id,
        fullName: primaryBirthDetail.full_name,
        gender: primaryBirthDetail.gender,
        dateOfBirth: primaryBirthDetail.date_of_birth,
        timeOfBirth: primaryBirthDetail.time_of_birth,
        isTimeUnknown: primaryBirthDetail.is_time_unknown,
        birthCity: primaryBirthDetail.birth_city,
        chartId: primaryBirthDetail.chart_id,
        summary: primaryBirthDetail.chart ? {
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
