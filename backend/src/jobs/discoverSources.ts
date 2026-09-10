import { prisma } from '../db/client';
import { resolveConnector } from '../connectors';
import type { SourceRecord } from '../connectors/types';

export type DiscoveryTrigger = 'cron' | 'manual';

export interface DiscoveryResult {
  discoveryRunId: string;
  checked: number;
  promoted: number;
  errors: string[];
}

// Ежедневно (и по кнопке) проверяет каталог кандидатов (SourceCandidate) —
// сайты рекрутинговых компаний/агентств, которые пользователь добавил через
// API/приложение, но которые ещё не подтверждены. Каждый непромотированный
// кандидат проверяется лёгким запросом (JobSourceConnector.probe); если
// ресурс жив и отдаёт корректный ответ, для него автоматически создаётся
// обычный Source, и он сразу участвует в следующем скане вакансий.
export async function runDiscovery(trigger: DiscoveryTrigger): Promise<DiscoveryResult> {
  const discoveryRun = await prisma.discoveryRun.create({ data: { trigger } });
  const errors: string[] = [];
  let promoted = 0;

  try {
    const candidates = await prisma.sourceCandidate.findMany({
      where: { promotedSourceId: null },
    });

    for (const candidate of candidates) {
      const record: SourceRecord = {
        id: candidate.id,
        key: candidate.key,
        name: candidate.name,
        kind: candidate.kind as SourceRecord['kind'],
        country: candidate.country,
        config: candidate.config,
      };

      try {
        const connector = resolveConnector(record);
        if (!connector.probe) {
          throw new Error(`Connector "${connector.key}" does not support discovery probing`);
        }
        await connector.probe(record);

        const source = await prisma.source.create({
          data: {
            key: candidate.key,
            name: candidate.name,
            kind: candidate.kind,
            country: candidate.country,
            config: candidate.config,
            enabled: true,
            discovered: true,
          },
        });

        await prisma.sourceCandidate.update({
          where: { id: candidate.id },
          data: {
            promotedSourceId: source.id,
            lastCheckedAt: new Date(),
            lastCheckOk: true,
            lastCheckError: null,
          },
        });
        promoted += 1;
      } catch (error) {
        const message = (error as Error).message;
        errors.push(`[${candidate.name}] ${message}`);
        await prisma.sourceCandidate.update({
          where: { id: candidate.id },
          data: { lastCheckedAt: new Date(), lastCheckOk: false, lastCheckError: message },
        });
      }
    }

    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: {
        finishedAt: new Date(),
        checked: candidates.length,
        promoted,
        error: errors.length ? errors.join('\n') : undefined,
      },
    });

    return { discoveryRunId: discoveryRun.id, checked: candidates.length, promoted, errors };
  } catch (error) {
    await prisma.discoveryRun.update({
      where: { id: discoveryRun.id },
      data: { finishedAt: new Date(), error: (error as Error).message },
    });
    throw error;
  }
}
