import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { normalizeHoroscopeData, calculateWholeSignHouse } from './tools.js';

const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

/**
 * Extracts key astrological factors from raw chart data for report generation.
 */
export const extractAstrologicalSummary = (chartData, reportType = 'career') => {
  const horoscope = normalizeHoroscopeData(chartData);

  // 1. Core Natal Points
  const ascendantSign = horoscope.ascendant_sign || horoscope.Ascendant?.sign || 'Aries';
  const moonSign = horoscope.moon_sign || horoscope.Moon?.sign || 'Taurus';
  const sunSign = horoscope.sun_sign || horoscope.Sun?.sign || 'Leo';

  // 2. Natal Placements (D-1)
  const d1Chart = horoscope.divisional_charts?.D1 || horoscope.divisional_charts?.['D-1'] || {};
  const nakshatraMap = horoscope.nakshatra_pada || {};

  const natalPlacements = {};
  const bodies = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  for (const b of bodies) {
    const raw = d1Chart[b] || horoscope[b];
    if (raw && typeof raw === 'object') {
      const sign = raw.sign || 'Aries';
      natalPlacements[b] = {
        sign,
        house: calculateWholeSignHouse(ascendantSign, sign),
        degree: typeof raw.longitude === 'number' ? Number(raw.longitude.toFixed(2)) : null,
        nakshatra: nakshatraMap[b]?.nakshatra || null,
        pada: nakshatraMap[b]?.pada || null
      };
    }
  }

  // 3. Relevant Divisional Charts (D-10 Dasamsa for career, D-9 Navamsa for marriage, D-2 Hora for wealth)
  const d10Chart = horoscope.divisional_charts?.D10 || horoscope.divisional_charts?.['D-10'] || {};
  const d9Chart = horoscope.divisional_charts?.D9 || horoscope.divisional_charts?.['D-9'] || {};
  const d2Chart = horoscope.divisional_charts?.D2 || horoscope.divisional_charts?.['D-2'] || {};

  const d10Placements = {};
  const d10Asc = d10Chart.Ascendant?.sign || ascendantSign;
  for (const b of bodies) {
    if (d10Chart[b]?.sign) {
      d10Placements[b] = {
        sign: d10Chart[b].sign,
        house: calculateWholeSignHouse(d10Asc, d10Chart[b].sign)
      };
    }
  }

  const d9Placements = {};
  const d9Asc = d9Chart.Ascendant?.sign || ascendantSign;
  for (const b of bodies) {
    if (d9Chart[b]?.sign) {
      d9Placements[b] = {
        sign: d9Chart[b].sign,
        house: calculateWholeSignHouse(d9Asc, d9Chart[b].sign)
      };
    }
  }

  // 4. Dashas (Current & Next 5 Years)
  const vimsottariList =
    horoscope.graha_dashas?.vimsottari ||
    horoscope.dashas?.vimsottari ||
    [];

  const now = new Date();
  const currentIndex = vimsottariList.findIndex(([_, endDateStr]) => new Date(endDateStr) > now);
  const activeDasha = currentIndex !== -1 ? vimsottariList[currentIndex] : null;
  const nextDashas = currentIndex !== -1 ? vimsottariList.slice(currentIndex + 1, currentIndex + 8) : [];

  // 5. Yogas & Doshas
  const yogas = Array.isArray(horoscope.yogas)
    ? horoscope.yogas.map((y) => (typeof y === 'string' ? y : y.name || y.title))
    : [];
  const doshas = Array.isArray(horoscope.doshas)
    ? horoscope.doshas.map((d) => (typeof d === 'string' ? d : d.name || d.title))
    : [];

  // 6. Jaimini Karakas (Atmakaraka, Amatyakaraka, Darakaraka)
  const charaKarakas = horoscope.chara_karakas || {};

  return {
    ascendantSign,
    moonSign,
    sunSign,
    natalPlacements,
    d10Placements,
    d9Placements,
    activeDasha: activeDasha ? { period: activeDasha[0], endsAt: activeDasha[1] } : null,
    upcomingDashas: nextDashas.map(([p, end]) => ({ period: p, endsAt: end })),
    yogas: yogas.slice(0, 10),
    doshas: doshas.slice(0, 8),
    charaKarakas
  };
};

/**
 * Report Chapter Blueprints by Category/Slug
 */
export const REPORT_BLUEPRINTS = {
  career: [
    {
      batch: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: "Executive Astrological Foundation & Lagna Profile",
          focus: "Ascendant sign, 1st house vitality, Moon mind-state, Sun authority, and Atmakaraka soul mission."
        },
        {
          chapterNumber: 2,
          title: "The 10th House of Karma & Core Professional Calling",
          focus: "10th house cusp, 10th lord placement, Amatyakaraka career indicator, and vocational strengths."
        },
        {
          chapterNumber: 3,
          title: "Dasamsa (D-10) Deep Dive & Executive Leadership Peaks",
          focus: "Analysis of the D-10 Dasamsa divisional chart, peak power periods, status, and leadership archetype."
        }
      ]
    },
    {
      batch: 2,
      chapters: [
        {
          chapterNumber: 4,
          title: "Corporate Employment vs. Independent Enterprise",
          focus: "Head-to-head comparison of 6th house (service/corporate) vs 7th & 10th houses (business/founders)."
        },
        {
          chapterNumber: 5,
          title: "Dhana Yogas & Wealth Capacity Through Career",
          focus: "2nd house of earnings, 11th house of recurrent gains, Indu Lagna, and wealth multiplier phases."
        },
        {
          chapterNumber: 6,
          title: "5-Year Vimshottari Dasha Career Timeline (2026–2031)",
          focus: "Detailed breakdown of upcoming Mahadasha-Antardasha periods, promotion windows, and turning points."
        }
      ]
    },
    {
      batch: 3,
      chapters: [
        {
          chapterNumber: 7,
          title: "Live Planetary Transits (Gochara) on Career Houses",
          focus: "Saturn transits, Jupiter blessings, and Rahu-Ketu nodal axis across career Bhavas."
        },
        {
          chapterNumber: 8,
          title: "Strategic Career Guidance & Pitfalls to Avoid",
          focus: "Workplace politics, Burnout avoidance, ideal industry domains, and critical cautionary periods."
        },
        {
          chapterNumber: 9,
          title: "Sacred Vedic Remedies for Professional Prosperity",
          focus: "Specific planetary mantras, gemstone recommendations, behavioral remedies, and charitable deeds."
        },
        {
          chapterNumber: 10,
          title: "Executive Summary & AstroTring Career Action Plan",
          focus: "Quarter-by-quarter strategic career roadmap and affirmative closing guidance."
        }
      ]
    }
  ],

  marriage: [
    {
      batch: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: "Astrological Foundation & 7th House Dynamics",
          focus: "Ascendant, 7th house cusp, 7th lord dignity, Venus and Jupiter condition for marital destiny."
        },
        {
          chapterNumber: 2,
          title: "Navamsa (D-9) Breakdown & Soulmate Karaka (Darakaraka)",
          focus: "Detailed Navamsa D-9 analysis, Navamsa Lagna, Darakaraka planetary placement, and soul contract."
        },
        {
          chapterNumber: 3,
          title: "Spouse Temperament, Traits & Vocational Background",
          focus: "Personality, psychological nature, appearance indicators, and vocational background of the spouse."
        }
      ]
    },
    {
      batch: 2,
      chapters: [
        {
          chapterNumber: 4,
          title: "Auspicious Marriage Timing Windows (2026–2030)",
          focus: "Double-transit of Jupiter & Saturn over 7th house/lagna and active Vimshottari Antardashas."
        },
        {
          chapterNumber: 5,
          title: "Marital Harmony, Emotional Bond & Conflict Resolution",
          focus: "5th & 7th house interplay, communication flow, conflict triggers, and emotional compatibility."
        },
        {
          chapterNumber: 6,
          title: "Dosha Analysis & Classical Cancellations",
          focus: "Mangal Dosha examination, 8th house analysis, Papa Kartari yogas, and classical cancellation rules."
        }
      ]
    },
    {
      batch: 3,
      chapters: [
        {
          chapterNumber: 7,
          title: "Post-Marriage Dynamics & In-Laws Relationship",
          focus: "8th house (family of spouse), 2nd from 7th, financial harmony as a couple, and domestic peace."
        },
        {
          chapterNumber: 8,
          title: "Sacred Vedic Remedies for Relationship Harmony",
          focus: "Specific mantras for Venus/Jupiter, fasting guidelines, Yantras, and behavioral remedies."
        },
        {
          chapterNumber: 9,
          title: "Executive Relationship Summary & AstroTring Action Plan",
          focus: "Comprehensive roadmap for entering and sustaining a blessed, enduring Vedic partnership."
        }
      ]
    }
  ],

  wealth: [
    {
      batch: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: "Executive Astrological Blueprint & Wealth Foundations",
          focus: "Ascendant vitality, 2nd house of treasury, 11th house of profits, and Dhana karaka Jupiter."
        },
        {
          chapterNumber: 2,
          title: "Classical Dhana Yogas, Lakshmi Yoga & Indu Lagna",
          focus: "Rare wealth combinations, 1st-5th-9th-11th lord connections, and Indu Lagna asset multiplier."
        },
        {
          chapterNumber: 3,
          title: "Hora (D-2) Divisional Chart Breakdown & Financial Archetype",
          focus: "Sun vs Moon Hora allocations, capacity for hard cash accumulation, and wealth risk appetite."
        }
      ]
    },
    {
      batch: 2,
      chapters: [
        {
          chapterNumber: 4,
          title: "Real Estate, Fixed Assets & Speculative Markets",
          focus: "4th house property indicators, Mars strength, 5th house stock/crypto speculative aptitude."
        },
        {
          chapterNumber: 5,
          title: "5-Year Wealth & Investment Timing Timeline (2026–2031)",
          focus: "Vimshottari Dasha windows for asset acquisitions, business investments, and liquid capital surges."
        },
        {
          chapterNumber: 6,
          title: "Expenditure Vulnerabilities & 12th House Leakage Analysis",
          focus: "12th house Vyaya Bhava analysis, Rahu traps, debt avoidance, and wealth retention strategies."
        }
      ]
    },
    {
      batch: 3,
      chapters: [
        {
          chapterNumber: 7,
          title: "Generational Prosperity & Karmic Wealth Preservation",
          focus: "9th house Bhagya Bhava, inheritance potential, and building enduring generational family wealth."
        },
        {
          chapterNumber: 8,
          title: "Sacred Vedic Wealth Remedies & Dana Rituals",
          focus: "Shree Suktam, Kubera mantra, gemstones for 2nd/11th lords, and strategic philanthropic donations."
        },
        {
          chapterNumber: 9,
          title: "Executive Artha Sutram Financial Roadmap",
          focus: "Actionable 5-year quarter-by-quarter financial roadmap and affirmative Vedic wealth blueprint."
        }
      ]
    }
  ],

  personality: [
    {
      batch: 1,
      chapters: [
        {
          chapterNumber: 1,
          title: "Core Astrological Identity & Lagna Profile",
          focus: "Ascendant sign, rising degree, lagnesha dignity, and innate life orientation."
        },
        {
          chapterNumber: 2,
          title: "Mental Temperament & Emotional Architecture (Chandra)",
          focus: "Moon sign, Moon nakshatra, emotional security needs, and instinctual response patterns."
        },
        {
          chapterNumber: 3,
          title: "Cognitive Intelligence, Mercury & Learning Strengths",
          focus: "Budhaditya yoga, Mercury dignity, 5th house intellect, and learning archetype."
        }
      ]
    },
    {
      batch: 2,
      chapters: [
        {
          chapterNumber: 4,
          title: "Creative Expression, Intuition & Hidden Talents",
          focus: "Jupiter's wisdom, Venusian aesthetic instincts, and subconscious psychic or spiritual gifts."
        },
        {
          chapterNumber: 5,
          title: "Communication Style & Interpersonal Dynamics",
          focus: "3rd house courage and expression, 2nd house speech (Vak Bhava), and social charisma."
        },
        {
          chapterNumber: 6,
          title: "Karmic Blindspots & Emotional Vulnerabilities",
          focus: "Saturn lessons, Rahu-Ketu axis dilemmas, and overcoming self-limiting mental conditioning."
        }
      ]
    },
    {
      batch: 3,
      chapters: [
        {
          chapterNumber: 7,
          title: "Spiritual Evolution & Higher Purpose",
          focus: "9th house dharma, 12th house moksha, and the Atmakaraka soul lesson."
        },
        {
          chapterNumber: 8,
          title: "Sacred Vedic Remedies for Mental Clarity & Inner Peace",
          focus: "Pranayama, Meditation, Mantras for Moon/Mercury, and daily behavioral alignments."
        }
      ]
    }
  ]
};

/**
 * Resolves appropriate blueprint key based on report slug
 */
export const resolveBlueprintKey = (slug = '') => {
  const s = String(slug || '').toLowerCase();
  if (['career', 'job-or-business', 'business', 'govt-job', 'first-job', 'job-search'].includes(s)) {
    return 'career';
  }
  if (['marriage', 'love-style', 'ideal-partner', 'love-arrange', 'spouse', 'in-laws'].includes(s)) {
    return 'marriage';
  }
  if (['wealth', 'artha-sutram', 'billionaire'].includes(s)) {
    return 'wealth';
  }
  return 'personality';
};

/**
 * Generates a batch of report chapters via OpenAI in structured JSON.
 */
export const generateChapterBatch = async ({
  userName = 'Seeker',
  reportTitle = 'Deep Vedic Reading',
  reportSlug = 'career',
  astroSummary,
  chapters = [],
  batchIndex = 1
}) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_REPORT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName,
    temperature: 0.35,
    modelKwargs: {
      response_format: { type: 'json_object' }
    }
  });

  const chaptersPrompt = chapters.map((c) => `
Chapter ${c.chapterNumber}: "${c.title}"
Core Focus: ${c.focus}
Required Structure:
- astrometricSummary: A concise 2-sentence summary of the exact planetary placements, signs, and houses governing this chapter.
- paragraphs: Exactly 3 to 4 comprehensive, deeply insightful, literary paragraphs analyzing the native's chart with authentic Vedic terms (Lagna, Rashi, Dasha, Bhava, Nakshatra, Yoga, Gochara, etc.). Do not translate these Sanskrit terms. No generic fluff.
- timingDates: Key active dates or years (e.g. "Mid-2026 to Late-2028") based on the native's Dasha timeline.
- practicalRemedies: Array of 2-3 specific, constructive, actionable Vedic remedies (mantras, behavioral shifts, or charity).
- reflectionQuestion: A powerful contemplative question for the native to meditate on.
`).join('\n---\n');

  const systemMessage = new SystemMessage(
    `You are the Chief Vedic Astrologer at AstroTring, an elite scholar steeped in Sage Parashara's Brihat Parashara Hora Shastra and Sage Jaimini's Upadesha Sutras.
Your mission is to author deep, authoritative, chart-personalized chapters for an official 10-page master astrological report.

CRITICAL RULES:
1. Ground every single prediction and insight in the user's REAL planetary data provided below.
2. Maintain authentic Vedic astrological terminology in transliterated Sanskrit/Hindi (e.g., Lagna, Navamsa, Dasamsa, Mahadasha, Antardasha, Amatyakaraka, Darakaraka, Dhana Yoga, Sade Sati).
3. Do not engage in doom-mongering; maintain an empowering, dignified, deeply clarifying tone.
4. Output strictly valid JSON matching the schema below.`
  );

  const humanMessage = new HumanMessage(
    `Native's Name: ${userName}
Report Title: ${reportTitle}
Report Slug: ${reportSlug}

=== NATIVE'S VERIFIED ASTROLOGICAL DATA ===
- Ascendant (Lagna): ${astroSummary.ascendantSign}
- Moon Sign (Rashi): ${astroSummary.moonSign}
- Sun Sign: ${astroSummary.sunSign}
- Natal Placements (D-1): ${JSON.stringify(astroSummary.natalPlacements)}
- Dasamsa (D-10 Career Chart): ${JSON.stringify(astroSummary.d10Placements)}
- Navamsa (D-9 Marriage Chart): ${JSON.stringify(astroSummary.d9Placements)}
- Active Dasha: ${JSON.stringify(astroSummary.activeDasha)}
- Upcoming Dashas: ${JSON.stringify(astroSummary.upcomingDashas)}
- Detected Yogas: ${JSON.stringify(astroSummary.yogas)}
- Detected Doshas: ${JSON.stringify(astroSummary.doshas)}
- Jaimini Karakas: ${JSON.stringify(astroSummary.charaKarakas)}

=== CHAPTERS TO WRITE IN THIS BATCH (Batch ${batchIndex}) ===
${chaptersPrompt}

OUTPUT JSON SCHEMA:
{
  "chapters": [
    {
      "chapterNumber": number,
      "title": string,
      "astrometricSummary": string,
      "paragraphs": [string, string, string],
      "timingDates": string,
      "practicalRemedies": [string, string],
      "reflectionQuestion": string
    }
  ]
}`
  );

  const response = await llm.invoke([systemMessage, humanMessage]);
  const rawContent = response.content;

  try {
    const parsed = JSON.parse(rawContent);
    return Array.isArray(parsed.chapters) ? parsed.chapters : [];
  } catch (err) {
    console.error(`Error parsing chapter batch ${batchIndex}:`, err, rawContent);
    throw new Error(`Failed to parse chapter batch ${batchIndex} response from AI`);
  }
};
