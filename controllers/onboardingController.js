import { BirthDetail, BirthChart } from '../models/index.js';
import { vedicAstrologyService } from '../services/vedicAstrologyService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. POST /api/v1/onboarding
 * Submit 2-step onboarding data together:
 * Step 1: name, gender
 * Step 2: dob, tob, isTimeUnknown, location (city, lat, lng, timezone)
 *
 * Saves primary birth details, automatically computes initial natal chart (raw response.horoscope),
 * and updates user.onboarding_completed = true.
 * Performs in-place updates on existing charts and skips recalculation if astronomical inputs haven't changed.
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

  // 1. Check for existing primary BirthDetail and associated BirthChart
  let birthDetail = await BirthDetail.findOne({
    where: {
      user_id: user.id,
      is_primary: true
    },
    include: [{ model: BirthChart, as: 'chart' }]
  });

  let birthChart = birthDetail?.chart || null;
  if (!birthChart && birthDetail?.chart_id) {
    birthChart = await BirthChart.findByPk(birthDetail.chart_id);
  }

  // 2. Change detection: determine if astronomical input parameters changed
  const hasExistingChart = Boolean(birthChart && birthDetail);
  const isBirthParamsChanged = !hasExistingChart ||
    birthDetail.date_of_birth !== birthDate ||
    birthDetail.time_of_birth !== birthTime ||
    Number(birthDetail.latitude) !== Number(lat) ||
    Number(birthDetail.longitude) !== Number(lon) ||
    Number(birthDetail.timezone) !== Number(tz) ||
    birthDetail.gender !== normalizedGender ||
    Boolean(birthDetail.is_time_unknown) !== Boolean(isTimeUnknown);

  let horoscopeData;
  let rasi;
  let moonNakshatra;

  // 3. Only call external Vedic calculation engine if birth parameters changed or first time
  if (isBirthParamsChanged) {
    horoscopeData = await vedicAstrologyService.getHoroscope({
      date: birthDate,
      time: birthTime,
      place: birthCity,
      latitude: lat,
      longitude: lon,
      timezone: tz,
      gender: normalizedGender === 'female' ? 'female' : 'male'
    });

    rasi = horoscopeData?.divisional_charts?.['D-1_rasi'] || {};
    moonNakshatra = horoscopeData?.nakshatra_pada?.Moon || {};
  }

  // 4. Update existing BirthChart in-place OR create first chart
  if (birthChart) {
    const chartUpdates = {
      person_name: fullName,
      birth_city: birthCity || 'Unknown City'
    };

    if (isBirthParamsChanged) {
      chartUpdates.gender = normalizedGender;
      chartUpdates.date_of_birth = birthDate;
      chartUpdates.time_of_birth = birthTime;
      chartUpdates.is_time_unknown = isTimeUnknown;
      chartUpdates.latitude = lat;
      chartUpdates.longitude = lon;
      chartUpdates.timezone = tz;
      chartUpdates.ascendant_sign = rasi.Ascendant?.sign || null;
      chartUpdates.moon_sign = rasi.Moon?.sign || null;
      chartUpdates.sun_sign = rasi.Sun?.sign || null;
      chartUpdates.nakshatra = moonNakshatra.nakshatra || null;
      chartUpdates.nakshatra_pada = moonNakshatra.pada || null;
      chartUpdates.chart_data = horoscopeData;
    }

    await birthChart.update(chartUpdates);
  } else {
    birthChart = await BirthChart.create({
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
      ascendant_sign: rasi.Ascendant?.sign || null,
      moon_sign: rasi.Moon?.sign || null,
      sun_sign: rasi.Sun?.sign || null,
      nakshatra: moonNakshatra.nakshatra || null,
      nakshatra_pada: moonNakshatra.pada || null,
      chart_data: horoscopeData
    });
  }

  // 5. Update existing primary BirthDetail OR create first detail
  if (birthDetail) {
    await birthDetail.update({
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

  // 6. Update user onboarding_completed state
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
        onboardingCompleted: true,
        creditBalance: user.credit_balance
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
      chartSummary: {
        ascendantSign: birthChart.ascendant_sign,
        moonSign: birthChart.moon_sign,
        sunSign: birthChart.sun_sign,
        nakshatra: birthChart.nakshatra,
        pada: birthChart.nakshatra_pada
      }
    }
  });
});

/**
 * 2. GET /api/v1/onboarding/status
 * Check current user onboarding state and primary profile
 */
export const getOnboardingStatus = asyncHandler(async (req, res) => {
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
