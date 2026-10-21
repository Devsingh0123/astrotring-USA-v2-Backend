import { Router } from 'express';
import {
  calculateHoroscope,
  bindChart,
  getChartById,
  calculateMarriageMatch,
  calculateSaturnTimeline,
  calculateSuryaSiddhanta,
  calculateGochara,
  calculateGocharaRange,
  calculateGochar,
  calculateGocharEvents,
  calculatePlanetIngress,
  calculatePanchang,
  calculateMuhurta,
  getMuhurtaEvents,
  searchLocation,
  autocompleteLocation,
  listDivisionalCharts,
  getEngineHealth
} from '../controllers/vedicController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

/**
 * Unified Vedic Routes: /api/v1/vedic
 */

// 1. Birth Charts & Matching
router.post('/horoscope', calculateHoroscope);
router.post('/bind', protect, bindChart);
router.get('/chart/:chartId', getChartById);
router.post('/marriage-match', calculateMarriageMatch);
router.post('/saturn-timeline', calculateSaturnTimeline);
router.post('/sade-sati', calculateSaturnTimeline);
router.post('/surya-siddhanta', calculateSuryaSiddhanta);

// 2. Transits (Gochara & Gochar)
router.post('/gochara', calculateGochara);
router.post('/gochara-range', calculateGocharaRange);
router.post('/gochar', calculateGochar);
router.post('/gochar-events', calculateGocharEvents);
router.post('/planet-ingress', calculatePlanetIngress);

// 3. Panchang & Muhurta
router.post('/panchang', calculatePanchang);
router.post('/muhurta', calculateMuhurta);
router.get('/muhurta/events', getMuhurtaEvents);

// 4. Places / Geocoding
router.get('/location/search', searchLocation);
router.get('/location/autocomplete', autocompleteLocation);

// 5. Divisional Charts Index & Health
router.get('/divisional-charts', listDivisionalCharts);
router.get('/health', getEngineHealth);

export default router;
