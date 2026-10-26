import {
  getPublicBlogs,
  getPublicBlogBySlug,
  getBlogCategoriesAndTags,
  getFeaturedBlogs
} from '../services/blogService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * 1. GET /api/v1/blogs
 * Public - Paginated list of published blogs with filtering
 */
export const listBlogs = asyncHandler(async (req, res) => {
  const { page, limit, category, tag, search, sort_by, order } = req.query;

  const data = await getPublicBlogs({
    page,
    limit,
    category,
    tag,
    search,
    sort_by,
    order
  });

  res.status(200).json({
    success: true,
    message: 'Blogs retrieved successfully.',
    data
  });
});

/**
 * 2. GET /api/v1/blogs/categories
 * Public - Active categories with blog counts & trending tags
 */
export const getBlogCategories = asyncHandler(async (req, res) => {
  const data = await getBlogCategoriesAndTags();

  res.status(200).json({
    success: true,
    message: 'Blog categories retrieved successfully.',
    data
  });
});

/**
 * 3. GET /api/v1/blogs/featured
 * Public - Top trending published articles
 */
export const getFeatured = asyncHandler(async (req, res) => {
  const limit = req.query.limit || 4;
  const blogs = await getFeaturedBlogs(limit);

  res.status(200).json({
    success: true,
    message: 'Featured blogs retrieved successfully.',
    data: {
      blogs
    }
  });
});

/**
 * 4. GET /api/v1/blogs/:slug
 * Public - Single published blog article by slug with views increment & related blogs
 */
export const getBlogBySlug = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const data = await getPublicBlogBySlug(slug);

  res.status(200).json({
    success: true,
    message: 'Blog retrieved successfully.',
    data
  });
});
