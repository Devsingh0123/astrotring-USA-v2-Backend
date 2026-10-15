import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import vedicRoutes from './routes/vedicRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS Configuration - whitelist frontend origin only
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes Mounting
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/vedic', vedicRoutes); // Unified Vedic astrology endpoint tree
app.use('/api/v1/onboarding', onboardingRoutes);


// Unhandled Route Handler
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Can't find ${req.originalUrl} on this server.`
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect to Database and start server if executed directly
export const startServer = async () => {
  await connectDB();
  return app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} on port ${PORT}`);
  });
};

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('server.js')) {
  startServer();
}

export default app;
