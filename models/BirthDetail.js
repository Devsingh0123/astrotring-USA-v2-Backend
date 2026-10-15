import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

export const BirthDetail = sequelize.define('BirthDetail', {
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
  profile_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: 'self' // 'self', 'family', 'partner', 'child'
  },
  is_primary: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  full_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  gender: {
    type: DataTypes.ENUM('male', 'female', 'other'),
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
  chart_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'birth_charts',
      key: 'id'
    }
  }
}, {
  tableName: 'birth_details',
  timestamps: true,
  paranoid: true,
  underscored: true
});
