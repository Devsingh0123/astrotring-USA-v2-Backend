import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '../config/db.js';
import { QuestionPack } from '../models/QuestionPack.js';

export const INITIAL_QUESTION_PACKS = [
  {
    code: 'pack_silver_7',
    name: 'Silver',
    title: 'Silver Question Pack (7 Questions)',
    tier: 'silver',
    credits: 7,
    prices: {
      INR: { originalPrice: 1399, offerPrice: 699 },
      USD: { originalPrice: 14.99, offerPrice: 7.99 }
    },
    is_active: true,
    sort_order: 1
  },
  {
    code: 'pack_gold_12',
    name: 'Gold',
    title: 'Gold Question Pack (12 Questions)',
    tier: 'gold',
    credits: 12,
    prices: {
      INR: { originalPrice: 2399, offerPrice: 799 },
      USD: { originalPrice: 29.99, offerPrice: 9.99 }
    },
    is_active: true,
    sort_order: 2
  },
  {
    code: 'pack_diamond_20',
    name: 'Diamond',
    title: 'Diamond Question Pack (20 Questions)',
    tier: 'diamond',
    credits: 20,
    prices: {
      INR: { originalPrice: 3999, offerPrice: 1199 },
      USD: { originalPrice: 49.99, offerPrice: 14.99 }
    },
    is_active: true,
    sort_order: 3
  }
];

export async function seedQuestionPacks() {
  try {
    await sequelize.authenticate();
    console.log('Connected to MySQL database.');

    // Ensure question_packs table is ready
    await QuestionPack.sync();

    console.log('Seeding initial question packs with INR & USD...');
    for (const pack of INITIAL_QUESTION_PACKS) {
      const existing = await QuestionPack.findOne({ where: { code: pack.code } });
      if (!existing) {
        await QuestionPack.create({
          id: uuidv4(),
          ...pack
        });
        console.log(`Created question pack: ${pack.code} with INR & USD`);
      } else {
        await existing.update({
          name: pack.name,
          title: pack.title,
          tier: pack.tier,
          credits: pack.credits,
          prices: pack.prices,
          is_active: pack.is_active,
          sort_order: pack.sort_order
        });
        console.log(`Updated question pack: ${pack.code} with INR & USD`);
      }
    }

    console.log('Question packs seeded successfully.');
  } catch (err) {
    console.error('Error seeding question packs:', err);
    throw err;
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('seedQuestionPacks.js')) {
  seedQuestionPacks()
    .then(async () => {
      await sequelize.close();
      process.exit(0);
    })
    .catch(async () => {
      await sequelize.close();
      process.exit(1);
    });
}
