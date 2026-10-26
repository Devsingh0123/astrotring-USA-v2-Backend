import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * ReportPack Model (`report_packs` table)
 * ---------------------------------------
 * Stores dynamic report consultation pack pricing, report credits, and display options controlled by Admin.
 */
export const ReportPack = sequelize.define('ReportPack', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(150),
    allowNull: true
  },
  tier: {
    type: DataTypes.ENUM('silver', 'gold', 'diamond', 'custom'),
    allowNull: false,
    defaultValue: 'silver'
  },
  credits: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  prices: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    get() {
      const rawValue = this.getDataValue('prices');
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch {
          return {};
        }
      }
      return rawValue || {};
    },
    set(val) {
      this.setDataValue('prices', typeof val === 'object' ? val : JSON.parse(val));
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  sort_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'report_packs',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_report_packs_code', unique: true, fields: ['code'] },
    { name: 'idx_report_packs_is_active', fields: ['is_active'] }
  ]
});
