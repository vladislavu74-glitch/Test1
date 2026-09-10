import { Router } from 'express';
import { prisma } from '../../db/client';
import { runDiscovery } from '../../jobs/discoverSources';

export const sourceCandidatesRouter = Router();

interface AddCandidateBody {
  name: string;
  country?: string;
  // "greenhouse" | "lever" -> ats_board; "rss" -> rss_feed
  type: 'greenhouse' | 'lever' | 'rss';
  boardSlug?: string; // требуется для greenhouse/lever
  feedUrl?: string; // требуется для rss
}

sourceCandidatesRouter.get('/', async (_req, res) => {
  const candidates = await prisma.sourceCandidate.findMany({ orderBy: { addedAt: 'desc' } });
  res.json(candidates);
});

sourceCandidatesRouter.post('/', async (req, res) => {
  const body = req.body as AddCandidateBody;
  if (!body.name?.trim()) {
    res.status(400).json({ error: '"name" is required' });
    return;
  }

  let kind: 'ats' | 'rss';
  let config: Record<string, unknown>;
  let key: string;

  if (body.type === 'greenhouse' || body.type === 'lever') {
    if (!body.boardSlug?.trim()) {
      res.status(400).json({ error: '"boardSlug" is required for greenhouse/lever' });
      return;
    }
    kind = 'ats';
    config = { connector: 'ats_board', provider: body.type, boardSlug: body.boardSlug.trim() };
    key = `ats:${body.type}:${body.boardSlug.trim()}`;
  } else if (body.type === 'rss') {
    if (!body.feedUrl?.trim()) {
      res.status(400).json({ error: '"feedUrl" is required for rss' });
      return;
    }
    kind = 'rss';
    config = { connector: 'rss_feed', feedUrl: body.feedUrl.trim() };
    key = `rss:${body.feedUrl.trim()}`;
  } else {
    res.status(400).json({ error: '"type" must be one of: greenhouse, lever, rss' });
    return;
  }

  try {
    const candidate = await prisma.sourceCandidate.create({
      data: {
        key,
        name: body.name.trim(),
        kind,
        country: body.country,
        config: JSON.stringify(config),
      },
    });
    res.status(201).json(candidate);
  } catch {
    res.status(409).json({ error: 'This candidate already exists' });
  }
});

sourceCandidatesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.sourceCandidate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Candidate not found' });
  }
});

sourceCandidatesRouter.post('/discover', async (_req, res) => {
  try {
    const result = await runDiscovery('manual');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
