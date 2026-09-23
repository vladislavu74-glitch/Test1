// Экспорт/импорт каталога ресурсов найма как переносимого JSON-файла — чтобы
// перенести уже найденное на другую установку приложения (свой backend на
// другом сервере или другую БД), а не только смотреть в одном месте.
import { prisma } from '../db/client';
import { normalizeUrl, resolveOrganizationId } from './dedupe';

export const EXPORT_FORMAT_VERSION = 1;

// Один ресурс в переносимом формате — organizationId не переносится (это
// внутренний id конкретной БД), вместо него имя организации, которое
// resolveOrganizationId на импорте сопоставит или создаст заново, как и
// при обычном поиске (см. discoverHiringResources.ts).
export interface HiringResourceExportItem {
  name: string;
  url: string;
  category: string;
  roles: string[];
  organizationName: string | null;
  hiringGeography: string | null;
  agencyLocation: string | null;
  specialization: string | null;
  evidenceSummary: string;
  evidenceUrl: string;
  lastRelevantDate: string | null;
  contactMethod: string | null;
  publicContact: string | null;
  status: string;
  exclusionReason: string | null;
  relatedResources: string[];
  uncertainties: string | null;
  score: number;
  scoreGeoSpec: number;
  scoreEvidence: number;
  scoreRecency: number;
  scoreContact: number;
  checkedAt: string;
  firstSeenAt: string;
}

export interface HiringResourceExportFile {
  format: 'jobmonitor.hiring-resources';
  version: number;
  exportedAt: string;
  count: number;
  resources: HiringResourceExportItem[];
}

export async function buildHiringResourceExport(): Promise<HiringResourceExportFile> {
  const resources = await prisma.hiringResource.findMany({
    include: { organization: true },
    orderBy: { score: 'desc' },
  });

  return {
    format: 'jobmonitor.hiring-resources',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    count: resources.length,
    resources: resources.map((r) => ({
      name: r.name,
      url: r.url,
      category: r.category,
      roles: JSON.parse(r.roles) as string[],
      organizationName: r.organization?.name ?? null,
      hiringGeography: r.hiringGeography,
      agencyLocation: r.agencyLocation,
      specialization: r.specialization,
      evidenceSummary: r.evidenceSummary,
      evidenceUrl: r.evidenceUrl,
      lastRelevantDate: r.lastRelevantDate ? r.lastRelevantDate.toISOString() : null,
      contactMethod: r.contactMethod,
      publicContact: r.publicContact,
      status: r.status,
      exclusionReason: r.exclusionReason,
      relatedResources: JSON.parse(r.relatedResources ?? '[]') as string[],
      uncertainties: r.uncertainties,
      score: r.score,
      scoreGeoSpec: r.scoreGeoSpec,
      scoreEvidence: r.scoreEvidence,
      scoreRecency: r.scoreRecency,
      scoreContact: r.scoreContact,
      checkedAt: r.checkedAt.toISOString(),
      firstSeenAt: r.firstSeenAt.toISOString(),
    })),
  };
}

export interface ImportOutcome {
  total: number;
  created: number;
  updated: number;
  errors: string[];
}

function isExportFile(value: unknown): value is HiringResourceExportFile {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as HiringResourceExportFile).format === 'jobmonitor.hiring-resources' &&
    Array.isArray((value as HiringResourceExportFile).resources)
  );
}

// Принимает как полный файл экспорта ({format, version, resources}), так и
// голый массив ресурсов — на случай, если файл собрали/отредактировали
// вручную. Найденные на импортирующем устройстве ресурсы отмечаются
// isNew=true (для этого устройства это действительно новые записи),
// isStale=false и без привязки к какому-либо HiringResourceRun.
export async function importHiringResources(payload: unknown): Promise<ImportOutcome> {
  const items: HiringResourceExportItem[] = isExportFile(payload)
    ? payload.resources
    : Array.isArray(payload)
      ? (payload as HiringResourceExportItem[])
      : [];

  if (items.length === 0 && !Array.isArray(payload) && !isExportFile(payload)) {
    throw new Error('Ожидался файл экспорта ресурсов найма (format: "jobmonitor.hiring-resources") или массив ресурсов');
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const normalizedUrl = normalizeUrl(item.url);
      const organizationId = await resolveOrganizationId(item.organizationName);

      const data = {
        name: item.name,
        category: item.category,
        roles: JSON.stringify(item.roles ?? []),
        organizationId,
        hiringGeography: item.hiringGeography,
        agencyLocation: item.agencyLocation,
        specialization: item.specialization,
        evidenceSummary: item.evidenceSummary,
        evidenceUrl: item.evidenceUrl,
        lastRelevantDate: item.lastRelevantDate ? new Date(item.lastRelevantDate) : null,
        contactMethod: item.contactMethod,
        publicContact: item.publicContact,
        status: item.status,
        exclusionReason: item.exclusionReason,
        relatedResources: JSON.stringify(item.relatedResources ?? []),
        uncertainties: item.uncertainties,
        score: item.score,
        scoreGeoSpec: item.scoreGeoSpec,
        scoreEvidence: item.scoreEvidence,
        scoreRecency: item.scoreRecency,
        scoreContact: item.scoreContact,
        isStale: false,
        runId: null,
      };

      const existing = await prisma.hiringResource.findUnique({ where: { url: normalizedUrl } });
      await prisma.hiringResource.upsert({
        where: { url: normalizedUrl },
        create: { ...data, url: normalizedUrl, isNew: true },
        update: data,
      });
      if (existing) updated += 1;
      else created += 1;
    } catch (error) {
      errors.push(`[${item.name ?? item.url}] ${(error as Error).message}`);
    }
  }

  return { total: items.length, created, updated, errors };
}
