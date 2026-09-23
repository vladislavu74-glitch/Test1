// Жёсткая серверная проверка соответствия найденного ресурса заданным
// странам (раздел 1: страны — обязательное условие отбора, а не подсказка
// модели). Одного текста в промпте недостаточно: модель иногда всё равно
// подтверждает ресурс с географией вне списка, поэтому здесь мы перепроверяем
// её сами и понижаем/исключаем результат независимо от того, что решила
// модель — см. применение в discoverHiringResources.ts.
//
// hiringGeography — свободный текст модели на русском, с падежными
// окончаниями ("России", "Казахстане"), поэтому точное сравнение строк не
// работает. Сравниваем по "основе" слова (первые буквы, без учёта окончания):
// для большинства топонимов длиной от 5 букв этого достаточно, чтобы
// "Россия"/"России"/"российск-" совпали, а короткие коды (США, ОАЭ)
// сравниваются целиком.
function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-zа-яё]/gi, '');
}

function stem(raw: string): string {
  const normalized = normalizeToken(raw);
  return normalized.length <= 4 ? normalized : normalized.slice(0, 5);
}

export function matchesCountry(hiringGeography: string, countries: string[]): boolean {
  const tokens = hiringGeography
    .split(/[^a-zа-яё]+/i)
    .map(normalizeToken)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return false;
  const tokenStems = tokens.map(stem);

  return countries.some((country) => {
    const countryStem = stem(country);
    return tokenStems.some((t) => t === countryStem || t.startsWith(countryStem) || countryStem.startsWith(t));
  });
}
