import { config } from '../config';
import type { JobSourceConnector, RawVacancy, ScanCriteria, SourceRecord } from './types';

// Публичный API SuperJob (https://api.superjob.ru/2.0/vacancies/,
// документация: https://api.superjob.ru/). Требует ключ приложения
// (заголовок X-Api-App-Id), см. SUPERJOB_API_KEY в .env.
interface SuperJobResponse {
  objects: Array<{
    id: number;
    profession: string;
    link: string;
    date_published: number; // unix timestamp
    firm_name?: string;
    town?: { title?: string };
    payment_from?: number;
    payment_to?: number;
    currency?: string;
  }>;
}

export const superJobConnector: JobSourceConnector = {
  key: 'superjob',

  async search(_source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]> {
    if (!config.superJobApiKey) {
      throw new Error('SUPERJOB_API_KEY не задан — зарегистрируйте приложение на api.superjob.ru');
    }

    const params = new URLSearchParams({
      keyword: criteria.jobTitle,
      count: '50',
      order_field: 'date',
      order_direction: 'desc',
    });
    if (criteria.salaryMin) params.set('payment_from', String(criteria.salaryMin));
    if (criteria.remoteOnly) params.set('remote_work', '1');

    const response = await fetch(`https://api.superjob.ru/2.0/vacancies/?${params.toString()}`, {
      headers: { 'X-Api-App-Id': config.superJobApiKey },
    });
    if (!response.ok) {
      throw new Error(`SuperJob API error: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as SuperJobResponse;

    return data.objects.map((item) => ({
      externalId: String(item.id),
      title: item.profession,
      company: item.firm_name,
      url: item.link,
      location: item.town?.title,
      salaryText: formatSalary(item.payment_from, item.payment_to, item.currency),
      publishedAt: new Date(item.date_published * 1000),
    }));
  },
};

function formatSalary(from?: number, to?: number, currency?: string): string | undefined {
  const parts: string[] = [];
  if (from) parts.push(`от ${from}`);
  if (to) parts.push(`до ${to}`);
  if (currency) parts.push(currency);
  return parts.length ? parts.join(' ') : undefined;
}
