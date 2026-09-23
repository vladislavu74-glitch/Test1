import { matchesCountry } from '../../src/discovery/geography';

describe('matchesCountry', () => {
  it('matches despite Russian case endings', () => {
    expect(matchesCountry('Ищут сотрудников по всей России', ['Россия'])).toBe(true);
    expect(matchesCountry('Вакансии в Казахстане и Узбекистане', ['Казахстан'])).toBe(true);
    expect(matchesCountry('Найм в Беларуси', ['Беларусь'])).toBe(true);
  });

  it('matches short country codes as whole tokens', () => {
    expect(matchesCountry('Найм для офиса в ОАЭ', ['ОАЭ'])).toBe(true);
    expect(matchesCountry('Удалённая работа, компания в США', ['США'])).toBe(true);
  });

  it('returns false when no listed country appears in the text', () => {
    expect(matchesCountry('Ищут сотрудников в Польше', ['Россия', 'Казахстан'])).toBe(false);
  });

  it('matches if any of several requested countries appears', () => {
    expect(matchesCountry('Найм в Германии', ['Россия', 'Германия'])).toBe(true);
  });
});
