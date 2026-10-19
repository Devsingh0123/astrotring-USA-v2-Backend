import { AppError } from '../utils/appError.js';
import { vedicCache } from '../utils/cache.js';

const BASE_URL = process.env.VEDIC_ENGINE_BASE_URL || 'https://jagannatha-hora-359167915530.europe-west1.run.app';

/**
 * Normalizes birth detail parameters into the canonical shape expected by Jagannatha Hora engine.
 */
export const normalizeBirthDetails = (params) => {
  const {
    date,
    time,
    place = '',
    latitude,
    longitude,
    timezone,
    gender = 'male',
    ayanamsa_mode = 'LAHIRI',
    calculation_type = 'drik'
  } = params;

  if (!date || !time) {
    throw new AppError('Birth date (YYYY-MM-DD) and time (HH:MM:SS) are required.', 400);
  }
  if (latitude === undefined || longitude === undefined || timezone === undefined) {
    throw new AppError('Latitude, longitude, and timezone offset are required.', 400);
  }

  // Ensure 24h format HH:MM:SS
  const normalizedTime = time.length === 5 ? `${time}:00` : time;

  return {
    date: date.trim(),
    time: normalizedTime.trim(),
    place: (place || 'Birth Location').trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    timezone: Number(timezone),
    gender: gender.toLowerCase() === 'female' ? 'female' : 'male',
    ayanamsa_mode,
    calculation_type
  };
};

/**
 * Internal HTTP POST caller with timeout and structured error parsing.
 */
const postToEngine = async (endpoint, payload, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      let errDetail = 'Vedic calculation engine error';
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
      } catch (e) {
        errDetail = await response.text();
      }
      throw new AppError(`Vedic Engine Error (${response.status}): ${errDetail}`, response.status >= 500 ? 502 : 400);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new AppError('Vedic calculation engine request timed out.', 504);
    }
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to connect to Vedic engine: ${error.message}`, 502);
  }
};

/**
 * Internal HTTP GET caller with timeout.
 */
const getFromEngine = async (endpoint, queryParams = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        url.searchParams.append(k, v);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new AppError(`Location lookup error: ${response.statusText}`, response.status >= 500 ? 502 : 400);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') throw new AppError('Location service timed out.', 504);
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to connect to location engine: ${error.message}`, 502);
  }
};

/**
 * Production Service: Vedic Astrology Engine
 */
export const vedicAstrologyService = {
  /**
   * 1. Get Complete Horoscope (Kundli, Vargas, Yogas, Doshas, Dashas)
   * Caches results deterministically for 24h in Redis.
   */
  async getHoroscope(rawParams, dashaScope = 'vimsottari') {
    const birthDetails = normalizeBirthDetails(rawParams);
    const cacheKey = vedicCache.generateKey(`horoscope:${dashaScope}`, birthDetails);

    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const endpoint = `/horoscope?dasha_scope=${dashaScope}`;
    const response = await postToEngine(endpoint, birthDetails);

    // Transform and standardize the result for AstroTring client consumption
    const result = {
      birthDetails: response.birth_details,
      calendarInfo: response.horoscope?.calendar_info || {},
      summary: {
        ascendantSign: response.horoscope?.divisional_charts?.['D-1_rasi']?.Ascendant?.sign,
        ascendantDegree: response.horoscope?.divisional_charts?.['D-1_rasi']?.Ascendant?.longitude,
        moonSign: response.horoscope?.divisional_charts?.['D-1_rasi']?.Moon?.sign,
        moonDegree: response.horoscope?.divisional_charts?.['D-1_rasi']?.Moon?.longitude,
        sunSign: response.horoscope?.divisional_charts?.['D-1_rasi']?.Sun?.sign,
        nakshatra: response.horoscope?.nakshatra_pada?.Moon?.nakshatra,
        pada: response.horoscope?.nakshatra_pada?.Moon?.pada,
        nakshatraLord: response.horoscope?.nakshatra_pada?.Moon?.nakshatra_lord
      },
      rasiChart: response.horoscope?.divisional_charts?.['D-1_rasi'] || {},
      navamsaChart: response.horoscope?.divisional_charts?.['D-9_navamsa'] || {},
      dasamsaChart: response.horoscope?.divisional_charts?.['D-10_dasamsa'] || {},
      allDivisionalCharts: response.horoscope?.divisional_charts || {},
      dashas: response.horoscope?.graha_dashas || {},
      yogas: response.horoscope?.yogas || {},
      doshas: response.horoscope?.doshas || {},
      charaKarakas: response.horoscope?.chara_karakas || {},
      ashtakavarga: response.horoscope?.ashtakavarga || {},
      shadbala: response.horoscope?.shad_bala || {},
      bhavabala: response.horoscope?.bhava_bala || {},
      saturnTransits: response.horoscope?.saturn_transits || {},
      raw: response.horoscope
    };

    await vedicCache.set(cacheKey, result);
    return result;
  },

  /**
   * 2. Calculate 36-Point Marriage Compatibility (Kundli Milan / Ashtakoota)
   */
  async calculateMarriageMatch(boyParams, girlParams) {
    const boyBirth = normalizeBirthDetails(boyParams);
    const girlBirth = normalizeBirthDetails(girlParams);

    const cacheKey = vedicCache.generateKey('match', { boyBirth, girlBirth });
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const payload = {
      boy_birth_details: boyBirth,
      girl_birth_details: girlBirth
    };

    const response = await postToEngine('/marriage-match', payload);

    const northIndian = response.north_indian || {};
    const overall = northIndian.overall_compatibility || {};

    const result = {
      boy: {
        name: boyParams.name || 'Groom',
        sign: response.boy?.rasi,
        nakshatra: response.boy?.nakshatra,
        pada: response.boy?.pada
      },
      girl: {
        name: girlParams.name || 'Bride',
        sign: response.girl?.rasi,
        nakshatra: response.girl?.nakshatra,
        pada: response.girl?.pada
      },
      ashtakoota: {
        totalScore: overall.total_score,
        maxScore: overall.max_possible_score || 36,
        percentage: overall.percentage,
        verdict: overall.rating,
        kootas: northIndian.eight_koota_porutham || {}
      },
      additionalFactors: northIndian.four_additional_porutham || {},
      mangalDosha: {
        boy: response.boy_dosha_data || {},
        girl: response.girl_dosha_data || {}
      },
      southIndianPorutham: response.south_indian || {},
      raw: response
    };

    await vedicCache.set(cacheKey, result);
    return result;
  },

  /**
   * 3. Panchang (5 Limbs of Time, Tithi, Nakshatra, Yoga, Karana, Choghadiya)
   */
  async getPanchang(date, latitude, longitude, timezone, place = '') {
    if (!date || latitude === undefined || longitude === undefined || timezone === undefined) {
      throw new AppError('Date (YYYY-MM-DD), latitude, longitude, and timezone are required for Panchang.', 400);
    }

    const payload = {
      date: date.trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: Number(timezone),
      place: place.trim(),
      ayanamsa_mode: 'LAHIRI'
    };

    const cacheKey = vedicCache.generateKey('panchang', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    // Cache for 6 hours (panchang is daily)
    const response = await postToEngine('/panchang', payload);
    const result = response.panchang || response;
    await vedicCache.set(cacheKey, result, 60 * 60 * 6);
    return result;
  },

  /**
   * 4. Saturn Transit & Shani Sade Sati Timeline
   */
  async getSaturnTimeline(rawParams) {
    const birthDetails = normalizeBirthDetails(rawParams);
    const cacheKey = vedicCache.generateKey('saturn_timeline', birthDetails);

    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/saturn-timeline', birthDetails);
    await vedicCache.set(cacheKey, response);
    return response;
  },

  /**
   * 5. Gochara (Current Planetary Transits relative to natal Moon/Ascendant)
   */
  async getGochara(rawParams, targetDate = null) {
    const birthDetails = normalizeBirthDetails(rawParams);
    const payload = {
      ...birthDetails,
      target_date: targetDate || new Date().toISOString().split('T')[0]
    };

    const cacheKey = vedicCache.generateKey('gochara', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    // Cache transits for 1 hour
    const response = await postToEngine('/gochara', payload);
    await vedicCache.set(cacheKey, response, 60 * 60);
    return response;
  },

  /**
   * 6. Gochara Date Range (For annual/monthly horoscope forecasting)
   */
  async getGocharaRange(rawParams, fromDate, toDate) {
    const birthDetails = normalizeBirthDetails(rawParams);
    if (!fromDate || !toDate) {
      throw new AppError('fromDate and toDate (YYYY-MM-DD) are required for gochara range.', 400);
    }

    const payload = {
      ...birthDetails,
      from_date: fromDate,
      to_date: toDate
    };

    const cacheKey = vedicCache.generateKey('gochara_range', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/gochara/range', payload);
    await vedicCache.set(cacheKey, response, 60 * 60 * 12);
    return response;
  },

  /**
   * 7. Muhurta (Find auspicious electional timing windows)
   */
  async getMuhurta(rawParams, eventType, fromDate, toDate) {
    const birthDetails = normalizeBirthDetails(rawParams);
    if (!eventType || !fromDate || !toDate) {
      throw new AppError('eventType, fromDate, and toDate are required for Muhurta search.', 400);
    }

    const payload = {
      ...birthDetails,
      event_type: eventType,
      from_date: fromDate,
      to_date: toDate
    };

    const cacheKey = vedicCache.generateKey('muhurta', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/muhurta', payload);
    await vedicCache.set(cacheKey, response, 60 * 60 * 6);
    return response;
  },

  /**
   * 8. Location Autocomplete & Search (162K+ World Cities Index)
   */
  async searchLocation(query, limit = 10) {
    if (!query || typeof query !== 'string') {
      throw new AppError('Location query string is required.', 400);
    }
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return [];

    const cacheKey = `astrotring:loc_search:${cleanQuery}:${limit}`;
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await getFromEngine('/location/autocomplete', { query: cleanQuery, limit });
    const results = response.results || [];
    await vedicCache.set(cacheKey, results, 60 * 60 * 24); // 24h cache for city locations
    return results;
  },

  /**
   * 9. Planet Ingress (Sign-change timing across a date range)
   */
  async getPlanetIngress(fromDate, toDate, planets = ['Saturn', 'Jupiter', 'Rahu', 'Ketu'], timezone = 5.5, ayanamsa = 'LAHIRI') {
    if (!fromDate || !toDate) {
      throw new AppError('fromDate and toDate (YYYY-MM-DD) are required for planet ingress.', 400);
    }

    const payload = {
      from_date: fromDate,
      to_date: toDate,
      planets,
      timezone: Number(timezone),
      ayanamsa_mode: ayanamsa
    };

    const cacheKey = vedicCache.generateKey('planet_ingress', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/planet-ingress', payload);
    const result = response.planet_ingress || response;
    await vedicCache.set(cacheKey, result, 60 * 60 * 24); // 24h cache
    return result;
  },

  /**
   * 10. Surya Siddhanta Chart (Traditional Makaranda sidereal positions)
   */
  async getSuryaSiddhantaChart(rawParams) {
    const birthDetails = normalizeBirthDetails(rawParams);
    const payload = {
      date: birthDetails.date,
      time: birthDetails.time,
      latitude: birthDetails.latitude,
      longitude: birthDetails.longitude,
      timezone: birthDetails.timezone,
      place: birthDetails.place,
      elevation: 0,
      timezone_mode: 'auto',
      ayanamsa_mode: 'LAHIRI'
    };

    const cacheKey = vedicCache.generateKey('surya_siddhanta', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/surya-siddhanta', payload);
    const result = response.surya_siddhanta || response;
    await vedicCache.set(cacheKey, result);
    return result;
  },

  /**
   * 11. List All Supported Divisional (Varga) Charts
   */
  listDivisionalCharts() {
    return [
      { request_as: 'D-1', name: 'Rasi', purpose: 'the main birth chart — body, overall life, general analysis' },
      { request_as: 'D-2', name: 'Hora', purpose: 'wealth, money, family resources' },
      { request_as: 'D-3', name: 'Drekkana', purpose: 'siblings, courage, drive, energy' },
      { request_as: 'D-4', name: 'Chaturthamsa', purpose: 'home, fixed property, land, fortune' },
      { request_as: 'D-5', name: 'Panchamsa', purpose: 'fame, authority, power, spiritual merit' },
      { request_as: 'D-6', name: 'Shashthamsa', purpose: 'health, disease, debts, enemies' },
      { request_as: 'D-7', name: 'Saptamsa', purpose: 'children, progeny' },
      { request_as: 'D-8', name: 'Ashtamsa', purpose: 'longevity, sudden events, obstacles' },
      { request_as: 'D-9', name: 'Navamsa', purpose: 'marriage, spouse, dharma, and overall planetary strength' },
      { request_as: 'D-10', name: 'Dasamsa', purpose: 'career, profession, status, achievements' },
      { request_as: 'D-11', name: 'Rudramsa', purpose: 'gains, and death/destruction matters' },
      { request_as: 'D-12', name: 'Dwadasamsa', purpose: 'parents, ancestry, lineage' },
      { request_as: 'D-16', name: 'Shodasamsa', purpose: 'vehicles, luxuries, comforts, inner happiness' },
      { request_as: 'D-20', name: 'Vimsamsa', purpose: 'spiritual practice, worship, religious life' },
      { request_as: 'D-24', name: 'Chaturvimsamsa (Siddhamsa)', purpose: 'education, learning, knowledge' },
      { request_as: 'D-27', name: 'Nakshatramsa (Bhamsa)', purpose: 'general strengths and weaknesses, vitality' },
      { request_as: 'D-30', name: 'Trimsamsa', purpose: 'misfortunes, evils, character, troubles' },
      { request_as: 'D-40', name: 'Khavedamsa', purpose: 'auspicious/inauspicious effects, maternal legacy' },
      { request_as: 'D-45', name: 'Akshavedamsa', purpose: 'overall character, conduct, paternal legacy' },
      { request_as: 'D-60', name: 'Shastiamsa', purpose: 'past-life karma, fine-tuning of all life matters' },
      { request_as: 'D-81', name: 'Nava Navamsa', purpose: 'finer detail of marriage/dharma (sub-navamsa)' },
      { request_as: 'D-108', name: 'Ashtottaramsa', purpose: 'fine detail, often spiritual / cumulative' },
      { request_as: 'D-144', name: 'Dwadas-dwadasamsa', purpose: 'finest detail of lineage / ancestry' }
    ];
  }
};

