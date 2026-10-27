import { Router } from "express";
import {
  consultJyotish,
  consultShastra,
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

// 1. Jyotish Engine — Personal chart-bound consultation (Protected, costs 1 credit, SSE stream)
router.post("/jyotish", protect, consultJyotish);

// 2. Shastra Engine — Universal Vedic Encyclopedia (Free, optional auth for history, SSE stream)
router.post("/shastra", optionalAuth, consultShastra);

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
