import { BirthChart } from '../models/index.js';
import { vedicAstrologyService } from '../services/vedicAstrologyService.js';
import { AppError } from '../utils/appError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Normalizes input for single-native calculation requests.
 */
const extractBirthParams = (body = {}) => {
  return {
    date: body.dob || body.date,
    time: body.tob || body.time || '12:00:00',
    latitude: body.latitude ?? body.lat ?? body.location?.lat,
    longitude: body.longitude ?? body.lng ?? body.lon ?? body.location?.lng ?? body.location?.lon,
    timezone: body.timezone ?? body.tz ?? body.location?.timezoneOffset ?? body.location?.timezone,
    place: body.place || body.city || body.location?.city || '',
    gender: body.gender || 'male'
  };
};

/**
 * 1. POST /api/v1/vedic/horoscope
 * Full Kundli calculation, saves raw response.horoscope in BirthChart and returns it.
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
  const tz = location?.timezoneOffset ?? location?.timezone ?? timezone;

  if (!birthDate || !birthTime) {
    return next(new AppError('Birth date (YYYY-MM-DD) and birth time (HH:MM) are required.', 400));
  }
  if (lat === undefined || lon === undefined || tz === undefined) {
    return next(new AppError('Location coordinates (latitude, longitude) and timezone offset are required.', 400));
  }

  const horoscope = await vedicAstrologyService.getHoroscope({
    date: birthDate,
    time: birthTime,
    place: birthCity,
    latitude: lat,
    longitude: lon,
    timezone: tz,
    gender: gender.toLowerCase() === 'female' ? 'female' : 'male'
  }, dashaScope);

  const rasi = horoscope?.divisional_charts?.['D-1_rasi'] || {};
  const moonNakshatra = horoscope?.nakshatra_pada?.Moon || {};

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
    ascendant_sign: rasi.Ascendant?.sign || null,
    moon_sign: rasi.Moon?.sign || null,
    sun_sign: rasi.Sun?.sign || null,
    nakshatra: moonNakshatra.nakshatra || null,
    nakshatra_pada: moonNakshatra.pada || null,
    chart_data: horoscope
  });

  res.status(200).json({
    success: true,
    message: 'Birth chart calculated successfully.',
    data: {
      chartId: birthChart.id,
      horoscope
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
      gender: chart.gender,
      dob: chart.date_of_birth,
      tob: chart.time_of_birth,
      city: chart.birth_city,
      latitude: chart.latitude,
      longitude: chart.longitude,
      timezone: chart.timezone,
      summary: {
        ascendantSign: chart.ascendant_sign,
        moonSign: chart.moon_sign,
        sunSign: chart.sun_sign,
        nakshatra: chart.nakshatra,
        pada: chart.nakshatra_pada
      },
      horoscope: chart.chart_data
    }
  });
});

/**
 * 4. POST /api/v1/vedic/marriage-match
 * Marriage compatibility (Ashtakoota + 10 Porutham).
 */
export const calculateMarriageMatch = asyncHandler(async (req, res, next) => {
  const { boy, girl } = req.body;

  if (!boy || !girl) {
    return next(new AppError('Both boy and girl birth details are required for marriage match.', 400));
  }

  const boyParams = extractBirthParams({ ...boy, gender: 'male' });
  const girlParams = extractBirthParams({ ...girl, gender: 'female' });

  const result = await vedicAstrologyService.calculateMarriageMatch(boyParams, girlParams);

  res.status(200).json({
    success: true,
    message: 'Marriage compatibility calculated successfully.',
    data: result
  });
});

/**
 * 5. POST /api/v1/vedic/saturn-timeline (and /sade-sati)
 * Shani Sade Sati and Saturn transits.
 */
export const calculateSaturnTimeline = asyncHandler(async (req, res) => {
  const birthParams = extractBirthParams(req.body);
  const result = await vedicAstrologyService.getSaturnTimeline(birthParams);

  res.status(200).json({
    success: true,
    message: 'Saturn timeline calculated successfully.',
    data: result
  });
});

/**
 * 6. POST /api/v1/vedic/surya-siddhanta
 * Traditional Makaranda Surya Siddhanta calculation.
 */
export const calculateSuryaSiddhanta = asyncHandler(async (req, res) => {
  const birthParams = extractBirthParams(req.body);
  const result = await vedicAstrologyService.getSuryaSiddhantaChart(birthParams);

  res.status(200).json({
    success: true,
    message: 'Surya Siddhanta chart calculated successfully.',
    data: result
  });
});

/**
 * 7. POST /api/v1/vedic/gochara
 * Transits against a birth chart.
 */
export const calculateGochara = asyncHandler(async (req, res) => {
  const birthParams = extractBirthParams(req.body);
  const target_date = req.body.target_date || req.body.transitDate || req.body.targetDate;

  const result = await vedicAstrologyService.getGochara({
    ...req.body,
    ...birthParams,
    target_date
  });

  res.status(200).json({
    success: true,
    message: 'Planetary transits (Gochara) calculated successfully.',
    data: result
  });
});

/**
 * 8. POST /api/v1/vedic/gochara-range
 * Transits day by day across a date range (max 60 days).
 */
export const calculateGocharaRange = asyncHandler(async (req, res) => {
  const birthParams = extractBirthParams(req.body);
  const from_date = req.body.from_date || req.body.fromDate;
  const to_date = req.body.to_date || req.body.toDate;

  const result = await vedicAstrologyService.getGocharaRange({
    ...req.body,
    ...birthParams,
    from_date,
    to_date
  });

  res.status(200).json({
    success: true,
    message: 'Gochara range calculated successfully.',
    data: result
  });
});

/**
 * 9. POST /api/v1/vedic/gochar
 * Today's planetary positions (no birth chart required).
 */
export const calculateGochar = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getGochar({
    date: req.body.date || new Date().toISOString().split('T')[0],
    latitude: req.body.latitude ?? req.body.lat,
    longitude: req.body.longitude ?? req.body.lng ?? req.body.lon,
    timezone: req.body.timezone ?? req.body.tz,
    place: req.body.place || req.body.city || '',
    ayanamsa_mode: req.body.ayanamsa_mode || req.body.ayanamsa
  });

  res.status(200).json({
    success: true,
    message: 'Daily Gochar positions retrieved successfully.',
    data: result
  });
});

/**
 * 10. POST /api/v1/vedic/gochar-events
 * Upcoming transit events over a date range (no birth chart required).
 */
export const calculateGocharEvents = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getGocharEvents({
    from_date: req.body.from_date || req.body.fromDate,
    to_date: req.body.to_date || req.body.toDate,
    latitude: req.body.latitude ?? req.body.lat,
    longitude: req.body.longitude ?? req.body.lng ?? req.body.lon,
    timezone: req.body.timezone ?? req.body.tz,
    place: req.body.place || req.body.city || '',
    planets: req.body.planets,
    ayanamsa_mode: req.body.ayanamsa_mode || req.body.ayanamsa
  });

  res.status(200).json({
    success: true,
    message: 'Upcoming Gochar transit events retrieved successfully.',
    data: result
  });
});

/**
 * 11. POST /api/v1/vedic/planet-ingress
 * Planet sign-change timing events.
 */
export const calculatePlanetIngress = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getPlanetIngress({
    from_date: req.body.from_date || req.body.fromDate,
    to_date: req.body.to_date || req.body.toDate,
    planets: req.body.planets,
    timezone: req.body.timezone ?? req.body.tz,
    ayanamsa_mode: req.body.ayanamsa_mode || req.body.ayanamsa
  });

  res.status(200).json({
    success: true,
    message: 'Planet ingress events retrieved successfully.',
    data: result
  });
});

/**
 * 12. POST /api/v1/vedic/panchang
 * Daily 5 Limbs of Time.
 */
export const calculatePanchang = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getPanchang({
    date: req.body.date || new Date().toISOString().split('T')[0],
    latitude: req.body.latitude ?? req.body.lat,
    longitude: req.body.longitude ?? req.body.lng ?? req.body.lon,
    timezone: req.body.timezone ?? req.body.tz,
    place: req.body.place || req.body.city || '',
    ayanamsa_mode: req.body.ayanamsa_mode || req.body.ayanamsa
  });

  res.status(200).json({
    success: true,
    message: 'Daily Panchang retrieved successfully.',
    data: result
  });
});

/**
 * 13. POST /api/v1/vedic/muhurta
 * Auspicious electional timing windows.
 */
export const calculateMuhurta = asyncHandler(async (req, res) => {
  const birthParams = extractBirthParams(req.body);
  const event_type = req.body.event_type || req.body.eventType;
  const from_date = req.body.from_date || req.body.fromDate;
  const to_date = req.body.to_date || req.body.toDate;

  const result = await vedicAstrologyService.getMuhurta({
    ...req.body,
    ...birthParams,
    event_type,
    from_date,
    to_date
  });

  res.status(200).json({
    success: true,
    message: 'Auspicious Muhurta windows calculated successfully.',
    data: result
  });
});

/**
 * 14. GET /api/v1/vedic/muhurta/events
 * Valid event types accepted by /muhurta.
 */
export const getMuhurtaEvents = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getMuhurtaEvents();

  res.status(200).json({
    success: true,
    message: 'Muhurta event types retrieved successfully.',
    data: result
  });
});

/**
 * 15. GET /api/v1/vedic/location/search
 * Coordinates and UTC offset for a place name.
 */
export const searchLocation = asyncHandler(async (req, res) => {
  const query = req.query.query || req.query.q;
  const result = await vedicAstrologyService.searchLocation(query);

  res.status(200).json({
    success: true,
    message: 'Location coordinates retrieved successfully.',
    data: result
  });
});

/**
 * 16. GET /api/v1/vedic/location/autocomplete
 * Place suggestions as you type (162K+ cities).
 */
export const autocompleteLocation = asyncHandler(async (req, res) => {
  const query = req.query.query || req.query.q;
  const limit = Number(req.query.limit) || 10;

  if (!query) {
    return res.status(200).json({ success: true, count: 0, results: [] });
  }

  const response = await vedicAstrologyService.autocompleteLocation(query, limit);
  const results = response.results || response;

  res.status(200).json({
    success: true,
    count: Array.isArray(results) ? results.length : (response.count || 0),
    results
  });
});

/**
 * 17. GET /api/v1/vedic/divisional-charts
 * Static metadata directory of all 23 divisional vargas (D-1 to D-144).
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
 * 18. GET /api/v1/vedic/health
 * Vedic engine health check.
 */
export const getEngineHealth = asyncHandler(async (req, res) => {
  const result = await vedicAstrologyService.getHealth();

  res.status(200).json({
    success: true,
    data: result
  });
});
