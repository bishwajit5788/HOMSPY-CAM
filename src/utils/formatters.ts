/**
 * Formats a byte number to human-readable string (B, KB, MB).
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Parses a hexadecimal string (e.g. "0x1000", "0x0", "8000") to integer.
 */
export function parseHexAddress(input: string): number {
  if (!input) return 0;
  const clean = input.trim().toLowerCase();
  if (clean.startsWith('0x')) {
    return parseInt(clean, 16);
  }
  return parseInt(clean, 16) || parseInt(clean, 10) || 0;
}

/**
 * Formats an address number to a standard hex string (e.g. 0x00010000).
 */
export function formatHexAddress(addr: number): string {
  return `0x${addr.toString(16).toUpperCase()}`;
}

/**
 * Generates an accurate timestamp string in [HH:MM:SS.mmm] format.
 */
export function formatTimestamp(date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `[${hours}:${minutes}:${seconds}.${millis}]`;
}

/**
 * Formats elapsed seconds to "00:00" or "0.0s".
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSecs = Math.floor(seconds % 60);
  return `${mins}m ${remSecs}s`;
}
