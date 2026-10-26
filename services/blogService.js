import { Op, fn, col } from 'sequelize';
import { sequelize } from '../config/db.js';
import { Blog, User } from '../models/index.js';
import { AppError } from '../utils/appError.js';

// Standard category metadata for friendly display names & icons on frontend
export const STANDARD_CATEGORIES = [
  { id: 'vedic-astrology', name: 'Vedic Astrology', description: 'Core principles of Jyotish, Rashis, Nakshatras & Kundli interpretation' },
  { id: 'planetary-transits', name: 'Planetary Transits', description: 'Gochara analysis of Saturn, Jupiter, Rahu-Ketu and planetary shifts' },
  { id: 'remedies', name: 'Remedies & Upayas', description: 'Vedic mantras, gemstones, fasting rules and karmic harmonizers' },
  { id: 'horoscopes', name: 'Horoscopes & Forecasts', description: 'Daily, monthly, and yearly lunar astrological predictions' },
  { id: 'love-compatibility', name: 'Love & Compatibility', description: 'Kundli Milan, Navamsa (D-9) matching, and relationship dynamics' },
  { id: 'career-growth', name: 'Career & Wealth', description: 'Dasamsa (D-10) insights, Dhana Yogas, and profession timing' },
  { id: 'kundli-analysis', name: 'Kundli Analysis', description: 'House placements, divisional charts, and classical Parashari sutras' }
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 1. List Public Published Blogs (Paginated & Filtered)
 */
export const getPublicBlogs = async ({
  page = 1,
  limit = 12,
  category = null,
  tag = null,
  search = null,
  sort_by = 'published_at',
  order = 'DESC'
}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const offset = (pageNum - 1) * limitNum;

  // Strict public filter: Only published posts whose publish date is past or now
  const whereClause = {
    status: 'published',
    published_at: {
      [Op.lte]: new Date()
    }
  };

  if (category && category.trim() && category.trim() !== 'all') {
    whereClause.category = category.trim().toLowerCase();
  }

  if (tag && tag.trim()) {
    const cleanTag = tag.trim().toLowerCase();
    // Searches JSON tag array using MySQL JSON_CONTAINS
    whereClause[Op.and] = [
      ...(whereClause[Op.and] || []),
      sequelize.where(
        fn('JSON_CONTAINS', col('Blog.tags'), JSON.stringify(cleanTag)),
        1
      )
    ];
  }

  if (search && search.trim()) {
    const cleanSearch = `%${search.trim()}%`;
    whereClause[Op.or] = [
      { title: { [Op.like]: cleanSearch } },
      { excerpt: { [Op.like]: cleanSearch } },
      { content: { [Op.like]: cleanSearch } }
    ];
  }

  const allowedSortColumns = ['published_at', 'views_count', 'read_time_minutes', 'created_at'];
  const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'published_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { count, rows: blogs } = await Blog.findAndCountAll({
    where: whereClause,
    attributes: [
      'id',
      'author_id',
      'title',
      'slug',
      'excerpt',
      'featured_image',
      'category',
      'tags',
      'published_at',
      'read_time_minutes',
      'views_count'
    ],
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['id', 'email', 'role']
      }
    ],
    order: [[sortColumn, sortOrder]],
    limit: limitNum,
    offset
  });

  const totalPages = Math.ceil(count / limitNum) || 1;

  return {
    blogs,
    pagination: {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages
    }
  };
};

/**
 * 2. Get Single Public Blog by Slug (or ID) + Increment View Count
 */
export const getPublicBlogBySlug = async (slugOrId) => {
  if (!slugOrId) {
    throw new AppError('Blog slug or ID is required.', 400);
  }

  const cleanIdentifier = String(slugOrId).trim();
  const whereClause = {
    status: 'published',
    published_at: {
      [Op.lte]: new Date()
    }
  };

  if (UUID_REGEX.test(cleanIdentifier)) {
    whereClause[Op.or] = [
      { id: cleanIdentifier },
      { slug: cleanIdentifier }
    ];
  } else {
    whereClause.slug = cleanIdentifier;
  }

  const blog = await Blog.findOne({
    where: whereClause,
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['id', 'email', 'role']
      }
    ]
  });

  if (!blog) {
    throw new AppError('Blog article not found or has been unpublished.', 404);
  }

  // Atomically increment views count by 1
  await blog.increment('views_count', { by: 1 });
  blog.views_count += 1;

  // Fetch 3 related blogs from the same category
  const relatedBlogs = await Blog.findAll({
    where: {
      id: { [Op.ne]: blog.id },
      category: blog.category,
      status: 'published',
      published_at: { [Op.lte]: new Date() }
    },
    attributes: [
      'id',
      'title',
      'slug',
      'excerpt',
      'featured_image',
      'category',
      'read_time_minutes',
      'published_at',
      'views_count'
    ],
    order: [['published_at', 'DESC']],
    limit: 3
  });

  return {
    blog,
    relatedBlogs
  };
};

/**
 * 3. Get Active Categories with Blog Counts & Top Tags
 */
export const getBlogCategoriesAndTags = async () => {
  // Aggregate count of published blogs grouped by category
  const categoryCounts = await Blog.findAll({
    where: {
      status: 'published',
      published_at: { [Op.lte]: new Date() }
    },
    attributes: ['category', [fn('COUNT', col('id')), 'count']],
    group: ['category']
  });

  const countMap = {};
  for (const item of categoryCounts) {
    countMap[item.category] = parseInt(item.getDataValue('count'), 10) || 0;
  }

  // Merge with standard category definitions
  const categories = STANDARD_CATEGORIES.map((cat) => ({
    ...cat,
    count: countMap[cat.id] || 0
  }));

  // Include any extra categories that might exist in DB
  for (const [catKey, cnt] of Object.entries(countMap)) {
    if (!categories.some((c) => c.id === catKey)) {
      categories.push({
        id: catKey,
        name: catKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: 'Vedic astrology articles and guides',
        count: cnt
      });
    }
  }

  // Extract top tags from recent published blogs
  const recentBlogs = await Blog.findAll({
    where: {
      status: 'published',
      published_at: { [Op.lte]: new Date() }
    },
    attributes: ['tags'],
    limit: 50
  });

  const tagCounts = {};
  for (const b of recentBlogs) {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    for (const t of tags) {
      if (typeof t === 'string' && t.trim()) {
        const cleanTag = t.trim().toLowerCase();
        tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
      }
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  return {
    categories,
    topTags
  };
};

/**
 * 4. Get Featured / Trending Published Blogs
 */
export const getFeaturedBlogs = async (limit = 4) => {
  const limitNum = Math.min(10, Math.max(1, parseInt(limit, 10) || 4));

  const blogs = await Blog.findAll({
    where: {
      status: 'published',
      published_at: { [Op.lte]: new Date() }
    },
    attributes: [
      'id',
      'author_id',
      'title',
      'slug',
      'excerpt',
      'featured_image',
      'category',
      'tags',
      'published_at',
      'read_time_minutes',
      'views_count'
    ],
    include: [
      {
        model: User,
        as: 'author',
        attributes: ['id', 'email', 'role']
      }
    ],
    order: [
      ['views_count', 'DESC'],
      ['published_at', 'DESC']
    ],
    limit: limitNum
  });

  return blogs;
};
