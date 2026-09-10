import type { NextFunction, Request, Response } from 'express';
import { config } from '../../config';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token || token !== config.apiAuthToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
