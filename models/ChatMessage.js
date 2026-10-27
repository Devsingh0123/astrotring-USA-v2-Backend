import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * ChatMessage Model (`chat_messages` table)
 *
 * Stores every individual turn (user question or AI response) within a ChatThread.
 * - `content`: Plain text version of the message (used for LangGraph conversation memory).
 * - `structured_data`: Complete structured reading object for assistant responses
 *   ({ openingThought, thinkingSteps, paragraphs, astrologyBehind, suggestedQuestions, offer })
 *   so the frontend UI can render past readings identically to live readings.
 */
export const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  thread_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'chat_threads',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('user', 'assistant'),
    allowNull: false
  },
  // Plain text of the user's question or the assistant's joined reading paragraphs
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // Rich UI payload for assistant messages (openingThought, thinkingSteps, paragraphs, astrologyBehind, suggestedQuestions, offer)
  structured_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  // User feedback from the "Was this useful? Yes / No" buttons
  feedback: {
    type: DataTypes.ENUM('yes', 'no'),
    allowNull: true,
    defaultValue: null
  },
  // OpenAI token usage for cost/analytics tracking
  tokens_used: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Number of credits deducted for this turn (1 for Jyotish assistant reply, 0 for Shastra)
  credits_debited: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'chat_messages',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { fields: ['thread_id', 'created_at'] }
  ]
});
