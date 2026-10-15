import { Router } from 'express';
import {
  submitOnboarding,
  getOnboardingStatus
} from '../controllers/onboardingController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// All onboarding endpoints require valid JWT authentication
router.use(protect);

// 1. Submit onboarding data (Step 1 + Step 2 combined)
router.post('/', submitOnboarding);

// 2. Check onboarding status
router.get('/status', getOnboardingStatus);

export default router;
