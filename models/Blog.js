import { DataTypes } from 'sequelize';
import { sequelize } from '../config/db.js';

/**
 * Blog Model (`blogs` table)
 * ---------------------------
 * Stores blog articles, SEO metadata, categories, and publishing workflow states.
 */
export const Blog = sequelize.define('Blog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false
  },
  author_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  excerpt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT('long'),
    allowNull: false
  },
  featured_image: {
    type: DataTypes.STRING(512),
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(64),
    allowNull: false,
    defaultValue: 'vedic-astrology'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    get() {
      const rawValue = this.getDataValue('tags');
      if (typeof rawValue === 'string') {
        try {
          return JSON.parse(rawValue);
        } catch {
          return [];
        }
      }
      return rawValue || [];
    },
    set(val) {
      if (typeof val === 'string') {
        try {
          this.setDataValue('tags', JSON.parse(val));
        } catch {
          this.setDataValue('tags', val ? [val] : []);
        }
      } else {
        this.setDataValue('tags', Array.isArray(val) ? val : []);
      }
    }
  },
  status: {
    type: DataTypes.ENUM('draft', 'published', 'archived'),
    allowNull: false,
    defaultValue: 'draft'
  },
  published_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  read_time_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5
  },
  views_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  meta_title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  meta_description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  meta_keywords: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  canonical_url: {
    type: DataTypes.STRING(512),
    allowNull: true
  }
}, {
  tableName: 'blogs',
  timestamps: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_blogs_author', fields: ['author_id'] },
    { name: 'idx_blogs_slug', unique: true, fields: ['slug'] },
    { name: 'idx_blogs_category', fields: ['category'] },
    { name: 'idx_blogs_status_published', fields: ['status', 'published_at'] }
  ]
});
