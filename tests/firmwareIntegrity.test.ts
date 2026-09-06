import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Built-in Firmware Binary Integrity', () => {
  const firmwareDir = path.resolve(__dirname, '../public/firmware/xiao_esp32s3_camera');
  const manifestPath = path.join(firmwareDir, 'manifest.json');

  it('manifest.json exists and is valid JSON', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const text = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(text);

    expect(manifest.name).toBe('XIAO ESP32S3 Camera');
    expect(manifest.chip).toBe('ESP32-S3');
    expect(manifest.files).toBeInstanceOf(Array);
    expect(manifest.files.length).toBe(3);
  });

  it('all declared binary files exist, match exact byte sizes and SHA-256 hashes', () => {
    const text = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(text);

    for (const fileEntry of manifest.files) {
      const filePath = path.join(firmwareDir, fileEntry.path);
      expect(fs.existsSync(filePath), `Binary file ${fileEntry.path} must exist`).toBe(true);

      const buffer = fs.readFileSync(filePath);
      expect(buffer.byteLength).toBe(fileEntry.size);

      const computedSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      expect(computedSha256.toLowerCase()).toBe(fileEntry.sha256.toLowerCase());

      // Check 4-byte offset alignment
      const offset = parseInt(fileEntry.offset, 16);
      expect(offset % 4).toBe(0);
    }
  });

  it('executable images (bootloader & firmware) contain valid ESP32-S3 headers', () => {
    const text = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(text);

    for (const fileEntry of manifest.files) {
      const offset = parseInt(fileEntry.offset, 16);
      if (offset === 0x0 || offset >= 0x10000) {
        const filePath = path.join(firmwareDir, fileEntry.path);
        const buffer = fs.readFileSync(filePath);

        expect(buffer.byteLength).toBeGreaterThanOrEqual(24);

        // Byte 0: Magic byte 0xE9
        expect(buffer[0]).toBe(0xe9);

        // Byte 12: Chip ID 0x09 (ESP32-S3)
        expect(buffer[12]).toBe(0x09);

        // Byte 23: append_digest (0 or 1)
        expect([0, 1]).toContain(buffer[23]);
      }
    }
  });

  it('declares non-overlapping memory segment addresses', () => {
    const text = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(text);

    const segments = manifest.files.map((f: { path: string; offset: string; size: number }) => ({
      path: f.path,
      start: parseInt(f.offset, 16),
      end: parseInt(f.offset, 16) + f.size,
    }));

    segments.sort((a: { start: number }, b: { start: number }) => a.start - b.start);

    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i].end).toBeLessThanOrEqual(
        segments[i + 1].start,
        `Segment ${segments[i].path} overlaps with ${segments[i + 1].path}`
      );
    }
  });
});
