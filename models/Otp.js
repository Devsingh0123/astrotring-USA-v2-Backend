import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const Otp = sequelize.define('Otp', {
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
  otp_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  purpose: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'email_verification'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'otps',
  timestamps: true,
  updatedAt: false, // only created_at needed per spec
  paranoid: true,
  underscored: true
});
