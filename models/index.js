import { User } from './User.js';
import { Otp } from './Otp.js';
import { RefreshToken } from './RefreshToken.js';
import { BirthChart } from './BirthChart.js';
import { BirthDetail } from './BirthDetail.js';

// User <-> Otp
User.hasMany(Otp, { foreignKey: 'user_id', as: 'otps' });
Otp.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> RefreshToken
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refresh_tokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> BirthChart
User.hasMany(BirthChart, { foreignKey: 'user_id', as: 'birth_charts' });
BirthChart.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> BirthDetail
User.hasMany(BirthDetail, { foreignKey: 'user_id', as: 'birth_details' });
BirthDetail.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// BirthDetail <-> BirthChart
BirthDetail.belongsTo(BirthChart, { foreignKey: 'chart_id', as: 'chart' });
BirthChart.hasOne(BirthDetail, { foreignKey: 'chart_id', as: 'birth_detail' });

export {
  User,
  Otp,
  RefreshToken,
  BirthChart,
  BirthDetail
};
