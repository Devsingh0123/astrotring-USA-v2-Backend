import { User } from './User.js';
import { Otp } from './Otp.js';
import { RefreshToken } from './RefreshToken.js';
import { BirthChart } from './BirthChart.js';
import { BirthDetail } from './BirthDetail.js';
import { ChatThread } from './ChatThread.js';
import { ChatMessage } from './ChatMessage.js';
import { Order } from './Order.js';
import { Invoice } from './Invoice.js';
import { Coupon } from './Coupon.js';
import { HoroscopeForecast } from './HoroscopeForecast.js';
import { QuestionPack } from './QuestionPack.js';
import { UserReport } from './UserReport.js';
import { Blog } from './Blog.js';

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

// User <-> ChatThread
User.hasMany(ChatThread, { foreignKey: 'user_id', as: 'chat_threads' });
ChatThread.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// BirthChart <-> ChatThread
BirthChart.hasMany(ChatThread, { foreignKey: 'chart_id', as: 'chat_threads' });
ChatThread.belongsTo(BirthChart, { foreignKey: 'chart_id', as: 'chart' });

// ChatThread <-> ChatMessage
ChatThread.hasMany(ChatMessage, { foreignKey: 'thread_id', as: 'messages' });
ChatMessage.belongsTo(ChatThread, { foreignKey: 'thread_id', as: 'thread' });

// User <-> Order
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User <-> Invoice
User.hasMany(Invoice, { foreignKey: 'user_id', as: 'invoices' });
Invoice.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Order <-> Invoice
Order.hasOne(Invoice, { foreignKey: 'order_id', as: 'invoice' });
Invoice.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });

// User <-> UserReport
User.hasMany(UserReport, { foreignKey: 'user_id', as: 'reports' });
UserReport.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// BirthChart <-> UserReport
BirthChart.hasMany(UserReport, { foreignKey: 'chart_id', as: 'reports' });
UserReport.belongsTo(BirthChart, { foreignKey: 'chart_id', as: 'chart' });

// User <-> Blog
User.hasMany(Blog, { foreignKey: 'author_id', as: 'blogs' });
Blog.belongsTo(User, { foreignKey: 'author_id', as: 'author' });

export {
  User,
  Otp,
  RefreshToken,
  BirthChart,
  BirthDetail,
  ChatThread,
  ChatMessage,
  Order,
  Invoice,
  Coupon,
  HoroscopeForecast,
  QuestionPack,
  UserReport,
  Blog
};


