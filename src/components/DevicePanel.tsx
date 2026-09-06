import React from 'react';
import { Usb, RefreshCw, PowerOff, CheckCircle2, AlertCircle, HelpCircle, HardDrive } from 'lucide-react';
import type { DeviceState } from '../types/state';
import type { ChipInfo, BoardProfile } from '../types/esp32';
import { BOARD_PROFILES } from '../services/device/boardProfiles';

interface DevicePanelProps {
  deviceState: DeviceState;
  chipInfo: ChipInfo | null;
  selectedBoard: BoardProfile;
  onSelectBoard: (board: BoardProfile) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onHardwareReset: () => void;
  onOpenBootloaderGuide: () => void;
  isConnecting: boolean;
  disabled: boolean;
}

export const DevicePanel: React.FC<DevicePanelProps> = ({
  deviceState,
  chipInfo,
  selectedBoard,
  onSelectBoard,
  onConnect,
  onDisconnect,
  onHardwareReset,
  onOpenBootloaderGuide,
  isConnecting,
  disabled,
}) => {
  const isConnected =
    deviceState === 'CONNECTED' ||
    deviceState === 'DETECTING' ||
    deviceState === 'BOOTLOADER_READY' ||
    deviceState === 'FLASHING' ||
    deviceState === 'VERIFYING' ||
    deviceState === 'FLASH_COMPLETE';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-cyan-400" />
          <h2 className="panel-title">1. Device & Serial Port</h2>
        </div>
        <button
          type="button"
          className="panel-help-link"
          onClick={onOpenBootloaderGuide}
          title="How to enter download mode on XIAO ESP32S3"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Bootloader Mode?</span>
        </button>
      </div>

      <div className="panel-body">
        {/* Board Selection */}
        <div className="form-group">
          <label className="form-label" htmlFor="board-select">Target Board Profile</label>
          <select
            id="board-select"
            className="form-select"
            value={selectedBoard.id}
            onChange={(e) => {
              const found = BOARD_PROFILES.find((b) => b.id === e.target.value);
              if (found) onSelectBoard(found);
            }}
            disabled={disabled || isConnected}
          >
            {BOARD_PROFILES.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name} ({board.mcu})
              </option>
            ))}
          </select>
          <p className="form-helper">
            Optimized for <strong>{selectedBoard.manufacturer}</strong> ({selectedBoard.psram}, {selectedBoard.flashSize} Flash).
          </p>
        </div>

        {/* Connect / Disconnect Buttons */}
        <div className="btn-row">
          {!isConnected ? (
            <button
              type="button"
              className="btn btn-primary w-full py-2.5"
              onClick={onConnect}
              disabled={disabled || isConnecting}
            >
              <Usb className="w-4 h-4" />
              <span>{isConnecting ? 'Connecting & Syncing...' : 'Connect ESP32 (Web Serial)'}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-danger flex-1"
                onClick={onDisconnect}
                disabled={disabled || deviceState === 'FLASHING' || deviceState === 'VERIFYING'}
              >
                <PowerOff className="w-4 h-4" />
                <span>Disconnect</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={onHardwareReset}
                disabled={disabled || deviceState === 'FLASHING' || deviceState === 'VERIFYING'}
                title="Send DTR/RTS reset pulse to reboot the ESP32-S3"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reboot Device</span>
              </button>
            </>
          )}
        </div>

        {/* Hardware Status / Chip Info Card */}
        <div className="chip-info-box">
          <div className="info-row">
            <span className="info-label">Status:</span>
            <span className="info-val">
              {isConnected ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {deviceState === 'BOOTLOADER_READY'
                    ? 'Bootloader Ready'
                    : deviceState}
                </span>
              ) : (
                <span className="text-slate-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Disconnected
                </span>
              )}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Detected Chip:</span>
            <span className="info-val font-mono">
              {chipInfo?.chipName ? (
                <span className="text-cyan-300 font-semibold">{chipInfo.chipName}</span>
              ) : (
                <span className="text-slate-500">Not detected</span>
              )}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">MAC Address:</span>
            <span className="info-val font-mono">
              {chipInfo?.macAddress || <span className="text-slate-500">—</span>}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">Flash Size / ID:</span>
            <span className="info-val font-mono">
              {chipInfo?.flashSize ? (
                <span>
                  {chipInfo.flashSize} {chipInfo.flashId && `(${chipInfo.flashId})`}
                </span>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </span>
          </div>

          <div className="info-row">
            <span className="info-label">USB Port Info:</span>
            <span className="info-val font-mono text-xs">
              {chipInfo?.vendorId ? (
                <span>VID: {chipInfo.vendorId} | PID: {chipInfo.productId}</span>
              ) : (
                <span className="text-slate-500">Select port to read</span>
              )}
            </span>
          </div>
        </div>

        {/* Bootloader Download Mode reminder */}
        {!isConnected && (
          <div className="bootloader-hint">
            <HardDrive className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <strong>Tip for XIAO ESP32S3:</strong> If bootloader sync fails, hold down the miniature{' '}
              <kbd className="kbd-tag">B</kbd> (Boot) button while plugging in USB, then click Connect.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
