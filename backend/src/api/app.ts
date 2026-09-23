import cors from 'cors';
import express, { type Express } from 'express';
import { requireAuth } from './middleware/auth';
import { jobTitlesRouter } from './routes/jobTitles';
import { criteriaRouter } from './routes/criteria';
import { vacanciesRouter } from './routes/vacancies';
import { scanRouter } from './routes/scan';
import { hiringResourcesRouter } from './routes/hiringResources';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  // Дефолтный лимит express.json() — 100kb, экспорт/импорт ресурсов найма
  // (POST /api/hiring-resources/import) может быть заметно больше при
  // крупном каталоге.
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/job-titles', requireAuth, jobTitlesRouter);
  app.use('/api/criteria', requireAuth, criteriaRouter);
  app.use('/api/vacancies', requireAuth, vacanciesRouter);
  app.use('/api/scan', requireAuth, scanRouter);
  app.use('/api/hiring-resources', requireAuth, hiringResourcesRouter);

  return app;
}
