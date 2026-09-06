# Changelog

All notable changes to the **HOMSPY-CAM** project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.0-rc.1] - 2026-09-07

### Release Status
> **SOFTWARE RELEASE CANDIDATE — READY FOR REAL HARDWARE VALIDATION**  
> *Notice: Software architecture, automated test suites, type contracts, and static bundles are verified. Physical silicon behavior and camera sensor capture require hands-on hardware testing.*

### Added
- **Deterministic 13-State Machine**:
  - Implemented formal state lifecycle: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `DETECTING`, `BOOTLOADER_READY`, `VALIDATING`, `ERASING`, `FLASHING`, `VERIFYING`, `RESETTING`, `FLASH_COMPLETE`, `ERROR`, `DISCONNECTING`.
  - Concurrency lock (`isBusy` mutex) prevents overlapping hardware commands or duplicate execution threads.
  - Actionable troubleshooting steps automatically populated on error states.
- **Flash Safety & Verification Architecture**:
  - Pre-flash cryptographic SHA-256 integrity verification via native Web Crypto API (`crypto.subtle`).
  - Strict 4-byte offset alignment validation for all binary partitions.
  - Memory segment overlap detection preventing partition corruption.
  - Target flash memory capacity boundary enforcement (e.g. 8MB limit for Seeed Studio XIAO ESP32S3).
  - ESP-IDF image binary header validation inspecting magic byte (`0xE9`) and chip identification (`0x0009` for ESP32-S3).
  - Path traversal and URL injection prevention in manifest file declarations.
- **Serial Ownership & Disconnect Protection**:
  - Exclusive port ownership tracking (`none`, `flasher`, `monitor`).
  - Automatic stream lock release ensuring no orphaned reader/writer locks.
  - Native `navigator.serial` disconnect event handler triggering clean state reset on physical USB cable unplugs.
  - Explicit hardware operation timeouts: 15s for ROM bootloader sync, 45s for chip erase, 5s for reset.
- **Stage 1 Camera Firmware & Package**:
  - Complete Arduino camera firmware source code in `firmware/xiao_esp32s3_sense_camera/` with OV2640 pin definitions for Seeed Studio XIAO ESP32S3 Sense.
  - Built-in binary package (`bootloader.bin`, `partitions.bin`, `firmware.bin`) in `public/firmware/xiao_esp32s3_camera/` with valid ESP32-S3 headers and exact SHA-256 checksums in `manifest.json`.
- **Automated Test Suite**:
  - 34 automated unit tests powered by `vitest` covering firmware validation, memory boundary checks, hex parsing/formatting, and state transitions.
- **CI/CD Pipeline**:
  - GitHub Actions automated workflow running `oxlint`, `vitest`, and production build across Node 20.x and 22.x LTS.
- **Security**:
  - Content Security Policy (CSP) meta tag restricting scripts, styles, object embeds, and worker execution.

### Changed
- Upgraded package version to `0.9.0-rc.1`.
- Cleaned up React effect lifecycle in `App.tsx` and `SerialMonitorPanel.tsx` ensuring zero oxlint warnings and zero TypeScript errors.
- Enhanced Header with dynamic status badge reflecting all 13 states.

---

## [0.1.0] - 2026-09-06
- Initial project creation: Web Serial ESP32-S3 flashing tool with React 19, TypeScript, and Vite.
