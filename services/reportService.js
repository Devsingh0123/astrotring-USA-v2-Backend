import { sequelize } from '../config/db.js';
import { User, BirthChart, BirthDetail, UserReport } from '../models/index.js';
import { REPORT_CATALOG, REPORT_CATEGORIES, getReportMetadata } from '../config/reportCatalog.js';
import {
  extractAstrologicalSummary,
  resolveBlueprintKey,
  REPORT_BLUEPRINTS,
  generateChapterBatch
} from '../ai/reportPrompts.js';
import { AppError } from '../utils/appError.js';

/**
 * 1. Get full catalog of available reports
 */
export const getReportsCatalog = () => {
  return {
    categories: REPORT_CATEGORIES,
    reports: REPORT_CATALOG
  };
};

/**
 * Helper to resolve user's target BirthChart
 */
const resolveUserChart = async (userId, explicitChartId = null) => {
  if (explicitChartId) {
    const chart = await BirthChart.findOne({
      where: { id: explicitChartId, user_id: userId }
    });
    if (chart) return chart;
  }

  // Fallback to user's primary birth detail
  const primaryDetail = await BirthDetail.findOne({
    where: { user_id: userId, is_primary: true },
    include: [{ model: BirthChart, as: 'chart' }]
  });

  if (primaryDetail?.chart) {
    return primaryDetail.chart;
  }

  // Fallback to any latest chart for user
  const latestChart = await BirthChart.findOne({
    where: { user_id: userId },
    order: [['created_at', 'DESC']]
  });

  return latestChart || null;
};

/**
 * 2. Unlock a report with 1 report credit (Idempotent & Safe)
 */
export const unlockReport = async ({ userId, slug, chartId = null }) => {
  if (!slug) {
    throw new AppError('report slug is required.', 400);
  }

  const cleanSlug = String(slug).toLowerCase().trim();
  const catalogItem = getReportMetadata(cleanSlug);

  // 1. Resolve User
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError('User not found.', 404);
  }
  if (user.is_blocked) {
    throw new AppError('Your account has been suspended. Please contact support.', 403);
  }

  // 2. Resolve Birth Chart
  const chart = await resolveUserChart(userId, chartId);
  if (!chart || !chart.chart_data) {
    throw new AppError(
      'No birth chart found. Please complete your birth details onboarding before unlocking a deep report.',
      400
    );
  }

  // 3. Idempotency Check: Did user already unlock this report for this chart?
  const existingReport = await UserReport.findOne({
    where: {
      user_id: user.id,
      chart_id: chart.id,
      report_slug: cleanSlug
    }
  });

  if (existingReport) {
    if (existingReport.status === 'completed') {
      return {
        isAlreadyUnlocked: true,
        reportId: existingReport.id,
        status: 'completed',
        creditsRemaining: user.report_credits,
        message: 'This report is already unlocked and available.'
      };
    }

    if (existingReport.status === 'generating' || existingReport.status === 'pending') {
      return {
        isAlreadyUnlocked: true,
        reportId: existingReport.id,
        status: 'generating',
        progressPercent: existingReport.progress_percent,
        creditsRemaining: user.report_credits,
        message: 'Report is currently being generated.'
      };
    }
  }

  // 4. Check Credit Balance
  if (user.report_credits < 1) {
    throw new AppError(
      'Insufficient report credits. Please purchase a report pack to unlock this deep reading.',
      402
    );
  }

  const reportType = resolveBlueprintKey(cleanSlug);

  // 5. Deduct Credit & Create/Update Report in Transaction
  let reportRecord = null;

  await sequelize.transaction(async (t) => {
    // Lock user record for update
    const lockedUser = await User.findByPk(userId, {
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (lockedUser.report_credits < 1) {
      throw new AppError('Insufficient report credits.', 402);
    }

    lockedUser.report_credits -= 1;
    await lockedUser.save({ transaction: t });

    if (existingReport && existingReport.status === 'failed') {
      // Re-use failed report row
      existingReport.status = 'generating';
      existingReport.progress_percent = 15;
      existingReport.current_stage = 'Initializing Vedic synthesis...';
      existingReport.error_message = null;
      await existingReport.save({ transaction: t });
      reportRecord = existingReport;
    } else {
      reportRecord = await UserReport.create({
        user_id: user.id,
        chart_id: chart.id,
        report_slug: cleanSlug,
        report_type: reportType,
        title: catalogItem.title,
        subtitle: catalogItem.subtitle,
        status: 'generating',
        progress_percent: 15,
        current_stage: 'Calculating planetary alignments and divisional charts...'
      }, { transaction: t });
    }
  });

  // 6. Spawn Background Asynchronous Worker (Non-blocking)
  setImmediate(() => {
    generateReportInBackground(reportRecord.id).catch((err) => {
      console.error(`[Report Worker] Unhandled generation error for ${reportRecord.id}:`, err);
    });
  });

  return {
    isAlreadyUnlocked: false,
    reportId: reportRecord.id,
    status: 'generating',
    progressPercent: 15,
    creditsRemaining: user.report_credits - 1,
    message: 'Report unlocked! Asynchronous AI generation in progress.'
  };
};

/**
 * 3. Background AI Generation Engine (Parallel Chapter Batches)
 */
export const generateReportInBackground = async (reportId) => {
  const startTime = Date.now();

  const report = await UserReport.findByPk(reportId, {
    include: [
      { model: User, as: 'user' },
      { model: BirthChart, as: 'chart' }
    ]
  });

  if (!report || report.status === 'completed') return;

  try {
    // Stage 1: Astrological Extraction (25%)
    report.progress_percent = 25;
    report.current_stage = 'Extracting divisional charts, dashas & planetary yogas...';
    await report.save();

    const chartData = report.chart?.chart_data;
    const astroSummary = extractAstrologicalSummary(chartData, report.report_type);

    const blueprintBatches = REPORT_BLUEPRINTS[report.report_type] || REPORT_BLUEPRINTS.career;

    // Stage 2: Parallel Batch Generation (50%)
    report.progress_percent = 50;
    report.current_stage = 'Synthesizing foundational chapters and divisional analysis...';
    await report.save();

    const userName = report.chart?.person_name || report.user?.email?.split('@')[0] || 'Seeker';

    // Execute the 3 chapter batches in parallel for high speed (~8-12s)
    const batchPromises = blueprintBatches.map((b) =>
      generateChapterBatch({
        userName,
        reportTitle: report.title,
        reportSlug: report.report_slug,
        astroSummary,
        chapters: b.chapters,
        batchIndex: b.batch
      })
    );

    const batchResults = await Promise.all(batchPromises);
    const flattenedChapters = batchResults.flat().sort((a, b) => a.chapterNumber - b.chapterNumber);

    // Stage 3: Compiling Table of Contents & Executive Summary (85%)
    report.progress_percent = 85;
    report.current_stage = 'Compiling executive summary and planetary remedies...';
    await report.save();

    const tableOfContents = flattenedChapters.map((c) => ({
      chapterNumber: c.chapterNumber,
      title: c.title,
      timingDates: c.timingDates || null
    }));

    const executiveSummary = {
      leadObservation: `Astrological synthesis for ${userName} grounded in ${astroSummary.ascendantSign} Lagna and ${astroSummary.moonSign} Rashi.`,
      activeDasha: astroSummary.activeDasha?.period || 'Vimshottari Dasha Active',
      keyHighlights: flattenedChapters.slice(0, 3).map((c) => c.astrometricSummary || c.title),
      primaryRemedy: flattenedChapters[flattenedChapters.length - 2]?.practicalRemedies?.[0] || 'Chant Gayatri Mantra daily for planetary balance.'
    };

    // Stage 4: Final Completion (100%)
    const generationTimeMs = Date.now() - startTime;
    report.status = 'completed';
    report.progress_percent = 100;
    report.current_stage = 'Report generation complete.';
    report.sections = flattenedChapters;
    report.table_of_contents = tableOfContents;
    report.summary = executiveSummary;
    report.astrological_factors = astroSummary;
    report.generation_time_ms = generationTimeMs;
    report.error_message = null;
    await report.save();

    console.log(`[Report Worker] Successfully generated report ${report.id} (${report.report_slug}) in ${generationTimeMs}ms.`);
  } catch (error) {
    console.error(`[Report Worker] Failed to generate report ${report.id}:`, error);

    // Refund 1 report credit back to user if generation failed
    try {
      await sequelize.transaction(async (t) => {
        const lockedUser = await User.findByPk(report.user_id, {
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (lockedUser) {
          lockedUser.report_credits += 1;
          await lockedUser.save({ transaction: t });
          console.log(`[Report Worker] Restored 1 report credit to user ${lockedUser.id} due to failure.`);
        }

        report.status = 'failed';
        report.progress_percent = 0;
        report.current_stage = 'Generation failed. Credit has been restored to your balance.';
        report.error_message = error.message || 'AI generation timed out or failed';
        await report.save({ transaction: t });
      });
    } catch (refundError) {
      console.error(`[Report Worker] Error during failure credit refund for ${report.id}:`, refundError);
    }
  }
};

/**
 * 4. Get lightweight report status for client polling
 */
export const getReportStatus = async (reportId, userId) => {
  const report = await UserReport.findOne({
    where: { id: reportId, user_id: userId },
    attributes: ['id', 'report_slug', 'title', 'status', 'progress_percent', 'current_stage', 'error_message']
  });

  if (!report) {
    throw new AppError('Report not found.', 404);
  }

  return {
    id: report.id,
    slug: report.report_slug,
    title: report.title,
    status: report.status,
    progressPercent: report.progress_percent,
    currentStage: report.current_stage,
    error: report.error_message
  };
};

/**
 * 5. Get full unlocked report by ID
 */
export const getReportById = async (reportId, userId) => {
  const report = await UserReport.findOne({
    where: { id: reportId, user_id: userId },
    include: [
      {
        model: BirthChart,
        as: 'chart',
        attributes: ['person_name', 'gender', 'date_of_birth', 'time_of_birth', 'birth_city', 'ascendant_sign', 'moon_sign', 'sun_sign', 'nakshatra']
      }
    ]
  });

  if (!report) {
    throw new AppError('Report not found.', 404);
  }

  return report;
};

/**
 * 6. Get report by slug (checks if already unlocked for primary chart)
 */
export const getReportBySlug = async (userId, slug) => {
  const cleanSlug = String(slug).toLowerCase().trim();
  const chart = await resolveUserChart(userId);

  if (!chart) {
    return { isUnlocked: false, slug: cleanSlug };
  }

  const report = await UserReport.findOne({
    where: {
      user_id: userId,
      chart_id: chart.id,
      report_slug: cleanSlug
    }
  });

  if (!report) {
    return { isUnlocked: false, slug: cleanSlug };
  }

  return {
    isUnlocked: report.status === 'completed',
    status: report.status,
    progressPercent: report.progress_percent,
    reportId: report.id,
    report: report.status === 'completed' ? report : null
  };
};

/**
 * 7. List all reports unlocked by user
 */
export const getUserReports = async (userId) => {
  const reports = await UserReport.findAll({
    where: { user_id: userId },
    attributes: [
      'id',
      'report_slug',
      'report_type',
      'title',
      'subtitle',
      'status',
      'progress_percent',
      'created_at',
      'generation_time_ms',
      'summary'
    ],
    order: [['created_at', 'DESC']]
  });

  return reports;
};
