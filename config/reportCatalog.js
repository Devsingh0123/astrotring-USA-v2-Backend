/**
 * Master catalog of deep astrology reports supported by Japaika.
 * Synchronized with shared/PRD.md and frontend catalog definitions.
 */
export const REPORT_CATEGORIES = [
  { id: 'work', name: 'Work & Career' },
  { id: 'love', name: 'Love & Marriage' },
  { id: 'money', name: 'Money & Wealth' },
  { id: 'self', name: 'Self & Personal Growth' }
];

export const REPORT_CATALOG = [
  // 1. Work & Career
  {
    slug: 'career',
    category: 'work',
    categoryName: 'Work & Career',
    title: 'Career Mastery & Dasamsa Reading',
    subtitle: 'Career growth, executive leadership windows & promotion cycles',
    badge: 'Trending',
    description:
      'Examines your 10th house, Amatyakaraka, and Dasamsa (D-10) chart to map optimal promotion cycles, executive leadership windows, and strategic moments to seek role expansion.',
    dashaFocus: '10th Lord & Dasamsa (D-10)',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'business',
    category: 'work',
    categoryName: 'Work & Career',
    title: 'Business & Entrepreneurial Aptitude',
    subtitle: 'Commercial intelligence, trade partnerships & venture launch timing',
    badge: null,
    description:
      'Built for founders and entrepreneurs. Evaluates the 7th house of trade, Mercury commercial intelligence, and Rahu market timing to identify prime expansion phases.',
    dashaFocus: '7th House & Mercury dignity',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'job-or-business',
    category: 'work',
    categoryName: 'Work & Career',
    title: 'Corporate Job vs Independent Business',
    subtitle: 'A stable salary, bold enterprise, or dual vocation?',
    badge: null,
    description:
      'A head-to-head comparison between your 6th house (employment/service) and 7th/10th houses (independent venture) to determine where your chart yields maximum prosperity.',
    dashaFocus: '6th House vs 7th House harmony',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'govt-job',
    category: 'work',
    categoryName: 'Work & Career',
    title: 'Civil Services & Government Career',
    subtitle: 'Competitive exams, administrative authority & official promotions',
    badge: 'New',
    description:
      'Calculates the strength of Sun (state authority), Mars (administrative power), and 10th house connection to predict competitive exam success and civil service eligibility.',
    dashaFocus: 'Sun dignity & 10th Lord aspects',
    creditsRequired: 1,
    estimatedPages: 10
  },

  // 2. Love & Marriage
  {
    slug: 'marriage',
    category: 'love',
    categoryName: 'Love & Marriage',
    title: 'Marriage & Navamsa (D-9) Destiny',
    subtitle: 'Marriage timing windows, spouse temperament & relationship yogas',
    badge: 'Trending',
    description:
      'A deep Vedic marriage reading evaluating the 7th house, its lord, Venus, Jupiter, and the Navamsa (D-9) to reveal auspicious marriage windows and long-term marital harmony.',
    dashaFocus: '7th Lord, Jupiter & Navamsa (D-9)',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'love-style',
    category: 'love',
    categoryName: 'Love & Marriage',
    title: 'Romantic Blueprint & Love Style',
    subtitle: 'Your romantic instincts, emotional strengths & vulnerability',
    badge: null,
    description:
      'A deep Vedic dive into your 5th house, Venus placement, and romantic instincts. Understand how you love, communicate affection, and navigate vulnerability in relationships.',
    dashaFocus: 'Venus & 5th Lord transits',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'ideal-partner',
    category: 'love',
    categoryName: 'Love & Marriage',
    title: 'Ideal Life Partner & Soulmate Karaka',
    subtitle: 'Personality, vocation & harmonious traits of your ideal match',
    badge: null,
    description:
      'Analyzes your 7th house cusp, Darakaraka planet, and Navamsa descendant to sketch the temperament, values, and vocational background of your most harmonious match.',
    dashaFocus: 'Darakaraka & 7th Bhava',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'spouse',
    category: 'love',
    categoryName: 'Love & Marriage',
    title: 'Spousal Bond & Mutual Growth',
    subtitle: 'Emotional intimacy, conflict resolution & long-term union',
    badge: null,
    description:
      'Explore the spiritual and emotional bond with your spouse. Unpacks shared life goals, conflict resolution patterns, and long-term companionship from your Navamsa (D-9) chart.',
    dashaFocus: 'Navamsa Lagna & 7th House',
    creditsRequired: 1,
    estimatedPages: 10
  },

  // 3. Money & Wealth
  {
    slug: 'wealth',
    category: 'money',
    categoryName: 'Money & Wealth',
    title: 'Wealth Creation & Liquid Assets',
    subtitle: 'Asset growth, real estate timing & financial stability',
    badge: null,
    description:
      'Analyzes your 2nd house of accumulated assets, 11th house of recurrent profits, and Jupiter transits to map your timeline for savings, real estate, and capital investments.',
    dashaFocus: 'Jupiter transits & 11th House',
    creditsRequired: 1,
    estimatedPages: 10
  },
  {
    slug: 'billionaire',
    category: 'money',
    categoryName: 'Money & Wealth',
    title: 'Billionaire Potential & Dhana Yogas',
    subtitle: 'High-net-worth combinations, Lakshmi Yoga & enterprise destiny',
    badge: 'Trending',
    description:
      'Scans your chart for classical Dhana Yogas, Lakshmi Yoga, Vipreet Raja Yogas, and Indu Lagna strength to determine peak wealth thresholds and enterprise potential.',
    dashaFocus: 'Indu Lagna, 2nd & 11th Lords',
    creditsRequired: 1,
    estimatedPages: 10
  },

  // 4. Self & Personal Growth
  {
    slug: 'personality-intelligence',
    category: 'self',
    categoryName: 'Self & Personal Growth',
    title: 'Personality & Intellectual Architecture',
    subtitle: 'Cognitive gifts, emotional blueprint & higher learning strengths',
    badge: null,
    description:
      'A deep psychological and Vedic portrait of your intellect. Explores Mercury analytical grasp, Jupiter wisdom, and 5th house creativity to guide lifelong learning.',
    dashaFocus: '5th Bhava & Budhaditya Yoga',
    creditsRequired: 1,
    estimatedPages: 10
  }
];

export const getReportMetadata = (slug) => {
  const cleanSlug = String(slug || '').toLowerCase().trim();
  return (
    REPORT_CATALOG.find((r) => r.slug === cleanSlug) || {
      slug: cleanSlug,
      category: 'work',
      categoryName: 'Specialized Reading',
      title: `${cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Reading`,
      subtitle: 'Personalized 10-page Vedic Astrology Analysis',
      badge: null,
      description: 'Comprehensive chart-personalized Vedic analysis prepared from your birth coordinates.',
      dashaFocus: 'D-1 & Divisional Charts',
      creditsRequired: 1,
      estimatedPages: 10
    }
  );
};
