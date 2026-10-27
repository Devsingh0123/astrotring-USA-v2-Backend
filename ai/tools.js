import { tool } from '@langchain/core/tools';
import { vedicAstrologyService } from '../services/vedicAstrologyService.js';

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

const SUPPORTED_VARGAS = [
  'D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6', 'D-7', 'D-8',
  'D-9', 'D-10', 'D-11', 'D-12', 'D-16', 'D-20', 'D-24',
  'D-27', 'D-30', 'D-40', 'D-45', 'D-60', 'D-81', 'D-108', 'D-144'
];

const PLANET_ORDER = [
  'Ascendant', 'Sun', 'Moon', 'Mars', 'Mercury',
  'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'
];

const SEVEN_PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * Safely normalizes `BirthChart.chart_data` into the root horoscope object.
 */
export const normalizeHoroscopeData = (chartData) => {
  if (!chartData) return {};

  let parsed = chartData;
  if (typeof chartData === 'string') {
    try {
      parsed = JSON.parse(chartData);
    } catch {
      return {};
    }
  }

  return parsed.raw || parsed.horoscope || parsed;
};

/**
 * Deterministically computes the Whole-Sign House number (1 to 12)
 * of a planet relative to the chart's Ascendant sign.
 */
export const calculateWholeSignHouse = (ascendantSign, planetSign) => {
  const ascIndex = ZODIAC_SIGNS.findIndex(
    (sign) => sign.toLowerCase() === String(ascendantSign || '').toLowerCase()
  );
  const planetIndex = ZODIAC_SIGNS.findIndex(
    (sign) => sign.toLowerCase() === String(planetSign || '').toLowerCase()
  );

  if (ascIndex === -1 || planetIndex === -1) return null;
  return ((planetIndex - ascIndex + 12) % 12) + 1;
};

/**
 * Normalizes traditional South Indian planet spellings ("Raagu" -> "Rahu", "Kethu" -> "Ketu").
 */
const normalizePlanetName = (name) =>
  String(name || '')
    .replace(/Raagu/gi, 'Rahu')
    .replace(/Kethu/gi, 'Ketu');

/**
 * Strips inline HTML tags (<br>, <html>, <b>, etc.) from API text descriptions.
 */
const stripHtmlTags = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * ============================================================================
 * TOOL 1: `get_divisional_chart`
 * ============================================================================
 * Extracts any of the 23 Vedic divisional charts (D-1 through D-144) from the user's
 * stored horoscope data, enriched with deterministic Whole-Sign house numbers.
 */
export const createDivisionalChartTool = (chartData) => {
  const horoscope = normalizeHoroscopeData(chartData);

  return tool(
    async ({ varga = 'D-1' }) => {
      const normalizedVarga = String(varga || 'D-1').trim().toUpperCase();
      const divisionalCharts = horoscope.divisional_charts || {};

      const chartKey = Object.keys(divisionalCharts).find((key) =>
        key.toUpperCase().startsWith(`${normalizedVarga}_`) || key.toUpperCase() === normalizedVarga
      );

      if (!chartKey || !divisionalCharts[chartKey]) {
        return JSON.stringify({
          error: `Divisional chart '${normalizedVarga}' not found in user's birth chart.`,
          availableVargas: SUPPORTED_VARGAS
        });
      }

      const rawVargaChart = divisionalCharts[chartKey];
      const ascendantSign = rawVargaChart?.Ascendant?.sign || null;
      const nakshatraMap = normalizedVarga === 'D-1' ? (horoscope.nakshatra_pada || {}) : {};

      const placements = {};
      for (const body of PLANET_ORDER) {
        const bodyData = rawVargaChart[body];
        if (!bodyData || typeof bodyData !== 'object') continue;

        const sign = bodyData.sign || null;
        const house = calculateWholeSignHouse(ascendantSign, sign);
        const longitude = typeof bodyData.longitude === 'number'
          ? Number(bodyData.longitude.toFixed(2))
          : null;

        const placementEntry = { sign, house, longitude };

        if (normalizedVarga === 'D-1' && nakshatraMap[body]) {
          placementEntry.nakshatra = nakshatraMap[body].nakshatra || null;
          placementEntry.pada = nakshatraMap[body].pada ?? null;
          placementEntry.nakshatraLord = nakshatraMap[body].nakshatra_lord || null;
        }

        placements[body] = placementEntry;
      }

      return JSON.stringify({
        varga: normalizedVarga,
        chartName: chartKey,
        ascendantSign,
        placements
      });
    },
    {
      name: 'get_divisional_chart',
      description:
        'Fetches planetary sign placements, Whole-Sign house numbers (1-12), and degrees for a specific Vedic divisional chart (Varga). ' +
        'Use D-1 for main birth chart & nakshatras, D-2 for wealth, D-3 for siblings/courage, D-4 for property/home, D-7 for children, ' +
        'D-9 (Navamsa) for marriage/spouse/dharma, D-10 (Dasamsa) for career/profession, D-12 for parents, ' +
        'D-16 for vehicles/comforts, D-20 for spirituality, D-24 for education, D-30 for challenges, and D-60 for past-life karma.',
      schema: {
        type: 'object',
        properties: {
          varga: {
            type: 'string',
            enum: SUPPORTED_VARGAS,
            description: 'The divisional chart code to inspect (e.g., "D-1", "D-9", "D-10"). Defaults to "D-1".'
          }
        },
        required: ['varga']
      }
    }
  );
};

/**
 * ============================================================================
 * TOOL 2: `get_dasha`
 * ============================================================================
 * Extracts active, upcoming, and year-specific Vimshottari Mahadasha, Antardasha,
 * and Pratyantardasha periods from the user's pre-calculated horoscope.
 */
export const createDashaTool = (chartData) => {
  const horoscope = normalizeHoroscopeData(chartData);

  return tool(
    async ({ targetYear = null }) => {
      const vimsottariList =
        horoscope.graha_dashas?.vimsottari ||
        horoscope.dashas?.vimsottari ||
        [];

      if (!Array.isArray(vimsottariList) || vimsottariList.length === 0) {
        return JSON.stringify({ error: 'Vimshottari Dasha timeline not available in chart data.' });
      }

      const now = new Date();
      const todayIso = now.toISOString().split('T')[0];
      const currentIndex = vimsottariList.findIndex(([_, endDateStr]) => new Date(endDateStr) > now);

      let activePeriod = null;
      let upcomingPratyantardashas = [];
      let upcomingAntardashas = [];

      if (currentIndex !== -1) {
        const [rawPeriod, endDate] = vimsottariList[currentIndex];
        const [mahadasha, antardasha, pratyantardasha] = normalizePlanetName(rawPeriod).split('-');
        const previousEndDate = currentIndex > 0 ? vimsottariList[currentIndex - 1][1] : 'Birth';

        activePeriod = {
          mahadasha,
          antardasha,
          pratyantardasha,
          startedAt: previousEndDate,
          endsAt: endDate
        };

        // Next 10 Pratyantardasha sub-periods for fine-grained near-term timing
        upcomingPratyantardashas = vimsottariList
          .slice(currentIndex + 1, currentIndex + 11)
          .map(([period, end], idx) => ({
            sequence: idx + 1,
            period: normalizePlanetName(period),
            endsAt: end
          }));

        // Next 9 Antardasha transitions for medium-term (1-5 year) timing
        const seenAntardashas = new Set();
        for (let i = currentIndex; i < vimsottariList.length && upcomingAntardashas.length < 9; i++) {
          const [period, end] = vimsottariList[i];
          const normalized = normalizePlanetName(period);
          const [md, ad] = normalized.split('-');
          const key = `${md}-${ad}`;

          // Record the final Pratyantardasha end date of each Antardasha
          const nextEntry = vimsottariList[i + 1];
          const nextNormalized = nextEntry ? normalizePlanetName(nextEntry[0]) : '';
          if (!nextNormalized.startsWith(`${key}-`) && !seenAntardashas.has(key)) {
            seenAntardashas.add(key);
            upcomingAntardashas.push({
              mahadasha: md,
              antardasha: ad,
              endsAt: end
            });
          }
        }
      }

      // Optional year filter when user asks about a specific year (e.g., 2026, 2027, 2028)
      let periodsInTargetYear = undefined;
      if (targetYear) {
        const yearStr = String(targetYear).trim();
        periodsInTargetYear = vimsottariList
          .filter(([_, end]) => String(end).startsWith(yearStr))
          .map(([period, end]) => ({
            period: normalizePlanetName(period),
            endsAt: end
          }));
      }

      return JSON.stringify({
        currentDate: todayIso,
        activePeriod,
        upcomingAntardashas,
        upcomingPratyantardashas,
        ...(periodsInTargetYear ? { targetYear, periodsInTargetYear } : {})
      });
    },
    {
      name: 'get_dasha',
      description:
        'Fetches the user\'s active Vimshottari Mahadasha, Antardasha, and Pratyantardasha with exact start/end dates, ' +
        'plus upcoming Antardasha and Pratyantardasha transitions. Always call this tool when answering timing questions ' +
        '(e.g., "When will I get married?", "When will my career improve?", "Which dasha am I running?").',
      schema: {
        type: 'object',
        properties: {
          targetYear: {
            type: 'number',
            description: 'Optional 4-digit year (e.g., 2026, 2027, 2028) to inspect all Dasha sub-periods ending in that specific year.'
          }
        },
        required: []
      }
    }
  );
};

/**
 * ============================================================================
 * TOOL 3: `get_yogas_and_doshas`
 * ============================================================================
 * Extracts pre-calculated classical Vedic Yogas, Doshas (Manglik, Kala Sarpa,
 * Pitru, Guru Chandala, Ganda Moola, etc.), and Sade Sati periods.
 */
export const createYogasAndDoshasTool = (chartData) => {
  const horoscope = normalizeHoroscopeData(chartData);

  return tool(
    async ({ category = 'all' }) => {
      const result = {};

      if (category === 'all' || category === 'yogas') {
        const yogaSummary = horoscope.yogas?.summary || {};
        const rawYogaList = horoscope.yogas?.yoga_list || {};

        const formattedYogas = Object.entries(rawYogaList).map(([key, val]) => {
          if (Array.isArray(val)) {
            return {
              id: key,
              chart: val[0],
              name: stripHtmlTags(val[1]),
              classicalRule: stripHtmlTags(val[2]),
              effect: stripHtmlTags(val[3])
            };
          }
          return { id: key, details: val };
        });

        result.yogas = {
          summary: yogaSummary,
          activeYogas: formattedYogas
        };
      }

      if (category === 'all' || category === 'doshas') {
        const rawDoshas = horoscope.doshas || {};
        const cleanedDoshas = {};
        for (const [doshaName, description] of Object.entries(rawDoshas)) {
          cleanedDoshas[doshaName] = stripHtmlTags(description);
        }
        result.doshas = cleanedDoshas;
      }

      if (category === 'all' || category === 'sade_sati') {
        result.saturnSadeSati =
          horoscope.saturn_transits?.sadeSati ||
          horoscope.saturn_transits ||
          null;
      }

      return JSON.stringify(result);
    },
    {
      name: 'get_yogas_and_doshas',
      description:
        'Fetches pre-calculated Vedic Yogas (Raja Yogas, Dhana Yogas, Gajakesari, etc.), Doshas ' +
        '(Manglik Dosha, Kala Sarpa Dosha, Pitru Dosha, Guru Chandala Dosha, Ganda Moola Dosha, Kalathra Dosha), ' +
        'and Saturn Sade Sati periods from the user\'s birth chart.',
      schema: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'yogas', 'doshas', 'sade_sati'],
            description: 'Which section to retrieve: "all", "yogas", "doshas", or "sade_sati". Defaults to "all".'
          }
        },
        required: []
      }
    }
  );
};

/**
 * ============================================================================
 * TOOL 4: `get_strengths_and_karakas`
 * ============================================================================
 * Extracts planetary dignities/states, Shadbala (in Rupas & ratios), Ashtakavarga
 * bindus per sign/house, Jaimini Chara Karakas, and D-1 Arudha Padas.
 */
export const createStrengthsAndKarakasTool = (chartData) => {
  const horoscope = normalizeHoroscopeData(chartData);

  return tool(
    async ({ metric = 'all_summary' }) => {
      const d1AscSign = horoscope.divisional_charts?.['D-1_rasi']?.Ascendant?.sign || null;
      const output = {};

      // 1. Planetary States (Exalted, Debilitated, Retrograde, Combust, Own Sign)
      if (metric === 'all_summary' || metric === 'planetary_states') {
        output.planetaryStates = horoscope.planetary_states || {};
      }

      // 2. Jaimini Chara Karakas (Atmakaraka, Amatyakaraka, Darakaraka, etc.)
      if (metric === 'all_summary' || metric === 'chara_karakas') {
        output.charaKarakas = horoscope.chara_karakas || {};
      }

      // 3. Shadbala (Labeled Rupas, Required Rupas, and Strength Ratio per planet)
      if (metric === 'all_summary' || metric === 'shad_bala') {
        const shadBalaMatrix = horoscope.shad_bala;
        const requiredRupas = horoscope.shad_bala_required || [];

        if (Array.isArray(shadBalaMatrix) && shadBalaMatrix.length >= 9) {
          const virupasRow = shadBalaMatrix[6] || [];
          const rupasRow = shadBalaMatrix[7] || [];
          const ratioRow = shadBalaMatrix[8] || [];

          const shadbalaByPlanet = {};
          SEVEN_PLANETS.forEach((planet, idx) => {
            const ratio = ratioRow[idx] ?? null;
            shadbalaByPlanet[planet] = {
              totalVirupas: virupasRow[idx] ?? null,
              rupas: rupasRow[idx] ?? null,
              requiredRupas: requiredRupas[idx] ?? null,
              strengthRatio: ratio,
               meetsMinimumStrength: typeof ratio === 'number' ? ratio >= 1.0 : null
            };
          });
          output.shadbala = shadbalaByPlanet;
        }
      }

      // 4. Sarvashtakavarga (Samudhaya Ashtakavarga bindus mapped to each sign & D-1 house)
      if (metric === 'all_summary' || metric === 'ashtakavarga') {
        const bindusArray = horoscope.ashtakavarga?.samudhaya_ashtaka_varga;
        if (Array.isArray(bindusArray) && bindusArray.length === 12) {
          const sarvashtakavargaBySign = {};
          ZODIAC_SIGNS.forEach((sign, idx) => {
            sarvashtakavargaBySign[sign] = {
              bindus: bindusArray[idx],
              houseFromLagna: calculateWholeSignHouse(d1AscSign, sign)
            };
          });
          output.sarvashtakavarga = sarvashtakavargaBySign;
        }
      }

      // 5. D-1 Arudha Padas (AL, UL, A7, A10, etc.)
      if (metric === 'all_summary' || metric === 'arudha_padas') {
        const allArudhas = horoscope.arudha_padhas || horoscope.arudha_padas || {};
        const d1Arudhas = {};
        for (const [key, sign] of Object.entries(allArudhas)) {
          if (key.startsWith('D-1-')) {
            const cleanLabel = key.replace('D-1-', '');
            d1Arudhas[cleanLabel] = {
              sign,
              houseFromLagna: calculateWholeSignHouse(d1AscSign, sign)
            };
          }
        }
        output.d1ArudhaPadas = d1Arudhas;
      }

      // 6. Special Lagnas & Upagrahas
      if (metric === 'special_lagnas') {
        output.specialLagnas = horoscope.special_lagnas || {};
        output.upagrahas = horoscope.upagrahas || {};
      }

      return JSON.stringify(output);
    },
    {
      name: 'get_strengths_and_karakas',
      description:
        'Fetches planetary dignity states (retrograde, combust, exalted, debilitated, own-sign), ' +
        'Shadbala strength scores (in Rupas & ratios), Sarvashtakavarga house bindus, ' +
        'Jaimini Chara Karakas (Atmakaraka, Amatyakaraka, Darakaraka), and D-1 Arudha Padas (Arudha Lagna AL, Upapada Lagna UL, A7, A10).',
      schema: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: [
              'all_summary',
              'planetary_states',
              'shad_bala',
              'ashtakavarga',
              'chara_karakas',
              'arudha_padas',
              'special_lagnas'
            ],
            description: 'Which strength or Jaimini metric to retrieve. Defaults to "all_summary".'
          }
        },
        required: []
      }
    }
  );
};

/**
 * ============================================================================
 * TOOL 5: `get_transits_and_muhurta`
 * ============================================================================
 * Queries live Gochara planetary transits, daily Panchang, or Muhurta windows
 * via `vedicAstrologyService` (backed by Redis caching).
 */
export const createTransitsAndMuhurtaTool = ({ chartData, birthParams }) => {
  const horoscope = normalizeHoroscopeData(chartData);

  return tool(
    async ({ queryType = 'current_transits', targetDate = null }) => {
      const effectiveDate = targetDate || new Date().toISOString().split('T')[0];

      try {
        if (queryType === 'current_transits') {
          const gochara = await vedicAstrologyService.getGochara({
            ...birthParams,
            transitDate: effectiveDate
          });
          return JSON.stringify({
            queryType,
            transitDate: effectiveDate,
            gochara
          });
        }

        if (queryType === 'panchang') {
          const panchang = await vedicAstrologyService.getPanchang({
            date: effectiveDate,
            time: '09:00:00',
            latitude: birthParams.latitude,
            longitude: birthParams.longitude,
            timezone: birthParams.timezone,
            place: birthParams.place
          });
          return JSON.stringify({
            queryType,
            date: effectiveDate,
            panchang
          });
        }

        if (queryType === 'muhurta') {
          const muhurta = await vedicAstrologyService.getMuhurta({
            date: effectiveDate,
            time: '09:00:00',
            latitude: birthParams.latitude,
            longitude: birthParams.longitude,
            timezone: birthParams.timezone,
            place: birthParams.place
          });
          return JSON.stringify({
            queryType,
            date: effectiveDate,
            muhurta
          });
        }

        if (queryType === 'saturn_sade_sati') {
          const saturnData =
            horoscope.saturn_transits ||
            (await vedicAstrologyService.getSaturnTimeline(birthParams));
          return JSON.stringify({
            queryType,
            saturnSadeSati: saturnData
          });
        }

        return JSON.stringify({ error: `Unsupported queryType: ${queryType}` });
      } catch (error) {
        return JSON.stringify({
          error: `Unable to fetch ${queryType} for ${effectiveDate}: ${error.message}`
        });
      }
    },
    {
      name: 'get_transits_and_muhurta',
      description:
        'Fetches live planetary transits (Gochara) relative to the user\'s natal Moon, daily Panchang (Tithi, Nakshatra, Yoga, Karana), ' +
        'auspicious Muhurta timings, or Saturn Sade Sati timeline for today or any target date (YYYY-MM-DD).',
      schema: {
        type: 'object',
        properties: {
          queryType: {
            type: 'string',
            enum: ['current_transits', 'panchang', 'muhurta', 'saturn_sade_sati'],
            description: 'The live astronomical calculation to fetch. Defaults to "current_transits".'
          },
          targetDate: {
            type: 'string',
            description: 'Optional target date in YYYY-MM-DD format (defaults to today).'
          }
        },
        required: ['queryType']
      }
    }
  );
};

/**
 * Master factory that binds all 5 Jyotish Vedic astrology tools to a specific user's
 * birth chart and birth coordinates.
 */
export const createJyotishTools = ({ chartData, birthParams }) => [
  createDivisionalChartTool(chartData),
  createDashaTool(chartData),
  createYogasAndDoshasTool(chartData),
  createStrengthsAndKarakasTool(chartData),
  createTransitsAndMuhurtaTool({ chartData, birthParams })
];
