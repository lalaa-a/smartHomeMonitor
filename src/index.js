import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { db } from './config/firebaseAdmin.js';
import housesRouter from './routes/houses.routes.js';
import reportRouter from './routes/report.routes.js';
import alertsRouter from './routes/alerts.routes.js';
import { startSafetyCutoffWatcher } from './jobs/safetyCutoffWatcher.js';
import { startLightScheduleTimer } from './jobs/lightScheduleTimer.js';
import { startUsageLogWriter } from './jobs/usageLogWriter.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api', housesRouter);
app.use('/api', reportRouter);
app.use('/api', alertsRouter);

app.use((err, req, res, next) => {
  if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
  if (err?.code === 'FORBIDDEN') return res.status(403).json({ error: err.message });
  console.error('[api] unhandled error:', err);
  return res.status(500).json({ error: 'Internal server error.' });
});

const PORT = Number(process.env.PORT ?? 3000);

const server = app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);

  // Background jobs run alongside the API from boot:
  startSafetyCutoffWatcher();
  startLightScheduleTimer();
  startUsageLogWriter();
});

function shutdown(signal) {
  console.log(`\n[api] ${signal} received, shutting down.`);
  server.close(() => {
    db.goOffline();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
