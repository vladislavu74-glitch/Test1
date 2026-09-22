import { scoreResource } from '../../src/discovery/scoring';
import type { HiringResourceCandidate, HiringResourceRunParams } from '../../src/discovery/hiringResourceTypes';

function baseParams(overrides: Partial<HiringResourceRunParams> = {}): HiringResourceRunParams {
  return {
    geography: { countries: ['Россия'], cities: ['Казань'], remote: true },
    specialization: ['логистика'],
    categories: ['recruiting_agency'],
    languages: [],
    recencyDays: 90,
    targetCount: 10,
    exclusions: [],
    ...overrides,
  };
}

function baseCandidate(overrides: Partial<HiringResourceCandidate> = {}): HiringResourceCandidate {
  return {
    name: 'Пример',
    url: 'https://example.com',
    category: 'recruiting_agency',
    roles: ['sources_for_clients'],
    organizationName: null,
    hiringGeography: 'Казань',
    agencyLocation: null,
    specialization: 'логистика',
    evidenceSummary: 'Явное предложение подбора персонала для работодателей в разделе услуг.',
    evidenceUrl: 'https://example.com/uslugi',
    lastRelevantDate: new Date().toISOString(),
    contactMethod: 'Форма заявки на сайте',
    publicContact: null,
    status: 'confirmed',
    exclusionReason: null,
    relatedResources: [],
    uncertainties: null,
    ...overrides,
  };
}

describe('scoreResource', () => {
  it('gives a high score to a fully matching, confirmed, recent, contactable resource', () => {
    const score = scoreResource(baseCandidate(), baseParams());
    expect(score.geoSpec).toBe(30);
    expect(score.evidence).toBe(30);
    expect(score.recency).toBe(25);
    expect(score.contact).toBe(15);
    expect(score.total).toBe(100);
  });

  it('scores excluded resources as zero across all dimensions', () => {
    const score = scoreResource(
      baseCandidate({ status: 'excluded', exclusionReason: 'Только объявления "ищу работу"' }),
      baseParams(),
    );
    expect(score.total).toBe(0);
  });

  it('penalizes geography/specialization that do not match the requested ones', () => {
    const score = scoreResource(
      baseCandidate({ hiringGeography: 'Владивосток', specialization: 'дизайн' }),
      baseParams(),
    );
    expect(score.geoSpec).toBeLessThan(30);
  });

  it('drops recency score once the last relevant date is older than the window', () => {
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const score = scoreResource(baseCandidate({ lastRelevantDate: oldDate }), baseParams({ recencyDays: 90 }));
    expect(score.recency).toBe(0);
  });

  it('gives agencies partial recency credit when no specific date is found, unlike other categories', () => {
    const agencyScore = scoreResource(
      baseCandidate({ lastRelevantDate: null, category: 'recruiting_agency' }),
      baseParams(),
    );
    const telegramScore = scoreResource(
      baseCandidate({ lastRelevantDate: null, category: 'telegram' }),
      baseParams(),
    );
    expect(agencyScore.recency).toBeGreaterThan(telegramScore.recency);
  });

  it('rewards a public contact less than a direct contact method', () => {
    const withMethod = scoreResource(baseCandidate({ contactMethod: 'Форма отклика' }), baseParams());
    const withPublicOnly = scoreResource(
      baseCandidate({ contactMethod: null, publicContact: 'hr@example.com' }),
      baseParams(),
    );
    const withNeither = scoreResource(baseCandidate({ contactMethod: null, publicContact: null }), baseParams());
    expect(withMethod.contact).toBeGreaterThan(withPublicOnly.contact);
    expect(withPublicOnly.contact).toBeGreaterThan(withNeither.contact);
  });
});
