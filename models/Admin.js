import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Administrator'
  },
  role: {
    type: DataTypes.ENUM('admin', 'super_admin'),
    allowNull: false,
    defaultValue: 'admin'
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  is_blocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'admins',
  timestamps: true,
  paranoid: true,
  underscored: true
});
