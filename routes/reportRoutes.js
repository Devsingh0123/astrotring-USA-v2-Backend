import { Router } from 'express';
import {
  getCatalog,
  unlockReportHandler,
  getReportStatusHandler,
  getReportByIdHandler,
  getReportBySlugHandler,
  getMyReportsHandler
} from '../controllers/reportController.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = Router();

// 1. Catalog (Public or with optional user context)
router.get('/catalog', optionalAuth, getCatalog);

// 2. Unlock report (Deducts 1 credit & initiates async generation)
router.post('/unlock', protect, unlockReportHandler);

// 3. User's unlocked reports list
router.get('/my-reports', protect, getMyReportsHandler);

// 4. Check if a report slug is unlocked for primary chart
router.get('/slug/:slug', protect, getReportBySlugHandler);

// 5. Polling progress status for a generating report
router.get('/:id/status', protect, getReportStatusHandler);

// 6. Get full unlocked report by ID
router.get('/:id', protect, getReportByIdHandler);

export default router;
