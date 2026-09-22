import { matchesJobTitle } from '../../src/connectors/types';

describe('matchesJobTitle', () => {
  it('matches an exact phrase (existing behavior)', () => {
    expect(matchesJobTitle('iOS Developer', 'iOS Developer')).toBe(true);
  });

  it('does not require the query words to appear in order or contiguously', () => {
    expect(matchesJobTitle('Senior Developer (iOS)', 'iOS Developer')).toBe(true);
  });

  it('tolerates Russian case endings via stemming', () => {
    // Запрос — "Директор по информационным технологиям" (дательный падеж),
    // реальная вакансия сформулирована иначе и в другом падеже.
    expect(matchesJobTitle('IT-директор (информационных технологий)', 'Директор по информационным технологиям')).toBe(
      true,
    );
  });

  it('ignores stopwords (prepositions/conjunctions) when checking coverage', () => {
    expect(matchesJobTitle('Директор информационных технологий', 'Директор по информационным технологиям')).toBe(
      true,
    );
  });

  it('still rejects a title missing a significant query word', () => {
    expect(matchesJobTitle('Android Developer', 'iOS Developer')).toBe(false);
  });

  it('rejects unrelated titles entirely', () => {
    expect(matchesJobTitle('Menеджер по продажам', 'Директор по информационным технологиям')).toBe(false);
  });
});
