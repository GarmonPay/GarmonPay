import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes';
import walletRoutes from './routes/walletRoutes';
import rewardsRoutes from './routes/rewardsRoutes';
import withdrawalsRoutes from './routes/withdrawalsRoutes';
import transactionsRoutes from './routes/transactionsRoutes';
import analyticsRoutes from './routes/analyticsRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const defaultOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://garmonpay.com';
const allowedOrigins = (process.env.CORS_ORIGIN || defaultOrigin)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS blocked'));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/user', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/withdrawals', withdrawalsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/analytics', analyticsRoutes);

app.listen(PORT, () => {
  console.log(`GarmonPay API running on port ${PORT}`);
});
