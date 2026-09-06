#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const firmwareDir = path.resolve(__dirname, '../public/firmware/xiao_esp32s3_camera');
const manifestPath = path.join(firmwareDir, 'manifest.json');

console.log('Starting HOMSPY-CAM Firmware Integrity Verification...');
if (!fs.existsSync(manifestPath)) { console.error(`ERROR: manifest.json not found at ${manifestPath}`); process.exit(1); }

let manifest;
try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
catch (err) { console.error('ERROR: manifest.json is not valid JSON:', err.message); process.exit(1); }

console.log(`Manifest: "${manifest.name}" v${manifest.version} (Target: ${manifest.chip})`);
if (!manifest.files?.length) { console.error('ERROR: No files declared in manifest.json'); process.exit(1); }

let hasErrors = false;
const segments = [];

for (const entry of manifest.files) {
  const filePath = path.join(firmwareDir, entry.path);
  if (!fs.existsSync(filePath)) { console.error(`ERROR: Declared binary "${entry.path}" does not exist on disk.`); hasErrors = true; continue; }
  const buffer = fs.readFileSync(filePath);
  const size = buffer.byteLength;
  if (!Number.isSafeInteger(entry.size) || size !== entry.size) { console.error(`ERROR: Size mismatch for ${entry.path}: manifest=${entry.size}, actual=${size}`); hasErrors = true; }
  if (!/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) { console.error(`ERROR: ${entry.path} is missing a valid SHA-256 pin.`); hasErrors = true; }
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
  if (hash !== entry.sha256.toLowerCase()) { console.error(`ERROR: SHA-256 mismatch for ${entry.path}: manifest=${entry.sha256}, computed=${hash}`); hasErrors = true; }

  const offset = Number.parseInt(entry.offset, 16);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset % 4 !== 0) { console.error(`ERROR: Invalid/alignment failure for offset ${entry.offset} (${entry.path}).`); hasErrors = true; }

  if (offset === 0 || offset >= 0x10000) {
    if (size < 24) { console.error(`ERROR: Executable ${entry.path} is too small (${size} bytes).`); hasErrors = true; }
    else {
      const magic = buffer[0];
      const chipId = buffer[12] | (buffer[13] << 8);
      const hashAppended = buffer[23];
      if (magic !== 0xe9) { console.error(`ERROR: Invalid magic byte in ${entry.path}: 0x${magic.toString(16)} (expected 0xE9).`); hasErrors = true; }
      if (chipId !== 0x0009) { console.error(`ERROR: Chip ID mismatch in ${entry.path}: 0x${chipId.toString(16).padStart(4, '0')} (expected 0x0009 for ESP32-S3).`); hasErrors = true; }
      if (hashAppended !== 0 && hashAppended !== 1) { console.error(`ERROR: Invalid hash_appended in ${entry.path}: 0x${hashAppended.toString(16)}.`); hasErrors = true; }
    }
  }
  segments.push({ path: entry.path, start: offset, end: offset + size });
  console.log(`  OK ${entry.path} [0x${offset.toString(16)}]: ${size} bytes | SHA-256: ${hash.substring(0, 16)}...`);
}

segments.sort((a, b) => a.start - b.start);
for (let i = 0; i < segments.length - 1; i++) {
  if (segments[i].end > segments[i + 1].start) { console.error(`ERROR: Address overlap: ${segments[i].path} overlaps ${segments[i + 1].path}`); hasErrors = true; }
}

if (hasErrors) { console.error('\nFirmware verification FAILED.'); process.exit(1); }
console.log('\nAll firmware assets verified: sizes, pinned SHA-256 checksums, alignment, non-overlap, and ESP32-S3 image headers.');
process.exit(0);
