import dotenv from 'dotenv';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { HoroscopeForecast } from '../models/index.js';
import {
  RASHI_LIST,
  HOROSCOPE_TIMEFRAMES
} from '../models/HoroscopeForecast.js';
import { vedicAstrologyService } from './vedicAstrologyService.js';
import { vedicCache } from '../utils/cache.js';
import { AppError } from '../utils/appError.js';

dotenv.config();

/**
 * Rashi (Moon Sign) Metadata & Classical Vedic Attributes
 */
export const RASHI_METADATA = {
  aries:       { index: 1,  name: 'Aries',       sanskrit: 'Mesha',     ruler: 'Mars',    element: 'Fire'  },
  taurus:      { index: 2,  name: 'Taurus',      sanskrit: 'Vrishabha', ruler: 'Venus',   element: 'Earth' },
  gemini:      { index: 3,  name: 'Gemini',      sanskrit: 'Mithuna',   ruler: 'Mercury', element: 'Air'   },
  cancer:      { index: 4,  name: 'Cancer',      sanskrit: 'Karka',     ruler: 'Moon',    element: 'Water' },
  leo:         { index: 5,  name: 'Leo',         sanskrit: 'Simha',     ruler: 'Sun',     element: 'Fire'  },
  virgo:       { index: 6,  name: 'Virgo',       sanskrit: 'Kanya',     ruler: 'Mercury', element: 'Earth' },
  libra:       { index: 7,  name: 'Libra',       sanskrit: 'Tula',      ruler: 'Venus',   element: 'Air'   },
  scorpio:     { index: 8,  name: 'Scorpio',     sanskrit: 'Vrishchika',ruler: 'Mars',    element: 'Water' },
  sagittarius: { index: 9,  name: 'Sagittarius', sanskrit: 'Dhanu',     ruler: 'Jupiter', element: 'Fire'  },
  capricorn:   { index: 10, name: 'Capricorn',   sanskrit: 'Makara',    ruler: 'Saturn',  element: 'Earth' },
  aquarius:    { index: 11, name: 'Aquarius',    sanskrit: 'Kumbha',    ruler: 'Saturn',  element: 'Air'   },
  pisces:      { index: 12, name: 'Pisces',      sanskrit: 'Meena',     ruler: 'Jupiter', element: 'Water' }
};

/**
 * Classical Parashari Gochara-Phala Rules (Favourable Houses from Natal Moon & Vedha Obstructions)
 */
const GOCHARA_RULES = {
  Sun:     { fav: [3, 6, 10, 11],               vedha: { 3: 9, 6: 12, 10: 4, 11: 5 } },
  Moon:    { fav: [1, 3, 6, 7, 10, 11],         vedha: { 1: 5, 3: 9, 6: 12, 7: 2, 10: 4, 11: 8 } },
  Mars:    { fav: [3, 6, 11],                   vedha: { 3: 12, 6: 9, 11: 5 } },
  Mercury: { fav: [2, 4, 6, 8, 10, 11],         vedha: { 2: 5, 4: 3, 6: 9, 8: 1, 10: 8, 11: 12 } },
  Jupiter: { fav: [2, 5, 7, 9, 11],             vedha: { 2: 12, 5: 4, 7: 3, 9: 10, 11: 8 } },
  Venus:   { fav: [1, 2, 3, 4, 5, 8, 9, 11, 12],vedha: { 1: 8, 2: 7, 3: 1, 4: 10, 5: 9, 8: 5, 9: 11, 11: 6, 12: 3 } },
  Saturn:  { fav: [3, 6, 11],                   vedha: { 3: 12, 6: 9, 11: 5 } },
  Rahu:    { fav: [3, 6, 11],                   vedha: { 3: 12, 6: 9, 11: 5 } },
  Ketu:    { fav: [3, 6, 11],                   vedha: { 3: 12, 6: 9, 11: 5 } }
};

// Reference New Delhi coordinates used for universal sidereal sky snapshots (IST +5.5)
const SKY_REF_PARAMS = {
  date: '2000-01-01',
  time: '12:00:00',
  place: 'New Delhi',
  latitude: 28.6139,
  longitude: 77.2090,
  timezone: 5.5
};

/**
 * Helper: Compute Whole-Sign House (1..12) of a planet Sign relative to a Moon Sign (Rashi).
 */
const getHouseFromRashi = (planetSignName, rashiKey) => {
  const planetMeta = RASHI_METADATA[String(planetSignName || '').trim().toLowerCase()];
  const rashiMeta = RASHI_METADATA[rashiKey];
  if (!planetMeta || !rashiMeta) return null;

  return ((planetMeta.index - rashiMeta.index + 12) % 12) + 1;
};

/**
 * Helper: Resolve period_key and date range for daily, monthly, or yearly timeframe.
 */
export const resolvePeriodWindow = (timeframe, customDate = null) => {
  const baseDate = customDate ? new Date(customDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) {
    throw new AppError('Invalid date format. Use YYYY-MM-DD.', 400);
  }

  const year = baseDate.getUTCFullYear();
  const month = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(baseDate.getUTCDate()).padStart(2, '0');

  if (timeframe === 'daily') {
    const dateStr = `${year}-${month}-${day}`;
    return {
      periodKey: dateStr,
      targetDate: dateStr,
      fromDate: dateStr,
      toDate: dateStr
    };
  }

  if (timeframe === 'monthly') {
    const lastDay = new Date(Date.UTC(year, baseDate.getUTCMonth() + 1, 0)).getUTCDate();
    return {
      periodKey: `${year}-${month}`,
      targetDate: `${year}-${month}-01`,
      fromDate: `${year}-${month}-01`,
      toDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`
    };
  }

  // yearly
  return {
    periodKey: `${year}`,
    targetDate: `${year}-01-01`,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`
  };
};

/**
 * Step 1: Build Deterministic Transit Snapshot for a Rashi & Timeframe
 * Uses Jagannatha Hora's `/gochara` and `/planet-ingress` endpoints.
 */
export const buildRashiTransitSnapshot = async (rashiKey, timeframe, periodWindow) => {
  const rashiMeta = RASHI_METADATA[rashiKey];

  // 1. Fetch sidereal sky snapshot for targetDate (cached across all 12 signs in Redis)
  const skyCacheKey = `japaika:sky_gochara:${periodWindow.targetDate}`;
  let rawGochara = await vedicCache.get(skyCacheKey);
  if (!rawGochara) {
    const res = await vedicAstrologyService.getGochara(SKY_REF_PARAMS, periodWindow.targetDate);
    rawGochara = res.gochara || res;
    await vedicCache.set(skyCacheKey, rawGochara, 60 * 60 * 6);
  }

  // 2. Map all 9 planets to their exact House from the requested Rashi (1..12)
  const rawPlanets = Array.isArray(rawGochara.planets) ? rawGochara.planets : [];
  const houseOccupants = {};

  const mappedPlanets = rawPlanets.map((p) => {
    const houseFromMoon = getHouseFromRashi(p.sign, rashiKey);
    if (houseFromMoon) {
      if (!houseOccupants[houseFromMoon]) houseOccupants[houseFromMoon] = [];
      houseOccupants[houseFromMoon].push(p.planet);
    }
    return {
      planet: p.planet,
      sign: p.sign,
      degree: Number(Number(p.degree || 0).toFixed(2)),
      nakshatra: p.nakshatra,
      pada: p.pada,
      retrograde: Boolean(p.retrograde),
      combust: Boolean(p.combust),
      houseFromMoon
    };
  });

  // 3. Apply Parashari Gochara Favourability & Vedha Obstructions for this Rashi
  let favourableCount = 0;
  const planetsWithGochara = mappedPlanets.map((p) => {
    const rule = GOCHARA_RULES[p.planet];
    if (!rule || !p.houseFromMoon) {
      return { ...p, isFavourable: false, vedhaObstructed: false, effectiveFavourable: false };
    }

    const isFavourable = rule.fav.includes(p.houseFromMoon);
    const vedhaHouse = isFavourable ? rule.vedha[p.houseFromMoon] : null;
    let obstructingPlanets = vedhaHouse ? (houseOccupants[vedhaHouse] || []) : [];

    // Classical Parashari Vedha exceptions: Sun <-> Saturn and Moon <-> Mercury do not obstruct each other
    obstructingPlanets = obstructingPlanets.filter((obs) => {
      if ((p.planet === 'Sun' && obs === 'Saturn') || (p.planet === 'Saturn' && obs === 'Sun')) return false;
      if ((p.planet === 'Moon' && obs === 'Mercury') || (p.planet === 'Mercury' && obs === 'Moon')) return false;
      return obs !== p.planet;
    });

    const vedhaObstructed = isFavourable && obstructingPlanets.length > 0;
    const effectiveFavourable = isFavourable && !vedhaObstructed;
    if (effectiveFavourable) favourableCount += 1;

    return {
      ...p,
      isFavourable,
      vedhaObstructed,
      obstructedBy: vedhaObstructed ? obstructingPlanets : [],
      effectiveFavourable
    };
  });

  // 4. Determine Saturn Phase (Sade Sati / Dhaiya) for this Rashi
  const saturn = planetsWithGochara.find((p) => p.planet === 'Saturn');
  let saturnPhase = 'Normal Transit';
  if (saturn?.houseFromMoon === 12) saturnPhase = 'Sade Sati (Rising Phase — 12th from Moon)';
  else if (saturn?.houseFromMoon === 1) saturnPhase = 'Sade Sati (Peak Phase — 1st on Moon)';
  else if (saturn?.houseFromMoon === 2) saturnPhase = 'Sade Sati (Setting Phase — 2nd from Moon)';
  else if (saturn?.houseFromMoon === 4) saturnPhase = 'Kantaka Shani / Dhaiya (4th from Moon)';
  else if (saturn?.houseFromMoon === 8) saturnPhase = 'Ashtama Shani / Dhaiya (8th from Moon)';

  // 5. For Monthly & Yearly timeframes, fetch exact Sign Ingresses across the window
  let signIngresses = [];
  if (timeframe === 'monthly' || timeframe === 'yearly') {
    const ingressPlanets = timeframe === 'monthly'
      ? ['Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']
      : ['Saturn', 'Jupiter', 'Rahu', 'Ketu', 'Mars', 'Venus', 'Mercury', 'Sun'];

    const rawIngress = await vedicAstrologyService.getPlanetIngress(
      periodWindow.fromDate,
      periodWindow.toDate,
      ingressPlanets,
      5.5
    );

    const list = rawIngress?.ingresses || [];
    signIngresses = list.map((ing) => ({
      planet: ing.planet,
      date: ing.date,
      fromSign: ing.from_sign,
      toSign: ing.to_sign,
      fromHouse: getHouseFromRashi(ing.from_sign, rashiKey),
      toHouse: getHouseFromRashi(ing.to_sign, rashiKey),
      retrograde: Boolean(ing.retrograde),
      direction: ing.direction
    }));
  }

  return {
    rashi: {
      id: rashiKey,
      name: rashiMeta.name,
      sanskrit: rashiMeta.sanskrit,
      ruler: rashiMeta.ruler,
      element: rashiMeta.element
    },
    timeframe,
    periodKey: periodWindow.periodKey,
    dateRange: {
      from: periodWindow.fromDate,
      to: periodWindow.toDate
    },
    panchanga: timeframe === 'daily' ? (rawGochara.panchanga || null) : null,
    muhurta: timeframe === 'daily' ? {
      sunrise: rawGochara.muhurta?.sunrise,
      sunset: rawGochara.muhurta?.sunset,
      abhijit: rawGochara.muhurta?.recommended_time || rawGochara.muhurta?.abhijit,
      rahuKala: rawGochara.muhurta?.rahu_kalam
    } : null,
    favourablePlanetsCount: favourableCount,
    saturnPhase,
    planets: planetsWithGochara,
    ingresses: signIngresses
  };
};

/**
 * Step 2: Generate Structured Horoscope Text via OpenAI (`gpt-4o-mini`)
 * Strictly interprets the deterministic `transitSnapshot` without inventing positions.
 */
const generateForecastWithAI = async (transitSnapshot) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError('OPENAI_API_KEY is not configured on the server.', 500);
  }

  const llm = new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.4,
    modelKwargs: {
      response_format: { type: 'json_object' }
    }
  });

  const { rashi, timeframe, periodKey, planets, ingresses, panchanga, muhurta, saturnPhase } = transitSnapshot;

  const systemPrompt = `You are Japaika's Master Vedic Astrologer generating a ${timeframe.toUpperCase()} horoscope for ${rashi.name} (${rashi.sanskrit} Rashi, ruled by ${rashi.ruler}).
STRICT RULES:
1. NEVER invent, guess, or recalculate planetary signs, houses, or dates. Use ONLY the verified Vedic Gochara data provided below.
2. Reference actual planetary placements and whole-sign houses from ${rashi.name} Moon (e.g. "With Jupiter transiting your Xth house..." or "As the Sun enters your Yth house on [date]...").
3. Return ONLY valid JSON matching this exact structure:
{
  "headline": "Short 5-8 word cosmic theme for this ${timeframe} period",
  "summary": "2-3 sentence high-impact overview grounded in the active transits.",
  "scores": {
    "overall": 82,
    "career": 85,
    "love": 78,
    "wealth": 80,
    "health": 84
  },
  "categories": {
    "career": "2-3 sentences on career, authority, and 10th/6th/11th house transits.",
    "love": "2-3 sentences on relationships, Venus/7th/5th house dynamics.",
    "wealth": "2-3 sentences on finances, Jupiter/2nd/11th house influences.",
    "health": "2-3 sentences on vitality, Moon/Lagna/6th/8th house influences."
  },
  "keyTransits": [
    "Planet in Sign (Nth House from Moon) — Brief impact",
    "Planet in Sign (Nth House from Moon) — Brief impact",
    "Planet in Sign (Nth House from Moon) — Brief impact"
  ],
  "lucky": {
    "color": "Vedic auspicious color for this period",
    "number": 7,
    "auspiciousWindow": "Best timing window (use Abhijit Muhurta for daily, or best dates for monthly/yearly)",
    "cosmicRemedy": "1 practical, constructive Vedic remedy or mindfulness action"
  }
}`;

  const userPrompt = `VERIFIED VEDIC TRANSIT DATA FOR ${rashi.name.toUpperCase()} (${rashi.sanskrit}) — ${timeframe.toUpperCase()} (${periodKey}):
- Saturn Status: ${saturnPhase}
${panchanga ? `- Today's Panchanga: Vara=${panchanga.vara}, Tithi=${panchanga.tithi?.name} (${panchanga.paksha} Paksha), Nakshatra=${panchanga.nakshatra?.name}, Yoga=${panchanga.yoga?.name}` : ''}
${muhurta?.abhijit ? `- Auspicious Abhijit Muhurta: ${muhurta.abhijit.start} to ${muhurta.abhijit.end} (Rahu Kala: ${muhurta.rahuKala?.start} to ${muhurta.rahuKala?.end})` : ''}
- Planetary Positions from ${rashi.name} Moon:
${planets.map((p) => `  * ${p.planet}: in ${p.sign} (${p.degree}°), ${p.houseFromMoon}th House from Moon, Nakshatra=${p.nakshatra}${p.retrograde ? ' [RETROGRADE]' : ''}${p.combust ? ' [COMBUST]' : ''} | Gochara=${p.effectiveFavourable ? 'Favourable' : p.vedhaObstructed ? `Obstructed by Vedha (${p.obstructedBy.join(',')})` : 'Challenging/Neutral'}`).join('\n')}
${ingresses.length > 0 ? `- Sign Ingresses During Period:\n${ingresses.slice(0, 25).map((i) => `  * ${i.date}: ${i.planet} moves from ${i.fromSign} (${i.fromHouse}th House) -> ${i.toSign} (${i.toHouse}th House) [${i.direction}]`).join('\n')}` : ''}`;

  const aiResponse = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt)
  ]);

  return JSON.parse(aiResponse.content);
};

/**
 * Main Public Service Method: Get or Generate Horoscope (Two-Layer Cached: Redis + MySQL)
 */
export const getOrGenerateHoroscope = async ({
  sign = 'aries',
  timeframe = 'daily',
  date = null
}) => {
  const rashiKey = String(sign || '').trim().toLowerCase();
  if (!RASHI_LIST.includes(rashiKey)) {
    throw new AppError(
      `Invalid sign "${sign}". Must be one of: ${RASHI_LIST.join(', ')}.`,
      400
    );
  }

  const normalizedTimeframe = String(timeframe || 'daily').trim().toLowerCase();
  if (!HOROSCOPE_TIMEFRAMES.includes(normalizedTimeframe)) {
    throw new AppError(
      `Invalid timeframe "${timeframe}". Must be one of: daily, monthly, yearly.`,
      400
    );
  }

  const periodWindow = resolvePeriodWindow(normalizedTimeframe, date);
  const redisCacheKey = `japaika:horoscope_forecast:${rashiKey}:${normalizedTimeframe}:${periodWindow.periodKey}`;

  // 1. Check Layer 1 Cache (Redis)
  const redisCached = await vedicCache.get(redisCacheKey);
  if (redisCached) {
    return { ...redisCached, cached: true };
  }

  // 2. Check Layer 2 Permanent Storage (MySQL `horoscope_forecasts` table)
  const existingRecord = await HoroscopeForecast.findOne({
    where: {
      rashi: rashiKey,
      timeframe: normalizedTimeframe,
      period_key: periodWindow.periodKey
    }
  });

  if (existingRecord) {
    const transitSnapshot = typeof existingRecord.transit_snapshot === 'string'
      ? JSON.parse(existingRecord.transit_snapshot)
      : existingRecord.transit_snapshot;
    const forecastData = typeof existingRecord.forecast_data === 'string'
      ? JSON.parse(existingRecord.forecast_data)
      : existingRecord.forecast_data;

    const payload = {
      sign: rashiKey,
      rashi: transitSnapshot.rashi,
      timeframe: normalizedTimeframe,
      periodKey: periodWindow.periodKey,
      dateRange: transitSnapshot.dateRange,
      forecast: forecastData,
      astrologyData: {
        saturnPhase: transitSnapshot.saturnPhase,
        favourablePlanetsCount: transitSnapshot.favourablePlanetsCount,
        panchanga: transitSnapshot.panchanga,
        muhurta: transitSnapshot.muhurta,
        planets: transitSnapshot.planets,
        ingresses: transitSnapshot.ingresses
      }
    };

    await vedicCache.set(redisCacheKey, payload, 60 * 60 * 6);
    return { ...payload, cached: true };
  }

  // 3. Not cached yet -> Build deterministic transit snapshot & generate once via OpenAI
  const transitSnapshot = await buildRashiTransitSnapshot(
    rashiKey,
    normalizedTimeframe,
    periodWindow
  );
  const forecastData = await generateForecastWithAI(transitSnapshot);

  // Persist to MySQL (findOrCreate handles concurrent requests safely)
  await HoroscopeForecast.findOrCreate({
    where: {
      rashi: rashiKey,
      timeframe: normalizedTimeframe,
      period_key: periodWindow.periodKey
    },
    defaults: {
      rashi: rashiKey,
      timeframe: normalizedTimeframe,
      period_key: periodWindow.periodKey,
      transit_snapshot: transitSnapshot,
      forecast_data: forecastData
    }
  });

  const result = {
    sign: rashiKey,
    rashi: transitSnapshot.rashi,
    timeframe: normalizedTimeframe,
    periodKey: periodWindow.periodKey,
    dateRange: transitSnapshot.dateRange,
    forecast: forecastData,
    astrologyData: {
      saturnPhase: transitSnapshot.saturnPhase,
      favourablePlanetsCount: transitSnapshot.favourablePlanetsCount,
      panchanga: transitSnapshot.panchanga,
      muhurta: transitSnapshot.muhurta,
      planets: transitSnapshot.planets,
      ingresses: transitSnapshot.ingresses
    }
  };

  await vedicCache.set(redisCacheKey, result, 60 * 60 * 6);
  return { ...result, cached: false };
};
