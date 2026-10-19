import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const RASHI_LIST = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
];

export const HOROSCOPE_TIMEFRAMES = ['daily', 'monthly', 'yearly'];

/**
 * HoroscopeForecast Model (`horoscope_forecasts` table)
 * -----------------------------------------------------
 * Caches generated Daily, Monthly, and Yearly forecasts per Moon Sign (Rashi)
 * so OpenAI is called at most ONCE per sign per period across all users.
 *
 * period_key examples:
 *  - daily:   '2026-10-19'
 *  - monthly: '2026-10'
 *  - yearly:  '2026'
 */
export const HoroscopeForecast = sequelize.define('HoroscopeForecast', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  rashi: {
    type: DataTypes.ENUM(...RASHI_LIST),
    allowNull: false
  },
  timeframe: {
    type: DataTypes.ENUM(...HOROSCOPE_TIMEFRAMES),
    allowNull: false
  },
  period_key: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  // Verified raw transit data (planetary houses from Rashi, Gochara favourability, ingresses)
  transit_snapshot: {
    type: DataTypes.JSON,
    allowNull: false
  },
  // Structured AI-generated forecast (summary, categories, scores, keyTransits, lucky)
  forecast_data: {
    type: DataTypes.JSON,
    allowNull: false
  }
}, {
  tableName: 'horoscope_forecasts',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    {
      name: 'idx_horoscope_rashi_timeframe_period',
      unique: true,
      fields: ['rashi', 'timeframe', 'period_key']
    }
  ]
});
