import { Router } from "express";
import {
  consultVaani,
  consultAstropedia,
  getUserThreads,
  getThreadById,
  updateMessageFeedback,
  deleteThread,
} from "../controllers/chatController.js";
import { protect, optionalAuth } from "../middleware/auth.js";

const router = Router();

/**
 * Conversational AI Engine Routes (`/api/v1/chat`)
 */

// 1. Vaani Engine — Personal chart-bound consultation (Protected, costs 1 credit, SSE stream)
router.post("/vaani", protect, consultVaani);

// 2. Astropedia Engine — Universal Vedic Encyclopedia (Free, optional auth for history, SSE stream)
router.post("/astropedia", optionalAuth, consultAstropedia);

// 3. List all saved conversation threads for logged-in user
router.get("/threads", protect, getUserThreads);

// 4. Get full conversation thread and readings by ID
router.get("/threads/:threadId", protect, getThreadById);

// 5. Submit thumbs-up / thumbs-down ("yes" | "no") feedback on a reading
router.patch(
  "/messages/:messageId/feedback",
  optionalAuth,
  updateMessageFeedback,
);

// 6. Soft-delete a conversation thread
router.delete("/threads/:threadId", protect, deleteThread);

export default router;
