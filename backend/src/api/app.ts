import cors from 'cors';
import express, { type Express } from 'express';
import { requireAuth } from './middleware/auth';
import { sourcesRouter } from './routes/sources';
import { jobTitlesRouter } from './routes/jobTitles';
import { criteriaRouter } from './routes/criteria';
import { vacanciesRouter } from './routes/vacancies';
import { scanRouter } from './routes/scan';
import { sourceCandidatesRouter } from './routes/sourceCandidates';
import { hiringResourcesRouter } from './routes/hiringResources';

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/sources', requireAuth, sourcesRouter);
  app.use('/api/job-titles', requireAuth, jobTitlesRouter);
  app.use('/api/criteria', requireAuth, criteriaRouter);
  app.use('/api/vacancies', requireAuth, vacanciesRouter);
  app.use('/api/scan', requireAuth, scanRouter);
  app.use('/api/source-candidates', requireAuth, sourceCandidatesRouter);
  app.use('/api/hiring-resources', requireAuth, hiringResourcesRouter);

  return app;
}
