import { Router } from 'express';
import {
  listBlogs,
  getBlogCategories,
  getFeatured,
  getBlogBySlug
} from '../controllers/blogController.js';

const router = Router();

// Public Blogs Endpoints (No auth required for reading published blogs)

// 1. List published blogs with pagination, search, category, tag filters
router.get('/', listBlogs);

// 2. Active categories with counts & top tags
router.get('/categories', getBlogCategories);

// 3. Featured / trending articles
router.get('/featured', getFeatured);

// 4. Single article by slug (increments view count, includes related blogs)
router.get('/:slug', getBlogBySlug);

export default router;
