import type { FlashConfig } from '../../types/esp32';
import type { FirmwarePackage } from '../../types/firmware';

export interface FlashRecoveryRecord {
  packageKey: string;
  packageName: string;
  version: string;
  phase: 'validating' | 'erasing' | 'writing' | 'verifying' | 'resetting';
  fileIndex: number;
  writtenBytes: number;
  totalBytes: number;
  startedAt: number;
  updatedAt: number;
  interrupted: boolean;
}

const STORAGE_KEY = 'homspy-cam.flash-recovery.v1';

function packageKey(pkg: FirmwarePackage): string {
  return `${pkg.name}|${pkg.version}|${pkg.files.map((f) => `${f.offsetHex}:${f.size}:${f.sha256}`).join('|')}`;
}

class FlashRecoveryService {
  public createKey(pkg: FirmwarePackage): string { return packageKey(pkg); }

  public begin(pkg: FirmwarePackage, phase: FlashRecoveryRecord['phase'], config: FlashConfig): void {
    const now = Date.now();
    this.save({ packageKey: packageKey(pkg), packageName: pkg.name, version: pkg.version, phase, fileIndex: 0, writtenBytes: 0, totalBytes: pkg.totalSize, startedAt: now, updatedAt: now, interrupted: false });
    void config;
  }

  public update(pkg: FirmwarePackage, phase: FlashRecoveryRecord['phase'], fileIndex: number, writtenBytes: number): void {
    const existing = this.get();
    const now = Date.now();
    this.save({ packageKey: packageKey(pkg), packageName: pkg.name, version: pkg.version, phase, fileIndex, writtenBytes, totalBytes: pkg.totalSize, startedAt: existing?.startedAt ?? now, updatedAt: now, interrupted: false });
  }

  public markInterrupted(): void {
    const record = this.get();
    if (!record) return;
    this.save({ ...record, interrupted: true, updatedAt: Date.now() });
  }

  public clear(): void {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
  }

  public get(): FlashRecoveryRecord | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as FlashRecoveryRecord;
      if (!parsed.packageKey || !parsed.version || !parsed.phase) return null;
      return parsed;
    } catch { return null; }
  }

  public matches(pkg: FirmwarePackage): boolean {
    const record = this.get();
    return Boolean(record?.interrupted && record.packageKey === packageKey(pkg));
  }

  private save(record: FlashRecoveryRecord): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch { /* recovery is best effort */ }
  }
}

export const flashRecoveryService = new FlashRecoveryService();
