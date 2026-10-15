import { BirthChart } from '../models/index.js';
import { vedicAstrologyService } from '../services/vedicAstrologyService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Normalizes input for single-native calculation requests.
 */
const extractBirthParams = (body) => {
  return {
    date: body.dob || body.date,
    time: body.tob || body.time || '12:00:00',
    latitude: body.latitude ?? body.lat,
    longitude: body.longitude ?? body.lng ?? body.lon,
    timezone: body.timezone ?? body.tz,
    place: body.place || body.city || '',
    gender: body.gender || 'male'
  };
};

/**
 * 1. POST /api/v1/vedic/horoscope
 * Full Kundli calculation, saves chart record and returns formatted chart data.
 */
export const calculateHoroscope = asyncHandler(async (req, res, next) => {
  const {
    name,
    gender = 'male',
    dob,
    tob,
    isTimeUnknown = false,
    location,
    date,
    time,
    place,
    latitude,
    longitude,
    timezone,
    dashaScope = 'vimsottari'
  } = req.body;

  const birthDate = dob || date;
  const birthTime = tob || time || (isTimeUnknown ? '12:00:00' : null);
  const birthCity = location?.city || place || 'Unknown Location';
  const lat = location?.lat ?? latitude;
  const lon = location?.lng ?? location?.lon ?? longitude;
  const tz = location?.timezoneOffset ?? timezone;

  if (!birthDate || !birthTime) {
    return next(new AppError('Birth date (YYYY-MM-DD) and birth time (HH:MM) are required.', 400));
  }
  if (lat === undefined || lon === undefined || tz === undefined) {
    return next(new AppError('Location coordinates (latitude, longitude) and timezone offset are required.', 400));
  }

  const calculationResult = await vedicAstrologyService.getHoroscope({
    date: birthDate,
    time: birthTime,
    place: birthCity,
    latitude: lat,
    longitude: lon,
    timezone: tz,
    gender
  }, dashaScope);

  const birthChart = await BirthChart.create({
    user_id: req.user ? req.user.id : null,
    person_name: name || 'Anonymous',
    gender,
    date_of_birth: birthDate,
    time_of_birth: birthTime,
    is_time_unknown: isTimeUnknown,
    birth_city: birthCity,
    latitude: lat,
    longitude: lon,
    timezone: tz,
    ascendant_sign: calculationResult.summary?.ascendantSign,
    moon_sign: calculationResult.summary?.moonSign,
    sun_sign: calculationResult.summary?.sunSign,
    nakshatra: calculationResult.summary?.nakshatra,
    nakshatra_pada: calculationResult.summary?.pada,
    chart_data: calculationResult
  });

  res.status(200).json({
    success: true,
    message: 'Birth chart calculated successfully.',
    data: {
      chartId: birthChart.id,
      summary: calculationResult.summary,
      calendarInfo: calculationResult.calendarInfo,
      rasiChart: calculationResult.rasiChart,
      navamsaChart: calculationResult.navamsaChart,
      dasamsaChart: calculationResult.dasamsaChart,
      dashas: calculationResult.dashas,
      yogas: calculationResult.yogas,
      doshas: calculationResult.doshas,
      ashtakavarga: calculationResult.ashtakavarga,
      shadbala: calculationResult.shadbala,
      bhavabala: calculationResult.bhavabala,
      charaKarakas: calculationResult.charaKarakas
    }
  });
});

/**
 * 2. POST /api/v1/vedic/bind
 * Binds an existing chart to the authenticated user account.
 */
export const bindChart = asyncHandler(async (req, res, next) => {
  const { chartId } = req.body;

  if (!chartId) {
    return next(new AppError('chartId is required to bind a chart.', 400));
  }

  const chart = await BirthChart.findByPk(chartId);
  if (!chart) {
    return next(new AppError('Birth chart not found.', 404));
  }

  chart.user_id = req.user.id;
  await chart.save();

  res.status(200).json({
    success: true,
    message: 'Chart bound to account successfully.',
    data: {
      chartId: chart.id,
      userId: req.user.id
    }
  });
});

/**
 * 3. GET /api/v1/vedic/chart/:chartId
 * Fetches saved birth chart details by ID.
 */
export const getChartById = asyncHandler(async (req, res, next) => {
  const { chartId } = req.params;

  const chart = await BirthChart.findByPk(chartId);
  if (!chart) {
    return next(new AppError('Birth chart not found.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Birth chart retrieved successfully.',
    data: {
      id: chart.id,
      name: chart.person_name,
      dob: chart.date_of_birth,
      tob: chart.time_of_birth,
      city: chart.birth_city,
      summary: {
        ascendantSign: chart.ascendant_sign,
        moonSign: chart.moon_sign,
        sunSign: chart.sun_sign,
        nakshatra: chart.nakshatra,
        pada: chart.nakshatra_pada
      },
      chartData: chart.chart_data
    }
  });
});

/**
 * 4. POST /api/v1/vedic/marriage-match
 * 36-Point Ashta Koota Guna Milan, Manglik Dosha, and 10 Poruthams.
 */
export const calculateMarriageMatch = asyncHandler(async (req, res, next) => {
  const { boy, girl } = req.body;

  if (!boy || !girl) {
    return next(new AppError('Both boy and girl birth details are required for marriage match.', 400));
  }

  const boyParams = {
    date: boy.dob || boy.date,
    time: boy.tob || boy.time || '12:00:00',
    latitude: boy.latitude ?? boy.lat,
    longitude: boy.longitude ?? boy.lng ?? boy.lon,
    timezone: boy.timezone ?? boy.tz,
    place: boy.place || boy.city || 'Boy City',
    gender: 'male',
    name: boy.name || 'Groom'
  };

  const girlParams = {
    date: girl.dob || girl.date,
    time: girl.tob || girl.time || '12:00:00',
    latitude: girl.latitude ?? girl.lat,
    longitude: girl.longitude ?? girl.lng ?? girl.lon,
    timezone: girl.timezone ?? girl.tz,
    place: girl.place || girl.city || 'Girl City',
    gender: 'female',
    name: girl.name || 'Bride'
  };

  const result = await vedicAstrologyService.calculateMarriageMatch(boyParams, girlParams);

  res.status(200).json({
    success: true,
    message: 'Marriage compatibility calculated successfully.',
    data: result
  });
});

/**
 * 5. POST /api/v1/vedic/sade-sati
 * Shani Sade Sati and Saturn transits.
 */
export const calculateSadeSati = asyncHandler(async (req, res, next) => {
  const birthParams = extractBirthParams(req.body);
  const result = await vedicAstrologyService.getSaturnTimeline(birthParams);

  res.status(200).json({
    success: true,
    message: 'Shani Sade Sati timeline calculated successfully.',
    data: result
  });
});

/**
 * 6. POST /api/v1/vedic/mangal-dosha
 * Manglik Dosha evaluation.
 */
export const calculateMangalDosha = asyncHandler(async (req, res, next) => {
  const birthParams = extractBirthParams(req.body);
  const chart = await vedicAstrologyService.getHoroscope(birthParams);

  res.status(200).json({
    success: true,
    message: 'Mangal Dosha evaluated successfully.',
    data: {
      summary: chart.summary,
      doshas: chart.doshas
    }
  });
});

/**
 * 7. POST /api/v1/vedic/panchang
 * Daily 5 Limbs of Time.
 */
export const calculatePanchang = asyncHandler(async (req, res, next) => {
  const { date, latitude, longitude, timezone, city, place } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const result = await vedicAstrologyService.getPanchang(
    targetDate,
    latitude ?? req.body.lat,
    longitude ?? req.body.lng ?? req.body.lon,
    timezone ?? req.body.tz,
    city || place || ''
  );

  res.status(200).json({
    success: true,
    message: 'Daily Panchang retrieved successfully.',
    data: result
  });
});

/**
 * 8. POST /api/v1/vedic/muhurta
 * Auspicious electional timing windows.
 */
export const calculateMuhurta = asyncHandler(async (req, res, next) => {
  const { eventType, fromDate, toDate } = req.body;
  const birthParams = extractBirthParams(req.body);

  if (!eventType || !fromDate || !toDate) {
    return next(new AppError('eventType, fromDate, and toDate are required for Muhurta search.', 400));
  }

  const result = await vedicAstrologyService.getMuhurta(
    birthParams,
    eventType,
    fromDate,
    toDate
  );

  res.status(200).json({
    success: true,
    message: 'Auspicious Muhurta windows calculated successfully.',
    data: result
  });
});

/**
 * 9. POST /api/v1/vedic/gochara
 * Current transits relative to natal Moon or Ascendant.
 */
export const calculateGochara = asyncHandler(async (req, res, next) => {
  const birthParams = extractBirthParams(req.body);
  const { transitDate } = req.body;

  const result = await vedicAstrologyService.getGochara(birthParams, transitDate);

  res.status(200).json({
    success: true,
    message: 'Planetary transits (Gochara) calculated successfully.',
    data: result
  });
});

/**
 * 10. POST /api/v1/vedic/gochara-range
 * Transits across a date range.
 */
export const calculateGocharaRange = asyncHandler(async (req, res, next) => {
  const birthParams = extractBirthParams(req.body);
  const { fromDate, toDate } = req.body;

  if (!fromDate || !toDate) {
    return next(new AppError('fromDate and toDate are required.', 400));
  }

  const result = await vedicAstrologyService.getGocharaRange(birthParams, fromDate, toDate);

  res.status(200).json({
    success: true,
    message: 'Gochara range calculated successfully.',
    data: result
  });
});

/**
 * 11. POST /api/v1/vedic/planet-ingress
 * Ingress sign-change timing events.
 */
export const calculatePlanetIngress = asyncHandler(async (req, res, next) => {
  const { fromDate, toDate, planets, timezone, ayanamsa } = req.body;

  if (!fromDate || !toDate) {
    return next(new AppError('fromDate and toDate are required for planet ingress.', 400));
  }

  const result = await vedicAstrologyService.getPlanetIngress(fromDate, toDate, planets, timezone, ayanamsa);

  res.status(200).json({
    success: true,
    message: 'Planet ingress events retrieved successfully.',
    data: result
  });
});

/**
 * 12. POST /api/v1/vedic/surya-siddhanta
 * Traditional Makaranda Surya Siddhanta calculation.
 */
export const calculateSuryaSiddhanta = asyncHandler(async (req, res, next) => {
  const birthParams = extractBirthParams(req.body);
  const result = await vedicAstrologyService.getSuryaSiddhantaChart(birthParams);

  res.status(200).json({
    success: true,
    message: 'Surya Siddhanta chart calculated successfully.',
    data: result
  });
});

/**
 * 13. GET /api/v1/vedic/divisional-charts
 * Metadata directory of 23 divisional vargas.
 */
export const listDivisionalCharts = asyncHandler(async (req, res) => {
  const charts = vedicAstrologyService.listDivisionalCharts();
  res.status(200).json({
    success: true,
    count: charts.length,
    data: charts
  });
});

/**
 * 14. GET /api/v1/vedic/location/autocomplete
 * World cities autocomplete (162K+ database).
 */
export const autocompleteLocation = asyncHandler(async (req, res) => {
  const query = req.query.query || req.query.q;
  const limit = Number(req.query.limit) || 10;

  if (!query) {
    return res.status(200).json({ success: true, count: 0, results: [] });
  }

  const results = await vedicAstrologyService.searchLocation(query, limit);

  res.status(200).json({
    success: true,
    count: results.length,
    results
  });
});
