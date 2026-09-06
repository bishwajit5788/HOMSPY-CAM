#!/usr/bin/env node

/**
 * Standalone verification script checking built-in ESP32-S3 firmware binaries,
 * manifest declarations, SHA-256 cryptographic hashes, and image headers.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firmwareDir = path.resolve(__dirname, '../public/firmware/xiao_esp32s3_camera');
const manifestPath = path.join(firmwareDir, 'manifest.json');

console.log('🔍 Starting HOMSPY-CAM Firmware Integrity Verification...');

if (!fs.existsSync(manifestPath)) {
  console.error(`❌ ERROR: manifest.json not found at ${manifestPath}`);
  process.exit(1);
}

const manifestText = fs.readFileSync(manifestPath, 'utf8');
let manifest;
try {
  manifest = JSON.parse(manifestText);
} catch (err) {
  console.error('❌ ERROR: manifest.json is not valid JSON:', err.message);
  process.exit(1);
}

console.log(`📦 Manifest: "${manifest.name}" v${manifest.version} (Target: ${manifest.chip})`);

if (!manifest.files || manifest.files.length === 0) {
  console.error('❌ ERROR: No files declared in manifest.json');
  process.exit(1);
}

let hasErrors = false;
const segments = [];

for (const entry of manifest.files) {
  const filePath = path.join(firmwareDir, entry.path);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ERROR: Declared binary "${entry.path}" does not exist on disk.`);
    hasErrors = true;
    continue;
  }

  const buffer = fs.readFileSync(filePath);
  const size = buffer.byteLength;

  if (size !== entry.size) {
    console.error(`❌ ERROR: Size mismatch for ${entry.path}: manifest=${entry.size}, actual=${size}`);
    hasErrors = true;
  }

  const hash = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();
  if (entry.sha256 && hash !== entry.sha256.toLowerCase()) {
    console.error(`❌ ERROR: SHA-256 mismatch for ${entry.path}:\n  Manifest: ${entry.sha256}\n  Computed: ${hash}`);
    hasErrors = true;
  }

  const offset = parseInt(entry.offset, 16);
  if (offset % 4 !== 0) {
    console.error(`❌ ERROR: Offset 0x${offset.toString(16)} for ${entry.path} is not 4-byte aligned.`);
    hasErrors = true;
  }

  // Header inspection for executable images
  if (offset === 0x0 || offset >= 0x10000) {
    if (size < 24) {
      console.error(`❌ ERROR: Executable ${entry.path} is too small (${size} bytes).`);
      hasErrors = true;
    } else {
      const magic = buffer[0];
      const chipId = buffer[12];
      const appendDigest = buffer[23];

      if (magic !== 0xe9) {
        console.error(`❌ ERROR: Invalid magic byte in ${entry.path}: 0x${magic.toString(16)} (expected 0xE9).`);
        hasErrors = true;
      }
      if (chipId !== 0x09) {
        console.error(`❌ ERROR: Chip ID mismatch in ${entry.path}: 0x${chipId.toString(16)} (expected 0x09 for ESP32-S3).`);
        hasErrors = true;
      }
      if (appendDigest !== 0 && appendDigest !== 1) {
        console.error(`❌ ERROR: Invalid append_digest in ${entry.path}: 0x${appendDigest.toString(16)}.`);
        hasErrors = true;
      }
    }
  }

  segments.push({ path: entry.path, start: offset, end: offset + size });
  console.log(`  ✓ ${entry.path} [0x${offset.toString(16)}]: ${size} bytes | SHA-256: ${hash.substring(0, 16)}...`);
}

// Check memory overlaps
segments.sort((a, b) => a.start - b.start);
for (let i = 0; i < segments.length - 1; i++) {
  if (segments[i].end > segments[i + 1].start) {
    console.error(`❌ ERROR: Address overlap: ${segments[i].path} overlaps with ${segments[i + 1].path}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\n❌ Firmware verification FAILED with errors.');
  process.exit(1);
} else {
  console.log('\n✅ All firmware assets verified successfully! SHA-256 signatures, memory alignments, and ESP32-S3 headers match specifications.');
  process.exit(0);
}
