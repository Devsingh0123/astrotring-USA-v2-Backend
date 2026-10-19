import { Annotation, StateGraph, START, END, MemorySaver, messagesStateReducer } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { vedicAstrologyService } from './vedicAstrologyService.js';
import { AppError } from '../utils/appError.js';

/**
 * ============================================================================
 * 1. IN-MEMORY CHECKPOINTER (LangGraph MemorySaver)
 * ============================================================================
 * Stores multi-turn conversation state in memory keyed by `thread_id`.
 * (Can be swapped with a persistent MySQL checkpointer later without changing graph logic.)
 */
export const chatCheckpointer = new MemorySaver();

// Track which thread_ids have already been hydrated in memory during this server process
const hydratedThreads = new Set();

/**
 * ============================================================================
 * 2. ASTRONOMICAL FACT SHEET SERIALIZER (Zero-Hallucination Grounding)
 * ============================================================================
 * Converts raw output from `vedicAstrologyService` / `BirthChart` into a
 * structured, deterministic text block for the Vaani system prompt.
 *
 * RULE: The AI is NEVER allowed to calculate planetary positions, houses, or dashas.
 * It may ONLY interpret the pre-calculated facts formatted here.
 */
const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
];

/**
 * Deterministically computes Whole-Sign House number (1 to 12) from Ascendant sign and Planet sign.
 */
const getWholeSignHouse = (ascendantSign, planetSign) => {
  const ascIdx = ZODIAC_SIGNS.findIndex((s) => s.toLowerCase() === (ascendantSign || '').toLowerCase());
  const planetIdx = ZODIAC_SIGNS.findIndex((s) => s.toLowerCase() === (planetSign || '').toLowerCase());
  if (ascIdx === -1 || planetIdx === -1) return null;
  return ((planetIdx - ascIdx + 12) % 12) + 1;
};

/**
 * Formats a divisional chart object (e.g. D-1 Rasi, D-9 Navamsa, D-10 Dasamsa)
 * into clean bullet lines with exact sign, house, degree, nakshatra, and retrograde status.
 */
const formatDivisionalChart = (chartObj, ascendantSign, nakshatraMap = {}, includeHouse = true) => {
  if (!chartObj || typeof chartObj !== 'object') return 'Not available';

  const planetsOrder = [
    'Ascendant', 'Sun', 'Moon', 'Mars', 'Mercury',
    'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'
  ];

  const lines = [];
  for (const body of planetsOrder) {
    const data = chartObj[body];
    if (!data || typeof data !== 'object') continue;

    const sign = data.sign || 'Unknown';
    const house = includeHouse ? (data.house || getWholeSignHouse(ascendantSign, sign)) : null;
    const degree = typeof data.longitude === 'number'
      ? `${data.longitude.toFixed(2)}°`
      : (typeof data.degree === 'number' ? `${data.degree.toFixed(2)}°` : '');

    const nakInfo = nakshatraMap?.[body];
    const nakStr = nakInfo?.nakshatra
      ? `, Nakshatra: ${nakInfo.nakshatra} (Pada ${nakInfo.pada || '-'}, Lord: ${nakInfo.nakshatra_lord || '-'})`
      : '';

    const retroStr = data.is_retrograde || data.retrograde ? ' [RETROGRADE]' : '';

    lines.push(
      `- ${body}: Sign = ${sign}${house ? `, House = ${house}` : ''}${degree ? `, Longitude = ${degree}` : ''}${nakStr}${retroStr}`
    );
  }

  return lines.length > 0 ? lines.join('\n') : JSON.stringify(chartObj);
};

/**
 * Formats the Vimshottari Dasha timeline so the AI knows past, current, and future periods with exact dates.
 */
const formatDashaTimeline = (dashasObj) => {
  if (!dashasObj || typeof dashasObj !== 'object') return 'Not available';

  try {
    const vims = dashasObj.vimsottari;
    if (Array.isArray(vims) && vims.length > 0) {
      const now = new Date();
      const currentIdx = vims.findIndex(([_, endDate]) => new Date(endDate) > now);

      const lines = [];
      if (currentIdx !== -1) {
        const cur = vims[currentIdx];
        const [curPeriod, curEnd] = cur;
        const [mahadasha, antardasha, pratyantar] = curPeriod.split('-');

        lines.push(`ACTIVE CURRENT PERIOD (as of ${now.toISOString().split('T')[0]}):`);
        lines.push(`- Mahadasha: ${mahadasha}`);
        lines.push(`- Antardasha: ${antardasha}`);
        lines.push(`- Pratyantardasha: ${pratyantar} (Active until: ${curEnd})`);
        lines.push('');

        lines.push('UPCOMING SEQUENTIAL PERIODS (EXACT TIMING):');
        const upcoming = vims.slice(currentIdx + 1, currentIdx + 9);
        upcoming.forEach(([period, endDate], idx) => {
          lines.push(`  ${idx + 1}) ${period} -> Concludes: ${endDate}`);
        });
        lines.push('');
      }

      // Also summarize the major Mahadasha boundaries
      const mahadashaSummary = [];
      const seenMahadashas = new Set();
      for (const [period, endDate] of vims) {
        const md = period.split('-')[0];
        if (!seenMahadashas.has(md)) {
          seenMahadashas.add(md);
          mahadashaSummary.push(`- ${md} Mahadasha cycle up to ~${endDate.split(' ')[0]}`);
        }
      }
      lines.push('FULL LIFETIME MAHADASHAS SEQUENCE:');
      lines.push(...mahadashaSummary.slice(0, 9));

      return lines.join('\n');
    }

    // Fallback if structured differently
    return JSON.stringify(dashasObj, null, 2).slice(0, 3000);
  } catch {
    return 'Not available';
  }
};

/**
 * Builds the complete Astronomical Fact Sheet string for a user's birth chart + live transits.
 */
export const buildAstronomicalFactSheet = ({ birthDetail, chartRecord, gocharaData }) => {
  // Safely parse chart_data in case it was stored as a stringified JSON column in MySQL
  const rawChartData = chartRecord?.chart_data;
  let chartData = {};
  if (typeof rawChartData === 'string') {
    try {
      chartData = JSON.parse(rawChartData);
    } catch {
      chartData = {};
    }
  } else if (rawChartData && typeof rawChartData === 'object') {
    chartData = rawChartData;
  }

  const rawHoroscope = chartData.raw || {};
  const summary = chartData.summary || {};
  const nakshatraMap = rawHoroscope.nakshatra_pada || {};

  const ascSign = summary.ascendantSign || chartRecord?.ascendant_sign || chartData.rasiChart?.Ascendant?.sign;
  const moonSign = summary.moonSign || chartRecord?.moon_sign || chartData.rasiChart?.Moon?.sign;
  const sunSign = summary.sunSign || chartRecord?.sun_sign || chartData.rasiChart?.Sun?.sign;
  const moonNakshatra = summary.nakshatra || chartRecord?.nakshatra || nakshatraMap?.Moon?.nakshatra;
  const moonPada = summary.pada || chartRecord?.nakshatra_pada || nakshatraMap?.Moon?.pada;
  const nakshatraLord = summary.nakshatraLord || nakshatraMap?.Moon?.nakshatra_lord;

  // D-1 Rasi Whole-Sign Houses
  const d1Text = formatDivisionalChart(chartData.rasiChart, ascSign, nakshatraMap, true);

  // D-9 Navamsa Whole-Sign Houses (calculated relative to Navamsa Ascendant)
  const d9AscSign = chartData.navamsaChart?.Ascendant?.sign || ascSign;
  const d9Text = formatDivisionalChart(chartData.navamsaChart, d9AscSign, {}, true);

  // D-10 Dasamsa Whole-Sign Houses (calculated relative to Dasamsa Ascendant)
  const d10AscSign = chartData.dasamsaChart?.Ascendant?.sign || ascSign;
  const d10Text = formatDivisionalChart(chartData.dasamsaChart, d10AscSign, {}, true);

  // Active Dasha Timeline with exact dates
  const dashaText = formatDashaTimeline(chartData.dashas);

  const yogasText = chartData.yogas ? JSON.stringify(chartData.yogas, null, 2) : 'None listed';
  const doshasText = chartData.doshas ? JSON.stringify(chartData.doshas, null, 2) : 'None listed';
  const charaKarakasText = chartData.charaKarakas ? JSON.stringify(chartData.charaKarakas, null, 2) : 'Not available';
  const gocharaText = gocharaData ? JSON.stringify(gocharaData).slice(0, 2500) : 'Not available';

  return `
=== VERIFIED NATAL CHART & ASTRONOMICAL FACT SHEET ===
Native Name: ${birthDetail?.full_name || chartRecord?.person_name || 'Seeker'}
Gender: ${birthDetail?.gender || chartRecord?.gender || 'Not specified'}
Date of Birth: ${birthDetail?.date_of_birth || chartRecord?.date_of_birth}
Time of Birth: ${birthDetail?.time_of_birth || chartRecord?.time_of_birth} (Time Unknown: ${Boolean(birthDetail?.is_time_unknown || chartRecord?.is_time_unknown)})
Birth Place: ${birthDetail?.birth_city || chartRecord?.birth_city} (Lat: ${birthDetail?.latitude || chartRecord?.latitude}, Lon: ${birthDetail?.longitude || chartRecord?.longitude}, TZ: ${birthDetail?.timezone || chartRecord?.timezone})
Today's Date (UTC): ${new Date().toISOString().split('T')[0]}

--- 1. CORE CHART SUMMARY ---
- Rising Ascendant (Udaya Lagna): ${ascSign} (${summary.ascendantDegree ? Number(summary.ascendantDegree).toFixed(2) + '°' : ''})
- Moon Sign (Chandra Rashi): ${moonSign} (${summary.moonDegree ? Number(summary.moonDegree).toFixed(2) + '°' : ''})
- Sun Sign (Surya Rashi): ${sunSign}
- Birth Nakshatra (Janma Nakshatra): ${moonNakshatra}, Pada ${moonPada} (Nakshatra Lord: ${nakshatraLord})

--- 2. D-1 RASI CHART (MAIN BIRTH CHART — WHOLE SIGN HOUSES FROM ${ascSign?.toUpperCase() || 'LAGNA'}) ---
${d1Text}

--- 3. D-9 NAVAMSA CHART (MARRIAGE, SPOUSE, DHARMA & INTRINSIC STRENGTH — WHOLE SIGN HOUSES FROM ${d9AscSign?.toUpperCase() || 'NAVAMSA LAGNA'}) ---
${d9Text}

--- 4. D-10 DASAMSA CHART (CAREER, PROFESSION & REPUTATION — WHOLE SIGN HOUSES FROM ${d10AscSign?.toUpperCase() || 'DASAMSA LAGNA'}) ---
${d10Text}

--- 5. VIMSHOTTARI DASHA PERIODS (PRE-CALCULATED WITH EXACT TIMING) ---
${dashaText}

--- 6. JAIMINI CHARA KARAKAS ---
${charaKarakasText}

--- 7. PRE-CALCULATED YOGAS & DOSHAS ---
Yogas:
${yogasText}
Doshas:
${doshasText}

--- 8. CURRENT GOCHARA (PLANETARY TRANSITS FOR TODAY) ---
${gocharaText}
======================================================
`.trim();
};

/**
 * ============================================================================
 * 3. SYSTEM PROMPTS FOR VAANI & ASTROPEDIA
 * ============================================================================
 */
const buildVaaniSystemPrompt = (userName, chartFactSheet) => {
  const firstName = (userName || 'Seeker').split(' ')[0];

  return `You are **Vaani**, AstroTring's personal Vedic astrologer. You are speaking directly to ${firstName}.

### STRICT NON-HALLUCINATION RULES (CRITICAL)
1. **NEVER CALCULATE OR GUESS**: You must NEVER compute, guess, or invent any planetary sign, house number, degree, nakshatra, yoga, dosha, or dasha date on your own.
2. **ONLY INTERPRET PROVIDED FACTS**: Every single astrological placement, house number, nakshatra, and dasha date you mention MUST come verbatim from the "VERIFIED NATAL CHART & ASTRONOMICAL FACT SHEET" below.
3. **LANGUAGE RULE**: If the user asks in Hindi or Hinglish (e.g. "Meri shaadi kab hogi?"), respond in natural, warm, and fluent Hindi or Hinglish matching their tone, while retaining authentic Sanskrit Vedic terms (Lagna, Rashi, 7th house, Shukra, Shani, Dasha, Navamsa). If they ask in English, respond in English.
4. **DOMAIN FOCUS**:
   - For marriage/relationship questions: inspect the 7th house (from Lagna, Moon, and Venus), 7th house lord, Venus (Shukra - karaka of marriage), Jupiter (Guru), D-9 Navamsa placements, and the active/upcoming Vimshottari Dasha periods (especially Venus, Jupiter, or 7th lord sub-periods).
   - For career/wealth questions: inspect the 10th house, 2nd house, 11th house, D-10 Dasamsa, active Dasha, and transits.
5. **TONE & STYLE**:
   - Address ${firstName} directly by first name in the first paragraph.
   - Write with incisive clarity, warmth, and specificity (like a master Vedic jyotishi who sees right to the heart of the chart).
   - Avoid vague horoscope clichés. Cite specific planets, houses, signs, nakshatras, and active dasha dates from the fact sheet.
   - End the final paragraph with a thoughtful, chart-specific follow-up question or actionable insight.

${chartFactSheet}

### REQUIRED JSON OUTPUT FORMAT
You must respond ONLY with a valid JSON object matching this exact schema (no markdown code fences around the JSON):
{
  "openingThought": "A 1-sentence italicized opening observation addressing ${firstName} and naming the primary house/planet governing their question.",
  "thinkingSteps": [
    "Short status badge 1 (e.g., 'Reading your ${firstName}'s D-1 Rasi and D-9 Navamsa charts')",
    "Short status badge 2 (e.g., 'Evaluating active Mahadasha and current Gochara transits')"
  ],
  "paragraphs": [
    "Paragraph 1: Direct, personal headline answer addressing ${firstName} and citing the primary planetary configuration.",
    "Paragraph 2: Deeper synthesis of house lordships, aspects, or divisional chart (D9/D10) confirmation from the fact sheet.",
    "Paragraph 3: Psychological or practical pattern shown by the chart and how to navigate it.",
    "Paragraph 4: Exact timing insight based on the active Mahadasha/Antardasha and Gochara transits from the fact sheet."
  ],
  "astrologyBehind": [
    "1) Planet, Sign, House (birth chart): concise explanation of how this placement shapes the answer",
    "2) Planet/House or Divisional Chart (D9/D10): concise explanation",
    "3) Active Mahadasha/Antardasha (exact dates): concise explanation of timing",
    "4) Nakshatra or Transit influence: concise explanation"
  ],
  "suggestedQuestions": [
    "Specific follow-up question 1 tailored to their chart?",
    "Specific follow-up question 2 tailored to their chart?",
    "Specific follow-up question 3 tailored to their chart?",
    "Specific follow-up question 4 tailored to their chart?"
  ]
}`;
};

const buildAstropediaSystemPrompt = () => {
  return `You are **Astropedia**, AstroTring's Universal Vedic Astrology Encyclopedia.

### ROLE & RULES
1. You answer general questions about Vedic astrology (Jyotish): planets (Grahas), rashis (signs), bhavas (houses), nakshatras, yogas, doshas (Sade Sati, Mangal Dosha, Kaal Sarp, etc.), dasha systems, compatibility (Ashtakoota), panchang, muhurta, and classical remedies.
2. Ground your explanations in authentic classical Sanskrit treatises: *Brihat Parashara Hora Shastra (BPHS)*, *Phaladeepika*, *Brihat Samhita*, *Jataka Parijata*, *Saravali*, and *Jaimini Upadesa Sutras*.
3. Do NOT pretend to read the user's personal birth chart in Astropedia mode. Explain universal Vedic principles clearly, scholarly, and practically.

### REQUIRED JSON OUTPUT FORMAT
You must respond ONLY with a valid JSON object matching this exact schema (no markdown code fences around the JSON):
{
  "openingThought": "A 1-sentence scholarly opening note describing the classical principle being examined (e.g., 'Consulting classical distinctions between Udaya Lagna and Chandra Lagna...').",
  "thinkingSteps": [
    "Short status badge 1 (e.g., 'Referencing Brihat Parashara Hora Shastra')",
    "Short status badge 2 (e.g., 'Cross-referencing Phaladeepika commentaries')"
  ],
  "paragraphs": [
    "Paragraph 1: Clear definition and core concept in classical Vedic astrology.",
    "Paragraph 2: Detailed breakdown of how the principle, yoga, or dasha operates mechanically.",
    "Paragraph 3: Nuances, exceptions/cancellations (Bhanga), or practical application.",
    "Paragraph 4: Summary of how a jyotishi synthesizes this factor with the rest of a chart."
  ],
  "astrologyBehind": [
    "1) Brihat Parashara Hora Shastra (BPHS): specific classical rule or chapter reference",
    "2) Phaladeepika / Brihat Samhita: classical commentary or evaluation criterion",
    "3) Technical Mechanism: how signs, houses, or bindus modify the result",
    "4) Classical Mitigation / Application: traditional remedies or interpretive synthesis"
  ],
  "suggestedQuestions": [
    "Related Vedic astrology question 1?",
    "Related Vedic astrology question 2?",
    "Related Vedic astrology question 3?",
    "Related Vedic astrology question 4?"
  ]
}`;
};

/**
 * ============================================================================
 * 4. LANGGRAPH STATE & WORKFLOW DEFINITION
 * ============================================================================
 */
const ChatStateAnnotation = Annotation.Root({
  // Standard LangGraph message list reducer (appends new HumanMessage / AIMessage turns)
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  }),
  engine: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 'vaani'
  }),
  userName: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 'Seeker'
  }),
  chartFactSheet: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => ''
  }),
  // Structured output parsed from the latest AI turn
  latestReading: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => null
  }),
  tokensUsed: Annotation({
    reducer: (prev, next) => next ?? prev,
    default: () => 0
  })
});

/**
 * Safely parses JSON from the model output, with a graceful fallback if the model
 * ever wraps JSON in markdown fences.
 */
const parseStructuredReading = (rawText, userName, engine) => {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      openingThought: parsed.openingThought || (engine === 'vaani'
        ? `Analyzing your natal chart placements, ${(userName || 'Seeker').split(' ')[0]}...`
        : 'Consulting classical Vedic astrology treatises...'),
      thinkingSteps: Array.isArray(parsed.thinkingSteps) && parsed.thinkingSteps.length > 0
        ? parsed.thinkingSteps
        : (engine === 'vaani'
          ? ['Reading your D-1 Rasi & D-9 Navamsa charts', 'Evaluating active Vimshottari Dasha']
          : ['Referencing Brihat Parashara Hora Shastra', 'Synthesizing classical commentaries']),
      paragraphs: Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0
        ? parsed.paragraphs
        : [rawText],
      astrologyBehind: Array.isArray(parsed.astrologyBehind) ? parsed.astrologyBehind : [],
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions.slice(0, 4) : []
    };
  } catch {
    // Fallback if model returned plain text instead of JSON
    const paragraphs = rawText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    return {
      openingThought: engine === 'vaani'
        ? `Reading your birth chart placements, ${(userName || 'Seeker').split(' ')[0]}...`
        : 'Consulting classical Vedic texts and treatises...',
      thinkingSteps: engine === 'vaani'
        ? ['Reading your birth chart', 'Synthesizing planetary strengths & dashas']
        : ['Consulting Brihat Parashara Hora Shastra', 'Cross-referencing classical sutras'],
      paragraphs: paragraphs.length > 0 ? paragraphs : [rawText],
      astrologyBehind: [],
      suggestedQuestions: []
    };
  }
};

/**
 * Node: `generateReadingNode`
 * - Builds the full message array (SystemPrompt + multi-turn conversation history)
 * - Calls OpenAI with streaming enabled
 * - Emits live SSE token events via `config.configurable.onToken`
 * - Appends the assistant's reply to LangGraph's `messages` state for future turns
 */
const generateReadingNode = async (state, config) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new AppError('OpenAI API key is not configured. Please set OPENAI_API_KEY in backend/.env.', 500);
  }

  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const onToken = config?.configurable?.onToken;
  const onThinking = config?.configurable?.onThinking;

  if (onThinking) {
    onThinking(
      state.engine === 'vaani'
        ? 'Synthesizing your lagna, planetary strengths, and active dasha...'
        : 'Searching Brihat Parashara Hora Shastra & classical commentaries...'
    );
  }

  const systemPrompt = state.engine === 'vaani'
    ? buildVaaniSystemPrompt(state.userName, state.chartFactSheet)
    : buildAstropediaSystemPrompt();

  const llm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName,
    temperature: 0.4, // Low temperature for faithful chart adherence
    streaming: true,
    modelKwargs: {
      response_format: { type: 'json_object' }
    }
  });

  // Combine system instructions with the thread's multi-turn message history
  const promptMessages = [
    new SystemMessage(systemPrompt),
    ...state.messages
  ];

  let fullJsonResponse = '';
  let tokensUsed = 0;

  const stream = await llm.stream(promptMessages);

  for await (const chunk of stream) {
    const textDelta = typeof chunk.content === 'string' ? chunk.content : '';
    if (textDelta) {
      fullJsonResponse += textDelta;
      if (onToken) {
        onToken(textDelta);
      }
    }
    if (chunk.usage_metadata?.total_tokens) {
      tokensUsed = chunk.usage_metadata.total_tokens;
    }
  }

  // Parse the completed JSON into the structured reading format expected by the frontend
  const structuredReading = parseStructuredReading(fullJsonResponse, state.userName, state.engine);

  // Store a clean, readable plain-text summary in LangGraph's AIMessage history
  // so subsequent follow-up turns in the same thread have concise conversational memory
  const cleanHistoryText = structuredReading.paragraphs.join('\n\n');

  return {
    messages: [new AIMessage(cleanHistoryText)],
    latestReading: structuredReading,
    tokensUsed
  };
};

// Assemble and compile the LangGraph StateGraph with MemorySaver
const workflow = new StateGraph(ChatStateAnnotation)
  .addNode('generateReading', generateReadingNode)
  .addEdge(START, 'generateReading')
  .addEdge('generateReading', END);

export const chatGraph = workflow.compile({
  checkpointer: chatCheckpointer
});

/**
 * ============================================================================
 * 5. PUBLIC SERVICE API (`chatService`)
 * ============================================================================
 */
export const chatService = {
  /**
   * Ensures a user's birth chart and live Gochara transits are loaded and formatted
   * into a deterministic Astronomical Fact Sheet for Vaani.
   */
  async prepareVaaniChartContext({ birthDetail, chartRecord }) {
    let activeChart = chartRecord;

    const birthParams = {
      date: birthDetail?.date_of_birth || chartRecord?.date_of_birth,
      time: birthDetail?.time_of_birth || chartRecord?.time_of_birth || '12:00:00',
      place: birthDetail?.birth_city || chartRecord?.birth_city || 'Birth City',
      latitude: Number(birthDetail?.latitude ?? chartRecord?.latitude),
      longitude: Number(birthDetail?.longitude ?? chartRecord?.longitude),
      timezone: Number(birthDetail?.timezone ?? chartRecord?.timezone),
      gender: birthDetail?.gender || chartRecord?.gender || 'male'
    };

    // If for any reason chart_data is missing, compute it via vedicAstrologyService
    if (!activeChart?.chart_data) {
      const computed = await vedicAstrologyService.getHoroscope(birthParams);
      activeChart = {
        ...(activeChart?.toJSON ? activeChart.toJSON() : activeChart),
        chart_data: computed
      };
    }

    // Fetch current Gochara transits (cached for 1h in vedicAstrologyService)
    let gocharaData = null;
    try {
      gocharaData = await vedicAstrologyService.getGochara(birthParams);
    } catch {
      // Non-fatal if transit service is temporarily unreachable; natal chart still has full data
      gocharaData = null;
    }

    return buildAstronomicalFactSheet({
      birthDetail,
      chartRecord: activeChart,
      gocharaData
    });
  },

  /**
   * Runs a single conversational turn through the stateful LangGraph workflow.
   *
   * @param {Object} params
   * @param {string} params.threadId - UUID of the ChatThread
   * @param {string} params.engine - 'vaani' | 'astropedia'
   * @param {string} params.question - User's question text
   * @param {string} params.userName - User's full name (for Vaani personalization)
   * @param {string} params.chartFactSheet - Pre-calculated astronomical fact sheet (for Vaani)
   * @param {Array}  params.priorMessages - Prior DB messages to hydrate MemorySaver if server restarted
   * @param {Function} params.onThinking - Callback(stepText) for SSE thinking events
   * @param {Function} params.onToken - Callback(tokenDelta) for SSE token events
   */
  async runChatTurn({
    threadId,
    engine = 'vaani',
    question,
    userName = 'Seeker',
    chartFactSheet = '',
    priorMessages = [],
    onThinking,
    onToken
  }) {
    const historyToInject = [];

    // If this thread existed in MySQL before a server restart, hydrate its history into MemorySaver once
    if (!hydratedThreads.has(threadId) && priorMessages.length > 0) {
      for (const msg of priorMessages) {
        if (msg.role === 'user') {
          historyToInject.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          historyToInject.push(new AIMessage(msg.content));
        }
      }
    }
    hydratedThreads.add(threadId);

    // Append the current user question
    historyToInject.push(new HumanMessage(question));

    const graphResult = await chatGraph.invoke(
      {
        messages: historyToInject,
        engine,
        userName,
        chartFactSheet
      },
      {
        configurable: {
          thread_id: threadId,
          onThinking,
          onToken
        }
      }
    );

    return {
      reading: graphResult.latestReading,
      tokensUsed: graphResult.tokensUsed || 0
    };
  }
};
