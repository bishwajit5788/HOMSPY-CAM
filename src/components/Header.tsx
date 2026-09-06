import React from 'react';
import { Cpu, Usb, AlertTriangle, CheckCircle, Info, HelpCircle } from 'lucide-react';
import type { DeviceState } from '../types/state';
import type { BrowserSupportInfo } from '../utils/webSerialCheck';

interface HeaderProps {
  deviceState: DeviceState;
  browserInfo: BrowserSupportInfo;
  onOpenBootloaderGuide: () => void;
  onOpenBoardSpecs: () => void;
  isSimulationActive: boolean;
  onToggleSimulation: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  deviceState,
  browserInfo,
  onOpenBootloaderGuide,
  onOpenBoardSpecs,
  isSimulationActive,
  onToggleSimulation,
}) => {
  const getStateBadge = (state: DeviceState) => {
    switch (state) {
      case 'DISCONNECTED':
        return { text: 'Disconnected', color: 'badge-gray' };
      case 'CONNECTING':
        return { text: 'Connecting...', color: 'badge-amber animate-pulse' };
      case 'CONNECTED':
        return { text: 'Connected', color: 'badge-blue' };
      case 'DETECTING':
        return { text: 'Detecting ROM...', color: 'badge-blue animate-pulse' };
      case 'BOOTLOADER_READY':
        return { text: 'Bootloader Ready', color: 'badge-emerald' };
      case 'VALIDATING':
        return { text: 'Validating...', color: 'badge-blue animate-pulse' };
      case 'ERASING':
        return { text: 'Erasing Flash...', color: 'badge-amber animate-pulse' };
      case 'FLASHING':
        return { text: 'Flashing...', color: 'badge-purple animate-pulse' };
      case 'VERIFYING':
        return { text: 'Verifying MD5...', color: 'badge-cyan animate-pulse' };
      case 'RESETTING':
        return { text: 'Resetting...', color: 'badge-cyan animate-pulse' };
      case 'FLASH_COMPLETE':
        return { text: 'Flash Complete', color: 'badge-emerald' };
      case 'ERROR':
        return { text: 'Error', color: 'badge-rose' };
      case 'DISCONNECTING':
        return { text: 'Disconnecting...', color: 'badge-gray animate-pulse' };
      default:
        return { text: state, color: 'badge-gray' };
    }
  };

  const badge = getStateBadge(deviceState);

  return (
    <header className="app-header">
      <div className="header-container">
        <div className="header-left">
          <div className="logo-icon">
            <Cpu className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="header-title">ESP32-S3 Programmer</h1>
              <span className="version-pill">v0.9.0-rc.2</span>
            </div>
            <p className="header-subtitle">
              Native Web Serial Flasher & Diagnostics for <strong>Seeed Studio XIAO ESP32S3 Sense</strong>
            </p>
          </div>
        </div>

        <div className="header-right">
          {/* Browser Support Pill */}
          <div
            className={`status-pill ${
              browserInfo.isSupported ? 'pill-success' : 'pill-danger'
            }`}
            title={browserInfo.message}
          >
            {browserInfo.isSupported ? (
              <CheckCircle className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            <span>{browserInfo.isSupported ? 'Web Serial Ready' : 'Web Serial Unsupported'}</span>
          </div>

          {/* Device Connection State Badge */}
          <div className={`status-badge ${badge.color}`}>
            <span className="status-dot"></span>
            <span>{badge.text}</span>
          </div>

          {/* Guide & Specs Buttons */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenBootloaderGuide}
            title="Step-by-step instructions for BOOT/RESET buttons on XIAO ESP32S3"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Bootloader Guide</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onOpenBoardSpecs}
            title="View XIAO ESP32S3 Sense pinouts and camera specs"
          >
            <Info className="w-3.5 h-3.5" />
            <span>XIAO Specs</span>
          </button>

          {/* Test Harness / Simulation Toggle */}
          <button
            type="button"
            className={`btn btn-sm ${
              isSimulationActive ? 'btn-warning-glow' : 'btn-ghost'
            }`}
            onClick={onToggleSimulation}
            title="Toggle isolated test harness (does not touch real hardware)"
          >
            <Usb className="w-3.5 h-3.5" />
            <span>{isSimulationActive ? 'Simulation: ACTIVE' : 'Test Mode'}</span>
          </button>
        </div>
      </div>

      {/* Unsupported Browser Alert Banner */}
      {!browserInfo.isSupported && (
        <div className="browser-warning-banner">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
          <div className="banner-text">
            <strong>Web Serial API Not Supported in this browser:</strong> {browserInfo.message}{' '}
            <span>{browserInfo.recommendation}</span>
          </div>
        </div>
      )}

      {/* Simulation Notice Banner */}
      {isSimulationActive && (
        <div className="simulation-banner">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-300" />
          <span>
            <strong>DEVELOPER SIMULATION ACTIVE:</strong> Running in isolated test harness mode. Actions are simulated for UI validation and do not interact with physical USB hardware.
          </span>
        </div>
      )}
    </header>
  );
};
