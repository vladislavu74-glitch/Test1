// Критерии, с которыми запускается скан: одно выбранное название должности
// плюс общие фильтры. Пайплайн скана вызывает коннектор один раз на каждое
// выбранное название (см. src/jobs/scan.ts).
export interface ScanCriteria {
  jobTitle: string;
  countries: string[];
  cities: string[];
}

// Нормализованная вакансия, которую возвращает любой коннектор.
export interface RawVacancy {
  externalId: string;
  title: string;
  company?: string;
  url: string;
  location?: string;
  salaryText?: string;
  publishedAt: Date;
}

// Построен на лету из подтверждённого HiringResource перед каждым сканом
// (см. src/jobs/scan.ts, toSourceRecord) — не хранится в БД отдельной
// записью. Для ресурсов с заполненным HiringResource.scanConfig kind/config
// берутся оттуда как есть (hh.ru/SuperJob/Habr Career/ATS-доска/RSS-лента);
// для остальных — выводятся из категории (generic_site/telegram_channel).
export interface SourceRecord {
  id: string;
  key: string;
  name: string;
  kind: 'api' | 'ats' | 'rss' | 'generic_site' | 'telegram_channel';
  country?: string | null;
  config: string;
}

export interface JobSourceConnector {
  key: string;
  search(source: SourceRecord, criteria: ScanCriteria): Promise<RawVacancy[]>;
}

const STOPWORDS = new Set([
  'по', 'в', 'во', 'и', 'для', 'с', 'со', 'на', 'от', 'до', 'из', 'к', 'о', 'об',
  'the', 'of', 'for', 'and', 'a', 'an', 'to', 'in',
]);

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Грубый учёт словоизменений (падежи, дефисные составные вроде "IT-директор"):
// отбрасываем последние 2 символа у слов длиннее 5 — обычно этого достаточно,
// чтобы остался неизменяемый корень слова.
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, word.length - 2) : word;
}

// "Адаптивное" совпадение по названию должности. Требовать, чтобы вакансия
// содержала весь запрос одной подстрокой ("Директор по информационным
// технологиям"), почти никогда не работает — реальные вакансии называются
// иначе ("IT-директор", "Директор по ИТ", "CIO / Директор по информационным
// технологиям"). Вместо этого проверяем, что каждое значимое слово запроса
// (без предлогов/союзов, с учётом словоизменений через stem()) встречается
// в названии вакансии — независимо от порядка слов.
export function matchesJobTitle(candidateText: string, jobTitle: string): boolean {
  const allWords = wordsOf(jobTitle);
  const significant = allWords.filter((w) => !STOPWORDS.has(w));
  const words = significant.length > 0 ? significant : allWords;
  if (words.length === 0) return true;
  const haystack = candidateText.toLowerCase();
  return words.every((w) => haystack.includes(stem(w)));
}
