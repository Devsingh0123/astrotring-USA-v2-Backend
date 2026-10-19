import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * ChatThread Model (`chat_threads` table)
 *
 * Represents a stateful multi-turn conversation thread for either:
 * - 'vaani': Personalized consultation grounded in a specific user birth chart
 * - 'astropedia': Universal Vedic astrology encyclopedia Q&A (no chart needed)
 *
 * The `id` (UUID) also serves as the `thread_id` passed to LangGraph's MemorySaver checkpointer.
 */
export const ChatThread = sequelize.define('ChatThread', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  // Nullable so unauthenticated guests can still use Astropedia if needed;
  // required for Vaani threads and saved user history
  user_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  // Reference to the birth_charts row used to ground Vaani's astrological context
  chart_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'birth_charts',
      key: 'id'
    }
  },
  // Which AI mode this thread belongs to
  engine: {
    type: DataTypes.ENUM('vaani', 'astropedia'),
    allowNull: false,
    defaultValue: 'vaani'
  },
  // Human-readable title shown in the chat history sidebar (auto-derived from first question)
  title: {
    type: DataTypes.STRING(200),
    allowNull: false
  }
}, {
  tableName: 'chat_threads',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['chart_id'] },
    { fields: ['engine'] }
  ]
});
