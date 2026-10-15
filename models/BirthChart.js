import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const BirthChart = sequelize.define('BirthChart', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  person_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  gender: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'male'
  },
  date_of_birth: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  time_of_birth: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  is_time_unknown: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  birth_city: {
    type: DataTypes.STRING(150),
    allowNull: false
  },
  latitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: false
  },
  longitude: {
    type: DataTypes.DECIMAL(9, 6),
    allowNull: false
  },
  timezone: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: false
  },
  ascendant_sign: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  moon_sign: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  sun_sign: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  nakshatra: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  nakshatra_pada: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  chart_data: {
    type: DataTypes.JSON,
    allowNull: false
  }
}, {
  tableName: 'birth_charts',
  timestamps: true,
  paranoid: true,
  underscored: true
});
