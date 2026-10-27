import {
  ChatThread,
  ChatMessage,
  BirthDetail,
  BirthChart,
} from "../models/index.js";
import { chatService } from "../services/chatService.js";
import { AppError } from "../utils/appError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Default promotional offer shown inside Jyotish chat when a user's question quota reaches 0.
 * Matches the exact shape rendered by the chat frontend components.
 */
const ZERO_CREDIT_OFFER = {
  title: "Get 12 questions at 67% discount",
  description:
    "Your question balance is ZERO. Buy 12 questions at 67% off. Promo code: QUICKGOLD",
  promoCode: "QUICKGOLD",
  discountPercent: 67,
  questionsCount: 12,
  originalPrice: "$29.99",
  discountedPrice: "$9.99",
};

/**
 * Helper: Configures HTTP response headers for Server-Sent Events (SSE)
 */
const initSseStream = (res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
};

/**
 * Helper: Writes a named SSE event and JSON data frame to the response stream
 */
const sendSseEvent = (res, eventName, data) => {
  if (!res.writableEnded) {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

/**
 * Helper: Determines whether the caller requested a standard JSON response (`stream: false`)
 * or SSE streaming (default: true).
 */
const shouldUseSse = (req) => {
  if (req.body?.stream === false || req.query?.stream === "false") {
    return false;
  }
  return true;
};

/**
 * 1. POST /api/v1/chat/jyotish
 * Personalized Vedic consultation grounded in the user's pre-calculated birth chart.
 * - Requires authentication (`protect` middleware)
 * - Requires `credit_balance >= 1` (costs 1 credit per question)
 * - Streams response via SSE (`thinking` -> `token` -> `metadata` -> `done`)
 */
export const consultJyotish = asyncHandler(async (req, res, next) => {
  const user = req.user;
  const rawQuery = req.body.query || req.body.question;
  const { threadId, chartId } = req.body;

  if (!rawQuery || typeof rawQuery !== "string" || !rawQuery.trim()) {
    return next(
      new AppError("Please provide a question (`query`) for Jyotish.", 400),
    );
  }
  const question = rawQuery.trim();

  // 1. Check credit balance before starting consultation
  if (user.credit_balance <= 0) {
    return res.status(402).json({
      success: false,
      message:
        "Your question balance is empty. Please purchase a question pack to consult Jyotish.",
      data: {
        creditsRemaining: 0,
        offer: ZERO_CREDIT_OFFER,
      },
    });
  }

  // 2. Load the user's birth profile & calculated natal chart
  let birthDetail = null;
  let birthChart = null;

  if (chartId) {
    birthChart = await BirthChart.findByPk(chartId);
    birthDetail = await BirthDetail.findOne({
      where: { user_id: user.id, chart_id: chartId },
    });
  }

  if (!birthDetail) {
    birthDetail = await BirthDetail.findOne({
      where: { user_id: user.id, is_primary: true },
      include: [{ model: BirthChart, as: "chart" }],
    });
    if (birthDetail?.chart && !birthChart) {
      birthChart = birthDetail.chart;
    }
  }

  if (!birthDetail && !birthChart) {
    return next(
      new AppError(
        "Birth details not found. Please complete onboarding so Jyotish can read your birth chart.",
        400,
      ),
    );
  }

  // 3. Find existing Jyotish thread or create a new one
  let thread = null;
  let priorMessages = [];

  if (threadId) {
    thread = await ChatThread.findOne({
      where: { id: threadId, user_id: user.id, engine: "jyotish" },
    });
    if (thread) {
      priorMessages = await ChatMessage.findAll({
        where: { thread_id: thread.id },
        order: [["created_at", "ASC"]],
      });
    }
  }

  if (!thread) {
    thread = await ChatThread.create({
      user_id: user.id,
      chart_id: birthChart?.id || birthDetail?.chart_id || null,
      engine: "jyotish",
      title: question.length > 120 ? `${question.slice(0, 117)}...` : question,
    });
  }

  // 4. Persist the user's question in `chat_messages`
  await ChatMessage.create({
    thread_id: thread.id,
    role: "user",
    content: question,
    tokens_used: 0,
    credits_debited: 0,
  });

  const isSse = shouldUseSse(req);
  if (isSse) {
    initSseStream(res);
    sendSseEvent(res, "thinking", { step: "Reading your birth chart..." });
  }

  try {
    // 5. Prepare the user's birth chart context for on-demand tool execution
    const { chartData, birthParams, userSummary } =
      await chatService.prepareJyotishChartContext({
        birthDetail,
        chartRecord: birthChart,
      });

    const userName =
      birthDetail?.full_name ||
      birthChart?.person_name ||
      user.email.split("@")[0];

    // 6. Execute stateful LangGraph turn with live token callbacks
    const { reading, tokensUsed } = await chatService.runChatTurn({
      threadId: thread.id,
      engine: "jyotish",
      question,
      userName,
      userSummary,
      chartData,
      birthParams,
      priorMessages,
      onThinking: (step) => {
        if (isSse) sendSseEvent(res, "thinking", { step });
      },
      onToken: (text) => {
        if (isSse) sendSseEvent(res, "token", { text });
      },
    });

    // 7. Deduct 1 credit after successful generation
    user.credit_balance = Math.max(0, user.credit_balance - 1);
    await user.save();

    const offer = user.credit_balance === 0 ? ZERO_CREDIT_OFFER : null;

    const structuredPayload = {
      openingThought: reading.openingThought,
      thinkingSteps: reading.thinkingSteps,
      paragraphs: reading.paragraphs,
      astrologyBehind: reading.astrologyBehind,
      suggestedQuestions: reading.suggestedQuestions,
      offer,
    };

    // 8. Save assistant reading to `chat_messages` and touch thread timestamp
    const assistantMsg = await ChatMessage.create({
      thread_id: thread.id,
      role: "assistant",
      content: reading.paragraphs.join("\n\n"),
      structured_data: structuredPayload,
      tokens_used: tokensUsed,
      credits_debited: 1,
    });

    thread.changed("updated_at", true);
    await thread.save();

    // Format reading item for frontend consumption
    const readingResponse = {
      id: assistantMsg.id,
      threadId: thread.id,
      engine: "jyotish",
      question,
      createdAt: assistantMsg.created_at,
      ...structuredPayload,
      feedback: null,
    };

    if (isSse) {
      sendSseEvent(res, "metadata", {
        threadId: thread.id,
        openingThought: reading.openingThought,
        thinkingSteps: reading.thinkingSteps,
      });
      sendSseEvent(res, "done", {
        threadId: thread.id,
        messageId: assistantMsg.id,
        creditsRemaining: user.credit_balance,
        reading: readingResponse,
      });
      return res.end();
    }

    return res.status(200).json({
      success: true,
      message: "Jyotish consultation completed.",
      data: {
        threadId: thread.id,
        messageId: assistantMsg.id,
        creditsRemaining: user.credit_balance,
        reading: readingResponse,
      },
    });
  } catch (error) {
    if (isSse) {
      sendSseEvent(res, "error", {
        message: error.message || "Failed to generate Jyotish reading.",
      });
      return res.end();
    }
    return next(error);
  }
});

/**
 * 2. POST /api/v1/chat/shastra
 * Universal Vedic Astrology Encyclopedia Q&A.
 * - Free & unlimited (0 credits)
 * - No birth chart needed
 * - Works for both guests and logged-in users (`optionalAuth`)
 */
export const consultShastra = asyncHandler(async (req, res, next) => {
  const user = req.user; // null if guest, User instance if logged in
  const rawQuery = req.body.query || req.body.question;
  const { threadId } = req.body;

  if (!rawQuery || typeof rawQuery !== "string" || !rawQuery.trim()) {
    return next(
      new AppError("Please provide a question (`query`) for Shastra.", 400),
    );
  }
  const question = rawQuery.trim();

  // 1. Find existing Shastra thread or create a new one
  let thread = null;
  let priorMessages = [];

  if (threadId) {
    const whereClause = { id: threadId, engine: "shastra" };
    if (user) whereClause.user_id = user.id;

    thread = await ChatThread.findOne({ where: whereClause });
    if (thread) {
      priorMessages = await ChatMessage.findAll({
        where: { thread_id: thread.id },
        order: [["created_at", "ASC"]],
      });
    }
  }

  if (!thread) {
    thread = await ChatThread.create({
      user_id: user ? user.id : null,
      chart_id: null,
      engine: "shastra",
      title: question.length > 120 ? `${question.slice(0, 117)}...` : question,
    });
  }

  // 2. Save user question in `chat_messages`
  await ChatMessage.create({
    thread_id: thread.id,
    role: "user",
    content: question,
    tokens_used: 0,
    credits_debited: 0,
  });

  const isSse = shouldUseSse(req);
  if (isSse) {
    initSseStream(res);
    sendSseEvent(res, "thinking", {
      step: "Consulting classical Vedic texts...",
    });
  }

  try {
    // 3. Execute stateful LangGraph turn in Shastra mode
    const { reading, tokensUsed } = await chatService.runChatTurn({
      threadId: thread.id,
      engine: "shastra",
      question,
      userName: "Seeker",
      chartFactSheet: "",
      priorMessages,
      onThinking: (step) => {
        if (isSse) sendSseEvent(res, "thinking", { step });
      },
      onToken: (text) => {
        if (isSse) sendSseEvent(res, "token", { text });
      },
    });

    const structuredPayload = {
      openingThought: reading.openingThought,
      thinkingSteps: reading.thinkingSteps,
      paragraphs: reading.paragraphs,
      astrologyBehind: reading.astrologyBehind,
      suggestedQuestions: reading.suggestedQuestions,
      offer: null,
    };

    // 4. Save assistant answer in `chat_messages`
    const assistantMsg = await ChatMessage.create({
      thread_id: thread.id,
      role: "assistant",
      content: reading.paragraphs.join("\n\n"),
      structured_data: structuredPayload,
      tokens_used: tokensUsed,
      credits_debited: 0,
    });

    thread.changed("updated_at", true);
    await thread.save();

    const readingResponse = {
      id: assistantMsg.id,
      threadId: thread.id,
      engine: "shastra",
      question,
      createdAt: assistantMsg.created_at,
      ...structuredPayload,
      feedback: null,
    };

    if (isSse) {
      sendSseEvent(res, "metadata", {
        threadId: thread.id,
        openingThought: reading.openingThought,
        thinkingSteps: reading.thinkingSteps,
      });
      sendSseEvent(res, "done", {
        threadId: thread.id,
        messageId: assistantMsg.id,
        creditsRemaining: user ? user.credit_balance : null,
        reading: readingResponse,
      });
      return res.end();
    }

    return res.status(200).json({
      success: true,
      message: "Shastra consultation completed.",
      data: {
        threadId: thread.id,
        messageId: assistantMsg.id,
        creditsRemaining: user ? user.credit_balance : null,
        reading: readingResponse,
      },
    });
  } catch (error) {
    if (isSse) {
      sendSseEvent(res, "error", {
        message: error.message || "Failed to generate Shastra answer.",
      });
      return res.end();
    }
    return next(error);
  }
});

/**
 * 3. GET /api/v1/chat/threads
 * Lists all saved conversation threads for the logged-in user.
 * Optional query param: `?engine=jyotish` or `?engine=shastra`
 */
export const getUserThreads = asyncHandler(async (req, res) => {
  const { engine } = req.query;
  const whereClause = { user_id: req.user.id };

  if (engine && ["jyotish", "shastra"].includes(engine.toLowerCase())) {
    whereClause.engine = engine.toLowerCase();
  }

  const threads = await ChatThread.findAll({
    where: whereClause,
    include: [
      {
        model: ChatMessage,
        as: "messages",
        attributes: [
          "id",
          "role",
          "content",
          "structured_data",
          "feedback",
          "created_at",
        ],
        separate: true,
        order: [["created_at", "ASC"]],
      },
    ],
    order: [["updated_at", "DESC"]],
  });

  const formattedThreads = threads.map((t) => ({
    id: t.id,
    title: t.title,
    engine: t.engine,
    chartId: t.chart_id,
    messageCount: t.messages?.length || 0,
    lastMessageAt: t.updated_at,
    createdAt: t.created_at,
  }));

  res.status(200).json({
    success: true,
    count: formattedThreads.length,
    threads: formattedThreads,
  });
});

/**
 * 4. GET /api/v1/chat/threads/:threadId
 * Retrieves a single conversation thread and all its messages/readings.
 */
export const getThreadById = asyncHandler(async (req, res, next) => {
  const { threadId } = req.params;

  const thread = await ChatThread.findOne({
    where: { id: threadId, user_id: req.user.id },
    include: [
      {
        model: ChatMessage,
        as: "messages",
        separate: true,
        order: [["created_at", "ASC"]],
      },
    ],
  });

  if (!thread) {
    return next(new AppError("Conversation thread not found.", 404));
  }

  // Pair user questions with their corresponding assistant readings for easy frontend hydration
  const readings = [];
  const messages = thread.messages || [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      const prevUserMsg =
        i > 0 && messages[i - 1].role === "user" ? messages[i - 1] : null;
      const structured = msg.structured_data || {};

      readings.push({
        id: msg.id,
        threadId: thread.id,
        engine: thread.engine,
        question: prevUserMsg ? prevUserMsg.content : thread.title,
        createdAt: msg.created_at,
        openingThought: structured.openingThought || "",
        thinkingSteps: structured.thinkingSteps || [],
        paragraphs: structured.paragraphs || [msg.content],
        astrologyBehind: structured.astrologyBehind || [],
        suggestedQuestions: structured.suggestedQuestions || [],
        offer: structured.offer || null,
        feedback: msg.feedback,
      });
    }
  }

  res.status(200).json({
    success: true,
    data: {
      thread: {
        id: thread.id,
        title: thread.title,
        engine: thread.engine,
        chartId: thread.chart_id,
        createdAt: thread.created_at,
        updatedAt: thread.updated_at,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        structuredData: m.structured_data,
        feedback: m.feedback,
        tokensUsed: m.tokens_used,
        creditsDebited: m.credits_debited,
        createdAt: m.created_at,
      })),
      readings,
    },
  });
});

/**
 * 5. PATCH /api/v1/chat/messages/:messageId/feedback
 * Records user feedback ("yes" | "no") on an assistant reading.
 */
export const updateMessageFeedback = asyncHandler(async (req, res, next) => {
  const { messageId } = req.params;
  const { feedback } = req.body;

  if (!["yes", "no"].includes(feedback)) {
    return next(new AppError('Feedback must be either "yes" or "no".', 400));
  }

  const message = await ChatMessage.findByPk(messageId);
  if (!message) {
    return next(new AppError("Chat message not found.", 404));
  }

  message.feedback = feedback;
  await message.save();

  res.status(200).json({
    success: true,
    message: "Feedback recorded successfully.",
    data: {
      messageId: message.id,
      feedback: message.feedback,
    },
  });
});

/**
 * 6. DELETE /api/v1/chat/threads/:threadId
 * Soft-deletes a conversation thread belonging to the logged-in user.
 */
export const deleteThread = asyncHandler(async (req, res, next) => {
  const { threadId } = req.params;

  const thread = await ChatThread.findOne({
    where: { id: threadId, user_id: req.user.id },
  });

  if (!thread) {
    return next(new AppError("Conversation thread not found.", 404));
  }

  await thread.destroy();

  res.status(200).json({
    success: true,
    message: "Conversation thread deleted successfully.",
  });
});
