import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';
import { User } from './User.js';

/**
 * Order Model (`orders` table)
 * ----------------------------
 * Stores every Razorpay checkout order created by the backend,
 * along with the server-verified pricing, GST breakdown, and idempotency lock (`is_credited`).
 */
export const Order = sequelize.define('Order', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Product metadata
  product_type: {
    type: DataTypes.ENUM('questions', 'report_pack'),
    allowNull: false
  },
  product_code: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  item_title: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  credits_to_grant: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Currency & Server-Verified Pricing Breakdown
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'INR'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  coupon_code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // GST & Tax Breakdown
  taxable_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  cgst: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  sgst: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  igst: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  tax_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  total_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Exact integer subunits (paise for INR, cents for USD) sent to Razorpay Orders API
  amount_subunits: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  billing_state: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Delhi'
  },
  // Razorpay Gateway Identifiers
  razorpay_order_id: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  razorpay_payment_id: {
    type: DataTypes.STRING(128),
    allowNull: true
  },
  razorpay_signature: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Order Status & Idempotency Lock
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  // Ensures credits are granted ONLY ONCE even if both /verify-payment and /webhook fire
  is_credited: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  failure_reason: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'orders',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_orders_user_id', fields: ['user_id'] },
    { name: 'idx_orders_razorpay_order_id', unique: true, fields: ['razorpay_order_id'] },
    { name: 'idx_orders_razorpay_payment_id', fields: ['razorpay_payment_id'] },
    { name: 'idx_orders_status', fields: ['status'] }
  ]
});

