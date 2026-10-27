import { ChatOpenAI } from '@langchain/openai';
import { SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { createJyotishTools } from './tools.js';
import { buildJyotishSystemPrompt, buildShastraSystemPrompt } from './prompts.js';
import { AppError } from '../utils/appError.js';

const MAX_TOOL_ROUNDS_PER_TURN = 2;

/**
 * Formats a human-readable SSE thinking status badge for a tool call.
 */
const formatToolThinkingMessage = (toolName, args = {}) => {
  switch (toolName) {
    case 'get_divisional_chart':
      return `Inspecting your ${args.varga || 'D-1'} divisional chart placements...`;
    case 'get_dasha':
      return args.targetYear
        ? `Analyzing your Vimshottari Dasha timeline for ${args.targetYear}...`
        : 'Analyzing your active and upcoming Vimshottari Dasha periods...';
    case 'get_yogas_and_doshas':
      return 'Checking classical Vedic Yogas, Doshas, and Sade Sati...';
    case 'get_strengths_and_karakas':
      return 'Evaluating planetary Shadbala strengths, Ashtakavarga, and Jaimini Karakas...';
    case 'get_transits_and_muhurta':
      return `Checking live ${args.queryType?.replace(/_/g, ' ') || 'planetary transits'}...`;
    default:
      return 'Consulting your Vedic birth chart...';
  }
};

/**
 * Counts how many tool-calling rounds have occurred since the latest HumanMessage.
 */
const countToolRoundsInCurrentTurn = (messages = []) => {
  let rounds = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgType = typeof msg._getType === 'function' ? msg._getType() : msg.role;
    if (msgType === 'human' || msgType === 'user') break;
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      rounds += 1;
    }
  }
  return rounds;
};

/**
 * Safely parses JSON from the model's final output, with a graceful fallback
 * if the model wraps JSON in markdown code fences.
 */
export const parseStructuredReading = (rawText, userName, engine) => {
  const firstName = (userName || 'Seeker').split(' ')[0];

  try {
    const cleaned = String(rawText || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      openingThought:
        parsed.openingThought ||
        (engine === 'jyotish'
          ? `Analyzing your natal chart placements, ${firstName}...`
          : 'Consulting classical Vedic astrology treatises...'),
      thinkingSteps:
        Array.isArray(parsed.thinkingSteps) && parsed.thinkingSteps.length > 0
          ? parsed.thinkingSteps
          : engine === 'jyotish'
            ? ['Inspected your divisional charts', 'Evaluated active Vimshottari Dasha']
            : ['Referenced Brihat Parashara Hora Shastra', 'Synthesized classical commentaries'],
      paragraphs:
        Array.isArray(parsed.paragraphs) && parsed.paragraphs.length > 0
          ? parsed.paragraphs
          : [String(rawText || '')],
      astrologyBehind: Array.isArray(parsed.astrologyBehind) ? parsed.astrologyBehind : [],
      suggestedQuestions: Array.isArray(parsed.suggestedQuestions)
        ? parsed.suggestedQuestions.slice(0, 4)
        : []
    };
  } catch {
    const paragraphs = String(rawText || '')
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    return {
      openingThought:
        engine === 'jyotish'
          ? `Reading your birth chart placements, ${firstName}...`
          : 'Consulting classical Vedic texts and treatises...',
      thinkingSteps:
        engine === 'jyotish'
          ? ['Inspected your birth chart', 'Synthesized planetary strengths & dashas']
          : ['Consulted Brihat Parashara Hora Shastra', 'Cross-referenced classical sutras'],
      paragraphs: paragraphs.length > 0 ? paragraphs : [String(rawText || '')],
      astrologyBehind: [],
      suggestedQuestions: []
    };
  }
};

/**
 * Node 1: `agentNode`
 * - In `jyotish` mode, binds the 5 Vedic astrology tools so the model can fetch
 *   exact chart slices (divisional charts, dashas, yogas, strengths, transits).
 * - Once tool calls are complete (or immediately in `shastra` mode), streams
 *   the final structured JSON reading and emits live SSE tokens.
 */
export const agentNode = async (state, config) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new AppError(
      'OpenAI API key is not configured. Please set OPENAI_API_KEY in backend/.env.',
      500
    );
  }

  const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const onToken = config?.configurable?.onToken;
  const onThinking = config?.configurable?.onThinking;

  const isJyotishMode = state.engine === 'jyotish';
  const toolRounds = countToolRoundsInCurrentTurn(state.messages);

  if (toolRounds === 0 && onThinking) {
    onThinking(
      isJyotishMode
        ? 'Reviewing your core birth profile and selecting chart tools...'
        : 'Searching Brihat Parashara Hora Shastra & classical commentaries...'
    );
  }

  const systemPrompt = isJyotishMode
    ? buildJyotishSystemPrompt(state.userName, state.userSummary)
    : buildShastraSystemPrompt();

  const baseLlm = new ChatOpenAI({
    openAIApiKey: apiKey,
    modelName,
    temperature: 0.3,
    streaming: true,
    modelKwargs: {
      response_format: { type: 'json_object' }
    }
  });

  // Bind tools in Jyotish mode as long as we haven't exceeded the max tool rounds per turn
  const allowToolCalls = isJyotishMode && state.chartData && toolRounds < MAX_TOOL_ROUNDS_PER_TURN;
  const activeLlm = allowToolCalls
    ? baseLlm.bindTools(
        createJyotishTools({
          chartData: state.chartData,
          birthParams: state.birthParams || {}
        })
      )
    : baseLlm;

  const promptMessages = [new SystemMessage(systemPrompt), ...state.messages];

  let aggregatedChunk = null;
  let fullJsonResponse = '';
  let tokensUsedInPass = 0;

  const stream = await activeLlm.stream(promptMessages);

  for await (const chunk of stream) {
    aggregatedChunk = aggregatedChunk ? aggregatedChunk.concat(chunk) : chunk;

    const textDelta = typeof chunk.content === 'string' ? chunk.content : '';
    if (textDelta) {
      fullJsonResponse += textDelta;
      if (onToken) {
        onToken(textDelta);
      }
    }

    if (chunk.usage_metadata?.total_tokens) {
      tokensUsedInPass = chunk.usage_metadata.total_tokens;
    }
  }

  const requestedToolCalls = aggregatedChunk?.tool_calls || [];

  // Case A: The model decided to invoke one or more Vedic astrology tools first
  if (requestedToolCalls.length > 0) {
    return {
      messages: [
        new AIMessage({
          content: '',
          tool_calls: requestedToolCalls
        })
      ],
      tokensUsed: (state.tokensUsed || 0) + tokensUsedInPass
    };
  }

  // Case B: The model generated the final structured JSON reading
  const structuredReading = parseStructuredReading(
    fullJsonResponse,
    state.userName,
    state.engine
  );

  return {
    messages: [new AIMessage(fullJsonResponse)],
    latestReading: structuredReading,
    tokensUsed: (state.tokensUsed || 0) + tokensUsedInPass
  };
};

/**
 * Node 2: `toolExecutorNode`
 * - Executes all tool calls requested by `agentNode` in parallel
 * - Emits live SSE `onThinking` status updates for each tool inspected
 * - Appends `ToolMessage` results back into `state.messages`
 */
export const toolExecutorNode = async (state, config) => {
  const onThinking = config?.configurable?.onThinking;
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = lastMessage?.tool_calls || [];

  if (toolCalls.length === 0) {
    return { messages: [] };
  }

  const tools = createJyotishTools({
    chartData: state.chartData,
    birthParams: state.birthParams || {}
  });
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

  const toolMessages = await Promise.all(
    toolCalls.map(async (toolCall) => {
      if (onThinking) {
        onThinking(formatToolThinkingMessage(toolCall.name, toolCall.args));
      }

      const targetTool = toolMap[toolCall.name];
      if (!targetTool) {
        return new ToolMessage({
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify({ error: `Tool '${toolCall.name}' is not registered.` })
        });
      }

      try {
        const output = await targetTool.invoke(toolCall.args || {});
        return new ToolMessage({
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: typeof output === 'string' ? output : JSON.stringify(output)
        });
      } catch (error) {
        return new ToolMessage({
          tool_call_id: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify({ error: error.message || 'Tool execution failed.' })
        });
      }
    })
  );

  if (onThinking) {
    onThinking('Synthesizing your personalized Vedic reading...');
  }

  return {
    messages: toolMessages
  };
};

/**
 * Conditional Edge Router:
 * Routes to `tools` if the model emitted `tool_calls`, or finishes (`__end__`)
 * once the final reading is generated.
 */
export const routeAfterAgent = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (Array.isArray(lastMessage?.tool_calls) && lastMessage.tool_calls.length > 0) {
    return 'tools';
  }
  return '__end__';
};
