import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { vaaniGraph, vaaniCheckpointer } from "../ai/graph.js";
import { buildUserChartSummary } from "../ai/prompts.js";
import { vedicAstrologyService } from "./vedicAstrologyService.js";

// Tracks thread_ids hydrated in memory across server restarts
const hydratedThreads = new Set();

export const chatService = {
  /**
   * Prepares the user's birth chart, birth parameters, and a lightweight 5-line summary.
   * Full charts, dashas, yogas, strengths, and transits are fetched on-demand
   * by Vaani via tool calls rather than dumped into the prompt.
   */
  async prepareVaaniChartContext({ birthDetail, chartRecord }) {
    let activeChart = chartRecord;

    const birthParams = {
      date: birthDetail?.date_of_birth || chartRecord?.date_of_birth,
      time:
        birthDetail?.time_of_birth || chartRecord?.time_of_birth || "12:00:00",
      place: birthDetail?.birth_city || chartRecord?.birth_city || "Birth City",
      latitude: Number(birthDetail?.latitude ?? chartRecord?.latitude),
      longitude: Number(birthDetail?.longitude ?? chartRecord?.longitude),
      timezone: Number(birthDetail?.timezone ?? chartRecord?.timezone),
      gender: birthDetail?.gender || chartRecord?.gender || "male",
    };

    // If chart_data is not yet stored, calculate it via vedicAstrologyService
    if (!activeChart?.chart_data) {
      const computed = await vedicAstrologyService.getHoroscope(birthParams);
      activeChart = {
        ...(activeChart?.toJSON ? activeChart.toJSON() : activeChart),
        chart_data: computed,
      };
    }

    const rawChartData = activeChart.chart_data;
    let chartData = {};
    if (typeof rawChartData === "string") {
      try {
        chartData = JSON.parse(rawChartData);
      } catch {
        chartData = {};
      }
    } else if (rawChartData && typeof rawChartData === "object") {
      chartData = rawChartData;
    }

    const userSummary = buildUserChartSummary({
      birthDetail,
      chartRecord: activeChart,
      chartData,
    });

    return {
      chartData,
      birthParams,
      userSummary,
    };
  },

  /**
   * Runs a single conversational turn through the stateful LangGraph workflow.
   *
   * @param {Object} params
   * @param {string} params.threadId - UUID of the ChatThread
   * @param {string} params.engine - 'vaani' | 'astropedia'
   * @param {string} params.question - User's question text
   * @param {string} params.userName - User's full name (for Vaani personalization)
   * @param {string} [params.userSummary] - Lightweight 5-line core profile
   * @param {Object} [params.chartData] - User's raw horoscope data for tool inspection
   * @param {Object} [params.birthParams] - User's birth coordinates for live transit tools
   * @param {Array}  [params.priorMessages] - Prior DB messages to hydrate MemorySaver if server restarted
   * @param {Function} [params.onThinking] - Callback(stepText) for SSE thinking events
   * @param {Function} [params.onToken] - Callback(tokenDelta) for SSE token events
   */
  async runChatTurn({
    threadId,
    engine = "vaani",
    question,
    userName = "Seeker",
    userSummary = "",
    chartFactSheet = "",
    chartData = null,
    birthParams = null,
    priorMessages = [],
    onThinking,
    onToken,
  }) {
    const historyToInject = [];

    // Hydrate prior messages from MySQL into MemorySaver once per server lifetime
    if (
      !hydratedThreads.has(threadId) &&
      Array.isArray(priorMessages) &&
      priorMessages.length > 0
    ) {
      for (const msg of priorMessages) {
        if (msg.role === "user") {
          historyToInject.push(new HumanMessage(msg.content));
        } else if (msg.role === "assistant") {
          historyToInject.push(new AIMessage(msg.content));
        }
      }
    }
    hydratedThreads.add(threadId);

    historyToInject.push(new HumanMessage(question));

    const graphResult = await vaaniGraph.invoke(
      {
        messages: historyToInject,
        engine,
        userName,
        userSummary: userSummary || chartFactSheet,
        chartData,
        birthParams,
      },
      {
        configurable: {
          thread_id: threadId,
          onThinking,
          onToken,
        },
      },
    );

    return {
      reading: graphResult.latestReading,
      tokensUsed: graphResult.tokensUsed || 0,
    };
  },
};
