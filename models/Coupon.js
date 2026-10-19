import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * Coupon Model (`coupons` table)
 * ------------------------------
 * Stores server-side coupon codes (e.g., QUICKGOLD, GOLDNOW, ASKMAX, VAULT),
 * their discount rules, applicable products, and usage counts.
 */
export const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  // 'pack_offer' uses the pack's built-in offerPrice; 'percentage' or 'flat' apply custom discounts
  discount_type: {
    type: DataTypes.ENUM('pack_offer', 'percentage', 'flat'),
    allowNull: false,
    defaultValue: 'pack_offer'
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  // Array of product codes this coupon can be applied to (e.g., ["pack_gold_12"])
  applicable_products: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  max_uses: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  used_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'coupons',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_coupons_code', unique: true, fields: ['code'] },
    { name: 'idx_coupons_is_active', fields: ['is_active'] }
  ]
});
