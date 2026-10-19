import {
  RASHI_METADATA,
  getOrGenerateHoroscope
} from '../services/horoscopeService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. GET /api/v1/horoscopes/signs
 * Returns all 12 Vedic Moon Signs (Rashis) and their metadata.
 */
export const listRashiSigns = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Rashi signs fetched successfully.',
    data: {
      signs: Object.entries(RASHI_METADATA).map(([id, meta]) => ({
        id,
        ...meta
      }))
    }
  });
});

/**
 * 2. GET /api/v1/horoscopes?sign=libra&timeframe=daily&date=2026-10-19
 *    GET /api/v1/horoscopes/:sign/:timeframe
 * Returns the cached (or newly generated) Daily, Monthly, or Yearly horoscope for a Moon Sign.
 */
export const getHoroscopeForecast = asyncHandler(async (req, res) => {
  const sign = req.params.sign || req.query.sign || 'aries';
  const timeframe = req.params.timeframe || req.query.timeframe || 'daily';
  const date = req.query.date || null;

  const data = await getOrGenerateHoroscope({ sign, timeframe, date });

  res.status(200).json({
    success: true,
    message: `${data.rashi.name} ${data.timeframe} horoscope fetched successfully.`,
    data
  });
});
