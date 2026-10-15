import { Router } from 'express';
import {
  calculateHoroscope,
  bindChart,
  getChartById,
  calculateMarriageMatch,
  calculateSadeSati,
  calculateMangalDosha,
  calculatePanchang,
  calculateMuhurta,
  calculateGochara,
  calculateGocharaRange,
  calculatePlanetIngress,
  calculateSuryaSiddhanta,
  listDivisionalCharts,
  autocompleteLocation
} from '../controllers/vedicController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

/**
 * Single Unified Vedic Route: /api/v1/vedic
 */

// 1. Horoscope & Kundli Engine
router.post('/horoscope', calculateHoroscope);
router.post('/bind', protect, bindChart);
router.get('/chart/:chartId', getChartById);

// 2. Compatibility & Matchmaking
router.post('/marriage-match', calculateMarriageMatch);

// 3. Vedic Calculators Suite
router.post('/sade-sati', calculateSadeSati);
router.post('/mangal-dosha', calculateMangalDosha);
router.post('/panchang', calculatePanchang);
router.post('/muhurta', calculateMuhurta);

// 4. Transits (Gochara) & Ingress
router.post('/gochara', calculateGochara);
router.post('/gochara-range', calculateGocharaRange);
router.post('/planet-ingress', calculatePlanetIngress);

// 5. Specialized & Classical Charts
router.post('/surya-siddhanta', calculateSuryaSiddhanta);
router.get('/divisional-charts', listDivisionalCharts);

// 6. Geocoding / Location Autocomplete
router.get('/location/autocomplete', autocompleteLocation);
router.get('/location/search', autocompleteLocation);

export default router;
