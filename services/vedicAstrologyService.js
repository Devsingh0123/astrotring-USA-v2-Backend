import { AppError } from '../utils/appError.js';
import { vedicCache } from '../utils/cache.js';

const BASE_URL = process.env.VEDIC_ENGINE_BASE_URL || 'https://jagannatha-hora-359167915530.europe-west1.run.app';

const TTL = {
  ONE_MINUTE: 60,
  ONE_HOUR: 60 * 60,
  SIX_HOURS: 60 * 60 * 6,
  TWELVE_HOURS: 60 * 60 * 12,
  ONE_DAY: 60 * 60 * 24,
  SEVEN_DAYS: 60 * 60 * 24 * 7
};

/**
 * Validates and normalizes the 5 MCP-required birth fields + optional place and gender.
 * Required: date (YYYY-MM-DD), time (HH:MM:SS), latitude, longitude, timezone.
 */
export const normalizeBirthDetails = (params = {}) => {
  const { date, time, latitude, longitude, timezone, place, gender } = params;

  if (
    !date ||
    !time ||
    latitude === undefined ||
    longitude === undefined ||
    timezone === undefined
  ) {
    throw new AppError(
      'date (YYYY-MM-DD), time (HH:MM:SS), latitude, longitude, and timezone are required.',
      400
    );
  }

  const trimmedTime = String(time).trim();
  const normalizedTime = trimmedTime.length === 5 ? `${trimmedTime}:00` : trimmedTime;

  const payload = {
    date: String(date).trim(),
    time: normalizedTime,
    place: place ? String(place).trim() : '',
    latitude: Number(latitude),
    longitude: Number(longitude),
    timezone: Number(timezone)
  };

  if (gender === 'male' || gender === 'female') {
    payload.gender = gender;
  }

  return payload;
};

/**
 * Copies defined optional fields from `source` into `target`.
 */
const pickOptionalFields = (source, target, keys) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      target[key] = source[key];
    }
  }
  return target;
};

/**
 * Internal HTTP POST caller with timeout and structured error handling.
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
      } catch {
        errDetail = await response.text();
      }
      throw new AppError(
        `Vedic Engine Error (${response.status}): ${errDetail}`,
        response.status >= 500 ? 502 : 400
      );
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
 * Internal HTTP GET caller with timeout and query parameters.
 */
const getFromEngine = async (endpoint, queryParams = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(`${BASE_URL}${endpoint}`);
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new AppError(
        `Vedic Engine GET Error (${response.status}): ${response.statusText}`,
        response.status >= 500 ? 502 : 400
      );
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      throw new AppError('Vedic calculation engine GET request timed out.', 504);
    }
    if (error instanceof AppError) throw error;
    throw new AppError(`Failed to connect to Vedic engine: ${error.message}`, 502);
  }
};

/**
 * Complete Vedic Astrology Service — All 15 Official `/api-mcp` REST Endpoints + MCP Divisional Charts Index
 */
export const vedicAstrologyService = {
  /**
   * 1. POST /horoscope — Full birth chart
   * Returns exact `response.horoscope` object from the API.
   */
  async getHoroscope(params, dashaScope = 'vimsottari') {
    const birthDetails = normalizeBirthDetails(params);
    const cacheKey = vedicCache.generateKey(`horoscope:${dashaScope}`, birthDetails);

    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine(`/horoscope?dasha_scope=${dashaScope}`, birthDetails);
    const result = response.horoscope;

    await vedicCache.set(cacheKey, result, TTL.ONE_DAY);
    return result;
  },

  /**
   * 2. POST /marriage-match — Marriage compatibility (Ashtakoota + 10 Porutham)
   */
  async calculateMarriageMatch(boyParams, girlParams) {
    const boyBirth = normalizeBirthDetails(boyParams);
    const girlBirth = normalizeBirthDetails(girlParams);

    const payload = {
      boy_birth_details: boyBirth,
      girl_birth_details: girlBirth
    };

    const cacheKey = vedicCache.generateKey('marriage_match', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/marriage-match', payload);

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 3. POST /saturn-timeline — Sade Sati and Saturn timeline
   */
  async getSaturnTimeline(params) {
    const birthDetails = normalizeBirthDetails(params);
    const cacheKey = vedicCache.generateKey('saturn_timeline', birthDetails);

    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/saturn-timeline', birthDetails);

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 4. POST /surya-siddhanta — Surya Siddhanta chart
   */
  async getSuryaSiddhantaChart(params) {
    const birthDetails = normalizeBirthDetails(params);
    const cacheKey = vedicCache.generateKey('surya_siddhanta', birthDetails);

    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/surya-siddhanta', birthDetails);

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 5. POST /gochara — Transits against a birth chart
   */
  async getGochara(params = {}, targetDateArg = null) {
    const birthDetails = normalizeBirthDetails(params);
    const target_date = params.target_date || targetDateArg || new Date().toISOString().split('T')[0];

    const payload = pickOptionalFields(
      params,
      { ...birthDetails, target_date: String(target_date).trim() },
      [
        'target_time',
        'node_type',
        'include',
        'event_place',
        'event_latitude',
        'event_longitude',
        'event_timezone',
        'event_elevation'
      ]
    );

    const cacheKey = vedicCache.generateKey('gochara', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/gochara', payload);

    await vedicCache.set(cacheKey, response, TTL.ONE_HOUR);
    return response;
  },

  /**
   * 6. POST /gochara/range — Transits day by day against a birth chart (max 60 days)
   */
  async getGocharaRange(params = {}, fromDateArg = null, toDateArg = null) {
    const birthDetails = normalizeBirthDetails(params);
    const from_date = params.from_date || fromDateArg;
    const to_date = params.to_date || toDateArg;

    if (!from_date || !to_date) {
      throw new AppError('from_date and to_date (YYYY-MM-DD) are required for gochara range.', 400);
    }

    const payload = pickOptionalFields(
      params,
      {
        ...birthDetails,
        from_date: String(from_date).trim(),
        to_date: String(to_date).trim()
      },
      [
        'time_of_day',
        'include',
        'event_place',
        'event_latitude',
        'event_longitude',
        'event_timezone',
        'event_elevation'
      ]
    );

    const cacheKey = vedicCache.generateKey('gochara_range', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/gochara/range', payload);

    await vedicCache.set(cacheKey, response, TTL.TWELVE_HOURS);
    return response;
  },

  /**
   * 7. POST /gochar — Today's planetary positions (no birth chart required)
   * Required: date, latitude, longitude, timezone
   * Optional: place, ayanamsa_mode
   */
  async getGochar(params = {}) {
    const { date, latitude, longitude, timezone, place = '', ayanamsa_mode } = params;

    if (!date || latitude === undefined || longitude === undefined || timezone === undefined) {
      throw new AppError('date (YYYY-MM-DD), latitude, longitude, and timezone are required for gochar.', 400);
    }

    const payload = {
      date: String(date).trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: Number(timezone),
      place: String(place).trim()
    };

    if (ayanamsa_mode) payload.ayanamsa_mode = String(ayanamsa_mode).trim();

    const cacheKey = vedicCache.generateKey('gochar', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/gochar', payload);

    await vedicCache.set(cacheKey, response, TTL.SIX_HOURS);
    return response;
  },

  /**
   * 8. POST /gochar/events — Upcoming transit events over a date range (max 90 days, no birth chart required)
   * Required: from_date, to_date, latitude, longitude, timezone
   * Optional: place, planets, ayanamsa_mode
   */
  async getGocharEvents(params = {}) {
    const { from_date, to_date, latitude, longitude, timezone, place = '', planets, ayanamsa_mode } = params;

    if (
      !from_date ||
      !to_date ||
      latitude === undefined ||
      longitude === undefined ||
      timezone === undefined
    ) {
      throw new AppError(
        'from_date, to_date, latitude, longitude, and timezone are required for gochar events.',
        400
      );
    }

    const payload = {
      from_date: String(from_date).trim(),
      to_date: String(to_date).trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: Number(timezone),
      place: String(place).trim()
    };

    if (Array.isArray(planets) && planets.length > 0) payload.planets = planets;
    if (ayanamsa_mode) payload.ayanamsa_mode = String(ayanamsa_mode).trim();

    const cacheKey = vedicCache.generateKey('gochar_events', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/gochar/events', payload);

    await vedicCache.set(cacheKey, response, TTL.SIX_HOURS);
    return response;
  },

  /**
   * 9. POST /planet-ingress — When a planet changes sign
   * Required: from_date, to_date
   * Optional: planets, timezone, ayanamsa_mode
   */
  async getPlanetIngress(fromDateOrParams, toDateArg, planetsArg, timezoneArg, ayanamsaArg) {
    const params = typeof fromDateOrParams === 'object' && fromDateOrParams !== null
      ? fromDateOrParams
      : {
          from_date: fromDateOrParams,
          to_date: toDateArg,
          planets: planetsArg,
          timezone: timezoneArg,
          ayanamsa_mode: ayanamsaArg
        };

    const { from_date, to_date, planets, timezone, ayanamsa_mode } = params;

    if (!from_date || !to_date) {
      throw new AppError('from_date and to_date (YYYY-MM-DD) are required for planet ingress.', 400);
    }

    const payload = {
      from_date: String(from_date).trim(),
      to_date: String(to_date).trim()
    };

    if (Array.isArray(planets) && planets.length > 0) payload.planets = planets;
    if (timezone !== undefined && timezone !== null) payload.timezone = Number(timezone);
    if (ayanamsa_mode) payload.ayanamsa_mode = String(ayanamsa_mode).trim();

    const cacheKey = vedicCache.generateKey('planet_ingress', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/planet-ingress', payload);

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 10. POST /panchang — Daily panchang
   * Required: date, latitude, longitude, timezone
   * Optional: place, ayanamsa_mode
   */
  async getPanchang(dateOrParams, latitudeArg, longitudeArg, timezoneArg, placeArg = '') {
    const params = typeof dateOrParams === 'object' && dateOrParams !== null
      ? dateOrParams
      : {
          date: dateOrParams,
          latitude: latitudeArg,
          longitude: longitudeArg,
          timezone: timezoneArg,
          place: placeArg
        };

    const { date, latitude, longitude, timezone, place = '', ayanamsa_mode } = params;

    if (!date || latitude === undefined || longitude === undefined || timezone === undefined) {
      throw new AppError(
        'date (YYYY-MM-DD), latitude, longitude, and timezone are required for Panchang.',
        400
      );
    }

    const payload = {
      date: String(date).trim(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      timezone: Number(timezone),
      place: String(place).trim()
    };

    if (ayanamsa_mode) payload.ayanamsa_mode = String(ayanamsa_mode).trim();

    const cacheKey = vedicCache.generateKey('panchang', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/panchang', payload);

    await vedicCache.set(cacheKey, response, TTL.SIX_HOURS);
    return response;
  },

  /**
   * 11. POST /muhurta — Auspicious dates for an event (max 90 days)
   * Required: date, time, latitude, longitude, timezone, event_type, from_date, to_date
   */
  async getMuhurta(params = {}, eventTypeArg = null, fromDateArg = null, toDateArg = null) {
    const birthDetails = normalizeBirthDetails(params);
    const event_type = params.event_type || eventTypeArg;
    const from_date = params.from_date || fromDateArg;
    const to_date = params.to_date || toDateArg;

    if (!event_type || !from_date || !to_date) {
      throw new AppError('event_type, from_date, and to_date are required for Muhurta search.', 400);
    }

    const payload = pickOptionalFields(
      params,
      {
        ...birthDetails,
        event_type: String(event_type).trim(),
        from_date: String(from_date).trim(),
        to_date: String(to_date).trim()
      },
      [
        'day_part_resolution_minutes',
        'respect_inauspicious_windows',
        'event_place',
        'event_latitude',
        'event_longitude',
        'event_timezone',
        'event_elevation'
      ]
    );

    const cacheKey = vedicCache.generateKey('muhurta', payload);
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await postToEngine('/muhurta', payload);

    await vedicCache.set(cacheKey, response, TTL.SIX_HOURS);
    return response;
  },

  /**
   * 12. GET /muhurta/events — Event types accepted by /muhurta
   */
  async getMuhurtaEvents() {
    const cacheKey = 'astrotring:muhurta_events';
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await getFromEngine('/muhurta/events');

    await vedicCache.set(cacheKey, response, TTL.SEVEN_DAYS);
    return response;
  },

  /**
   * 13. GET /location/search — Best match coordinates & UTC offset for a place name
   */
  async searchLocation(query) {
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new AppError('Location query string (at least 2 characters) is required.', 400);
    }

    const cleanQuery = query.trim();
    const cacheKey = `astrotring:loc_exact:${cleanQuery}`;
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await getFromEngine('/location/search', { query: cleanQuery });

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 14. GET /location/autocomplete — Place suggestions as you type (up to 50)
   */
  async autocompleteLocation(query, limit = 10) {
    if (!query || typeof query !== 'string') {
      throw new AppError('Location query string is required.', 400);
    }

    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) return { query: cleanQuery, count: 0, results: [] };

    const cacheKey = `astrotring:loc_autocomplete:${cleanQuery}:${limit}`;
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await getFromEngine('/location/autocomplete', {
      query: cleanQuery,
      limit: Number(limit)
    });

    await vedicCache.set(cacheKey, response, TTL.ONE_DAY);
    return response;
  },

  /**
   * 15. GET /health — Engine health check
   */
  async getHealth() {
    const cacheKey = 'astrotring:engine_health';
    const cached = await vedicCache.get(cacheKey);
    if (cached) return cached;

    const response = await getFromEngine('/health');

    await vedicCache.set(cacheKey, response, TTL.ONE_MINUTE);
    return response;
  },

  /**
   * 16. List All 23 Supported Divisional (Varga) Charts (D-1 to D-144)
   */
 
  
};
