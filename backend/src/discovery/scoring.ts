// Приоритизация подходящих ресурсов (раздел 9 требования) — применяется
// ПОСЛЕ обязательных условий отбора, детерминированно (не решением модели),
// чтобы балл был воспроизводим и не зависел от формулировок модели в разных
// запусках. Итоговый балл отражает приоритет для дальнейшей работы, а не
// вероятность достоверности — высокий балл не заменяет ссылку на доказательство.
import type { HiringResourceCandidate, HiringResourceRunParams } from './hiringResourceTypes';

export interface ResourceScore {
  total: number;
  geoSpec: number; // до 30
  evidence: number; // до 30
  recency: number; // до 25
  contact: number; // до 15
}

function textMatchesAny(text: string | null, needles: string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function scoreGeoSpec(candidate: HiringResourceCandidate, params: HiringResourceRunParams): number {
  if (candidate.status === 'excluded') return 0;

  const geoRequested = params.geography.countries.length > 0 || params.geography.cities.length > 0;
  const specRequested = params.specialization.length > 0;

  let geoPoints = 15; // география не ограничена пользователем — не штрафуем
  if (geoRequested) {
    const needles = [...params.geography.countries, ...params.geography.cities];
    if (textMatchesAny(candidate.hiringGeography, needles)) geoPoints = 15;
    else if (candidate.hiringGeography) geoPoints = 5; // география указана, но не совпала явно
    else geoPoints = 0; // географии нет вовсе — не проверить соответствие
  } else if (!candidate.hiringGeography) {
    geoPoints = 10; // не ограничивали, но и сами не знаем — среднее
  }

  let specPoints = 15;
  if (specRequested) {
    if (textMatchesAny(candidate.specialization, params.specialization)) specPoints = 15;
    else if (candidate.specialization) specPoints = 5;
    else specPoints = 0;
  } else if (!candidate.specialization) {
    specPoints = 10;
  }

  return Math.min(30, geoPoints + specPoints);
}

function scoreEvidence(candidate: HiringResourceCandidate): number {
  if (candidate.status === 'excluded') return 0;

  let points = 0;
  if (candidate.evidenceUrl?.trim()) points += 12;
  if (candidate.evidenceSummary?.trim() && candidate.evidenceSummary.trim().length > 15) points += 12;
  if (candidate.status === 'confirmed') points += 6;
  return Math.min(30, points);
}

function scoreRecency(candidate: HiringResourceCandidate, params: HiringResourceRunParams): number {
  if (candidate.status === 'excluded') return 0;

  if (!candidate.lastRelevantDate) {
    // Для агентств действующая страница услуг сама по себе не доказывает
    // текущих заказов (раздел 4) — но и не значит "неактуально": средний балл.
    if (candidate.category === 'recruiting_agency' || candidate.category === 'hr_agency') return 12;
    return 5;
  }

  const parsed = Date.parse(candidate.lastRelevantDate);
  if (Number.isNaN(parsed)) return 5;

  const ageDays = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
  if (ageDays < 0) return 5; // дата в будущем — подозрительно, не доверяем полностью
  if (ageDays <= params.recencyDays) return 25;
  if (ageDays <= params.recencyDays * 2) return 10;
  return 0;
}

function scoreContact(candidate: HiringResourceCandidate): number {
  if (candidate.status === 'excluded') return 0;
  if (candidate.contactMethod?.trim()) return 15;
  if (candidate.publicContact?.trim()) return 8;
  return 0;
}

export function scoreResource(candidate: HiringResourceCandidate, params: HiringResourceRunParams): ResourceScore {
  const geoSpec = scoreGeoSpec(candidate, params);
  const evidence = scoreEvidence(candidate);
  const recency = scoreRecency(candidate, params);
  const contact = scoreContact(candidate);
  return { total: geoSpec + evidence + recency + contact, geoSpec, evidence, recency, contact };
}
