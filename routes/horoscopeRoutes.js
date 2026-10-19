import { Router } from 'express';
import {
  listRashiSigns,
  getHoroscopeForecast
} from '../controllers/horoscopeController.js';

const router = Router();

// List all 12 Moon Signs (Rashis)
router.get('/signs', listRashiSigns);

// Fetch horoscope via query params: /api/v1/horoscopes?sign=libra&timeframe=daily
router.get('/', getHoroscopeForecast);

// Fetch horoscope via URL params: /api/v1/horoscopes/:sign/:timeframe
router.get('/:sign/:timeframe', getHoroscopeForecast);

export default router;
