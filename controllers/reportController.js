import {
  getReportsCatalog,
  unlockReport,
  getReportStatus,
  getReportById,
  getReportBySlug,
  getUserReports
} from '../services/reportService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. GET /api/v1/reports/catalog
 * Public / Optional Auth - Returns list of all available report definitions
 */
export const getCatalog = asyncHandler(async (req, res) => {
  const data = getReportsCatalog();
  res.status(200).json({
    success: true,
    message: 'Reports catalog fetched successfully.',
    data
  });
});

/**
 * 2. POST /api/v1/reports/unlock
 * Protected - Deducts 1 report credit and initiates background generation
 */
export const unlockReportHandler = asyncHandler(async (req, res) => {
  const { slug, chartId } = req.body;
  const result = await unlockReport({
    userId: req.user.id,
    slug,
    chartId
  });

  const statusCode = result.isAlreadyUnlocked && result.status === 'completed' ? 200 : 202;

  res.status(statusCode).json({
    success: true,
    message: result.message,
    data: result
  });
});

/**
 * 3. GET /api/v1/reports/:id/status
 * Protected - Lightweight endpoint for frontend progress polling
 */
export const getReportStatusHandler = asyncHandler(async (req, res) => {
  const status = await getReportStatus(req.params.id, req.user.id);
  res.status(200).json({
    success: true,
    data: status
  });
});

/**
 * 4. GET /api/v1/reports/:id
 * Protected - Full report details
 */
export const getReportByIdHandler = asyncHandler(async (req, res) => {
  const report = await getReportById(req.params.id, req.user.id);
  res.status(200).json({
    success: true,
    data: report
  });
});

/**
 * 5. GET /api/v1/reports/slug/:slug
 * Protected - Checks if user has already unlocked this report for primary chart
 */
export const getReportBySlugHandler = asyncHandler(async (req, res) => {
  const data = await getReportBySlug(req.user.id, req.params.slug);
  res.status(200).json({
    success: true,
    data
  });
});

/**
 * 6. GET /api/v1/reports/my-reports
 * Protected - Returns list of all reports unlocked by user
 */
export const getMyReportsHandler = asyncHandler(async (req, res) => {
  const reports = await getUserReports(req.user.id);
  res.status(200).json({
    success: true,
    data: {
      reports,
      totalCount: reports.length
    }
  });
});
