import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';
import { User } from './User.js';
import { Order } from './Order.js';

/**
 * Invoice Model (`invoices` table)
 * --------------------------------
 * Stores official GST-compliant tax invoices generated upon successful payment capture.
 * Includes sequential invoice number (`INV-YYYY-XXXX`), SAC 998431, and full GST split.
 */
export const Invoice = sequelize.define('Invoice', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  invoice_number: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  order_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Razorpay Reference IDs
  razorpay_order_id: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  razorpay_payment_id: {
    type: DataTypes.STRING(128),
    allowNull: false
  },
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'razorpay'
  },
  // Item & SAC Details
  item_type: {
    type: DataTypes.ENUM('questions', 'report_pack'),
    allowNull: false
  },
  item_title: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  sac_code: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '998431'
  },
  // Financial & Tax Breakdown (Strictly 'INR' or 'USD')
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'INR',
    validate: {
      isIn: {
        args: [['INR', 'USD']],
        msg: 'Currency must be either INR or USD'
      }
    }
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  coupon_code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
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
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Buyer Snapshot at Time of Purchase
  billing_state: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Delhi'
  },
  customer_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  customer_email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  // Invoice Status
  status: {
    type: DataTypes.ENUM('PAID', 'REFUNDED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PAID'
  },
  issued_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'invoices',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_invoices_user_id', fields: ['user_id'] },
    { name: 'idx_invoices_order_id', unique: true, fields: ['order_id'] },
    { name: 'idx_invoices_invoice_number', unique: true, fields: ['invoice_number'] },
    { name: 'idx_invoices_razorpay_payment_id', fields: ['razorpay_payment_id'] }
  ]
});

