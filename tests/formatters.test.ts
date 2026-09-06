import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  parseHexAddress,
  formatHexAddress,
  formatTimestamp,
  formatDuration,
} from '../src/utils/formatters';

describe('formatters', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats exact byte amounts', () => {
      expect(formatBytes(512)).toBe('512 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1024 * 1024)).toBe('1 MB');
      expect(formatBytes(8 * 1024 * 1024)).toBe('8 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2 GB');
    });
  });

  describe('parseHexAddress', () => {
    it('parses prefixed hex strings', () => {
      expect(parseHexAddress('0x0')).toBe(0x0);
      expect(parseHexAddress('0x1000')).toBe(0x1000);
      expect(parseHexAddress('0x8000')).toBe(0x8000);
      expect(parseHexAddress('0x10000')).toBe(0x10000);
      expect(parseHexAddress('0X10000')).toBe(0x10000);
    });

    it('parses raw hex strings without prefix', () => {
      expect(parseHexAddress('8000')).toBe(0x8000);
      expect(parseHexAddress('10000')).toBe(0x10000);
    });

    it('returns 0 for empty or invalid inputs', () => {
      expect(parseHexAddress('')).toBe(0);
      expect(parseHexAddress('   ')).toBe(0);
      expect(parseHexAddress('invalid')).toBe(0);
    });
  });

  describe('formatHexAddress', () => {
    it('formats numeric addresses into standard uppercase hex strings', () => {
      expect(formatHexAddress(0)).toBe('0x0');
      expect(formatHexAddress(0x1000)).toBe('0x1000');
      expect(formatHexAddress(0x8000)).toBe('0x8000');
      expect(formatHexAddress(0x10000)).toBe('0x10000');
      expect(formatHexAddress(0x1000000)).toBe('0x1000000');
    });
  });

  describe('formatTimestamp', () => {
    it('returns a formatted timestamp string matching [HH:MM:SS.mmm]', () => {
      const fixedDate = new Date(2026, 8, 7, 14, 5, 9, 42);
      const ts = formatTimestamp(fixedDate);
      expect(ts).toBe('[14:05:09.042]');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds under 1 minute with one decimal place', () => {
      expect(formatDuration(5.2)).toBe('5.2s');
      expect(formatDuration(45)).toBe('45.0s');
    });

    it('formats times over 1 minute as minutes and seconds', () => {
      expect(formatDuration(65)).toBe('1m 5s');
      expect(formatDuration(135)).toBe('2m 15s');
    });
  });
});
