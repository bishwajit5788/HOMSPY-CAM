import type { FirmwarePackage } from '../../types/firmware';

const STORAGE_KEY = 'homspy-cam.firmware-release.v1';

interface ReleaseRecord {
  version: string;
  packageKey: string;
  installedAt: number;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i += 1) if (av[i] !== bv[i]) return av[i] - bv[i];
  return 0;
}

function key(pkg: FirmwarePackage): string {
  return `${pkg.name}|${pkg.version}|${pkg.files.map((f) => `${f.offsetHex}:${f.sha256}`).join('|')}`;
}

class FirmwareRollbackService {
  public check(pkg: FirmwarePackage): { allowed: boolean; reason?: string } {
    if (pkg.trustLevel === 'unverified_custom') return { allowed: true };
    if (!pkg.version || !parseVersion(pkg.version)) {
      return { allowed: false, reason: 'Rollback validation failed: trusted firmware release contains a malformed version string.' };
    }
    const record = this.get();
    if (!record) return { allowed: true };
    const cmp = compareVersions(pkg.version, record.version);
    if (cmp < 0) return { allowed: false, reason: `Rollback blocked: ${pkg.version} is older than the last recorded trusted release ${record.version}.` };
    if (cmp === 0 && key(pkg) !== record.packageKey) return { allowed: false, reason: `Release replacement blocked: version ${pkg.version} is already recorded with a different package fingerprint.` };
    return { allowed: true };
  }

  public recordSuccessfulFlash(pkg: FirmwarePackage): void {
    if (pkg.trustLevel === 'unverified_custom' || !pkg.version || !parseVersion(pkg.version)) return;
    const existing = this.get();
    if (existing) {
      const cmp = compareVersions(pkg.version, existing.version);
      if (cmp < 0) return;
      if (cmp === 0 && key(pkg) !== existing.packageKey) return;
    }
    this.save({ version: pkg.version, packageKey: key(pkg), installedAt: Date.now() });
  }

  public get(): ReleaseRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as ReleaseRecord).version !== 'string' ||
        typeof (parsed as ReleaseRecord).packageKey !== 'string' ||
        typeof (parsed as ReleaseRecord).installedAt !== 'number' ||
        !parseVersion((parsed as ReleaseRecord).version)
      ) {
        return null;
      }
      return parsed as ReleaseRecord;
    } catch { return null; }
  }

  public clearForDevelopment(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
  }

  private save(record: ReleaseRecord): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* best effort */ }
  }
}

export const firmwareRollbackService = new FirmwareRollbackService();
