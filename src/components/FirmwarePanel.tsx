import React, { useState, useRef } from 'react';
import {
  FileCode,
  Layers,
  UploadCloud,
  AlertTriangle,
  Flame,
  Trash2,
  FileCheck,
  Plus,
  X,
} from 'lucide-react';
import type { FirmwarePackage } from '../types/firmware';
import type { FlashConfig, FlashMode, FlashFreq, FlashSize } from '../types/esp32';
import type { DeviceState } from '../types/state';
import { formatBytes } from '../utils/formatters';

interface FirmwarePanelProps {
  packageData: FirmwarePackage | null;
  flashConfig: FlashConfig;
  deviceState: DeviceState;
  onUpdateFlashConfig: (updates: Partial<FlashConfig>) => void;
  onLoadBuiltin: () => Promise<void>;
  onLoadManifestAndFiles: (manifestText: string, files: File[]) => Promise<void>;
  onLoadCustomFiles: (entries: { file: File; offsetHex: string }[]) => Promise<void>;
  onStartFlash: () => void;
  onEraseFlash: () => void;
  isLoading: boolean;
}

export const FirmwarePanel: React.FC<FirmwarePanelProps> = ({
  packageData,
  flashConfig,
  deviceState,
  onUpdateFlashConfig,
  onLoadBuiltin,
  onLoadManifestAndFiles,
  onLoadCustomFiles,
  onStartFlash,
  onEraseFlash,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'builtin' | 'manifest' | 'custom'>('builtin');
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [manifestBinFiles, setManifestBinFiles] = useState<File[]>([]);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);

  // Custom manual files state
  const [customRows, setCustomRows] = useState<Array<{ file: File | null; offset: string }>>([
    { file: null, offset: '0x0' },
    { file: null, offset: '0x8000' },
    { file: null, offset: '0x10000' },
  ]);

  const manifestInputRef = useRef<HTMLInputElement>(null);
  const manifestBinsInputRef = useRef<HTMLInputElement>(null);

  const canFlash =
    (deviceState === 'BOOTLOADER_READY' || deviceState === 'FLASH_COMPLETE') &&
    packageData !== null &&
    packageData.files.length > 0 &&
    !isLoading;

  const handleManifestSubmit = async () => {
    if (!manifestFile || manifestBinFiles.length === 0) return;
    const text = await manifestFile.text();
    await onLoadManifestAndFiles(text, manifestBinFiles);
  };

  const handleCustomSubmit = async () => {
    const validRows = customRows.filter((r): r is { file: File; offset: string } => r.file !== null);
    if (validRows.length === 0) return;
    await onLoadCustomFiles(validRows.map((r) => ({ file: r.file, offsetHex: r.offset })));
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="panel-title">2. Firmware Selection & Flash</h2>
        </div>
      </div>

      <div className="panel-body">
        {/* Source Tabs */}
        <div className="tab-group">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'builtin' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('builtin');
              onLoadBuiltin();
            }}
          >
            Built-in Example (Stage 1)
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'manifest' ? 'active' : ''}`}
            onClick={() => setActiveTab('manifest')}
          >
            Upload Manifest Package
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            Manual Binary Files (.bin)
          </button>
        </div>

        {/* Tab 1: Built-in Package */}
        {activeTab === 'builtin' && (
          <div className="tab-content">
            <div className="builtin-card">
              <div className="flex items-start gap-3">
                <div className="builtin-icon">
                  <FileCode className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white">
                    XIAO ESP32S3 Sense — Camera & SD Firmware (Stage 1)
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Pre-compiled stage 1 firmware package: Initializes OV2640 camera, checks MicroSD card over SPI, performs test frame capture, and streams diagnostic banners at 115200 baud.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={onLoadBuiltin}
                      disabled={isLoading}
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>{packageData?.source === 'builtin' ? 'Firmware Loaded' : 'Reload Built-in Firmware'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Upload Manifest Package */}
        {activeTab === 'manifest' && (
          <div className="tab-content">
            <div className="upload-box">
              <div className="form-group mb-2">
                <label className="form-label">1. Select manifest.json</label>
                <input
                  type="file"
                  ref={manifestInputRef}
                  accept=".json,application/json"
                  className="file-input"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setManifestFile(f);
                  }}
                />
                {manifestFile && (
                  <span className="text-xs text-cyan-300 mt-1 block">
                    Selected manifest: {manifestFile.name}
                  </span>
                )}
              </div>

              <div className="form-group mb-3">
                <label className="form-label">2. Select Binary Files referenced by manifest (.bin)</label>
                <input
                  type="file"
                  ref={manifestBinsInputRef}
                  accept=".bin"
                  multiple
                  className="file-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setManifestBinFiles(files);
                  }}
                />
                {manifestBinFiles.length > 0 && (
                  <span className="text-xs text-cyan-300 mt-1 block">
                    {manifestBinFiles.length} file(s) attached: {manifestBinFiles.map((f) => f.name).join(', ')}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm w-full"
                onClick={handleManifestSubmit}
                disabled={!manifestFile || manifestBinFiles.length === 0 || isLoading}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Parse & Validate Package</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Custom Binary Files with Offsets */}
        {activeTab === 'custom' && (
          <div className="tab-content">
            <div className="custom-files-box">
              <p className="text-xs text-slate-300 mb-2">
                Select your custom binary files and verify the flash memory offsets:
              </p>
              {customRows.map((row, idx) => (
                <div key={idx} className="custom-row">
                  <div className="flex-1">
                    <input
                      type="file"
                      accept=".bin"
                      className="file-input-compact"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        const copy = [...customRows];
                        copy[idx].file = file;
                        setCustomRows(copy);
                      }}
                    />
                  </div>
                  <div className="w-28">
                    <input
                      type="text"
                      className="form-input text-xs font-mono"
                      placeholder="0x10000"
                      value={row.offset}
                      onChange={(e) => {
                        const copy = [...customRows];
                        copy[idx].offset = e.target.value;
                        setCustomRows(copy);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-icon-danger"
                    onClick={() => {
                      if (customRows.length > 1) {
                        setCustomRows(customRows.filter((_, i) => i !== idx));
                      }
                    }}
                    title="Remove file row"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() =>
                    setCustomRows([...customRows, { file: null, offset: '0x20000' }])
                  }
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Another File</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs ml-auto"
                  onClick={handleCustomSubmit}
                  disabled={!customRows.some((r) => r.file !== null) || isLoading}
                >
                  <FileCheck className="w-3 h-3" />
                  <span>Apply Binary Files</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Firmware Summary Card (Requirement 6) */}
        {packageData && (
          <div className="firmware-summary-card">
            <div className="summary-header">
              <span className="summary-title">Firmware Payload Summary</span>
              <div className="flex items-center gap-2">
                <span className="summary-badge">{packageData.source.toUpperCase()}</span>
                {packageData.trustLevel === 'official_verified' ? (
                  <span className="badge badge-emerald text-xs flex items-center gap-1">
                    <FileCheck className="w-3 h-3" /> Official Verified
                  </span>
                ) : (
                  <span
                    className="badge badge-amber text-xs flex items-center gap-1"
                    title={packageData.trustReason}
                  >
                    <AlertTriangle className="w-3 h-3" /> Unverified Custom
                  </span>
                )}
              </div>
            </div>

            {packageData.flashCapacityStatus === 'unknown' && (
              <div className="p-2.5 my-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Target flash capacity is UNKNOWN.</strong> Automatic boundary verification cannot be performed without a connected device. Verify hardware flash size before flashing custom payloads.
                </div>
              </div>
            )}

            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-label">Target Chip:</span>
                <span className="summary-val font-semibold text-cyan-300">{packageData.chip}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Firmware:</span>
                <span className="summary-val text-white">{packageData.name}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Version:</span>
                <span className="summary-val text-slate-300">{packageData.version}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total Payload:</span>
                <span className="summary-val font-mono text-emerald-400 font-semibold">
                  {formatBytes(packageData.totalSize)}
                </span>
              </div>
            </div>

            {/* Binary Files Table */}
            <div className="files-table-container">
              <table className="files-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Offset</th>
                    <th>Size</th>
                    <th title="Source image MD5. Checked against on-chip SPI flash readback during write.">
                      Local MD5 Checksum
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {packageData.files.map((file, idx) => (
                    <tr key={idx}>
                      <td className="font-mono text-white font-medium">
                        {file.fileName}
                        {file.description && (
                          <div className="text-[10px] text-slate-400">{file.description}</div>
                        )}
                      </td>
                      <td className="font-mono text-cyan-300">{file.offsetHex}</td>
                      <td className="font-mono text-slate-300">{formatBytes(file.size)}</td>
                      <td className="font-mono text-slate-400 text-[11px]" title={file.md5}>
                        {file.md5.substring(0, 10)}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Flash Hardware Configuration Options */}
        <div className="flash-settings-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="flash-mode-select">Flash Mode</label>
            <select
              id="flash-mode-select"
              className="form-select text-xs"
              value={flashConfig.flashMode}
              onChange={(e) => onUpdateFlashConfig({ flashMode: e.target.value as FlashMode })}
              disabled={isLoading}
            >
              <option value="dio">DIO (Dual I/O - Recommended for XIAO)</option>
              <option value="qio">QIO (Quad I/O)</option>
              <option value="dout">DOUT (Dual Output)</option>
              <option value="qout">QOUT (Quad Output)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="flash-freq-select">Flash Frequency</label>
            <select
              id="flash-freq-select"
              className="form-select text-xs"
              value={flashConfig.flashFreq}
              onChange={(e) => onUpdateFlashConfig({ flashFreq: e.target.value as FlashFreq })}
              disabled={isLoading}
            >
              <option value="80m">80 MHz (High Speed)</option>
              <option value="40m">40 MHz (Safe / Standard)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="flash-size-select">Flash Size</label>
            <select
              id="flash-size-select"
              className="form-select text-xs"
              value={flashConfig.flashSize}
              onChange={(e) => onUpdateFlashConfig({ flashSize: e.target.value as FlashSize })}
              disabled={isLoading}
            >
              <option value="8MB">8MB (XIAO ESP32S3 Default)</option>
              <option value="4MB">4MB</option>
              <option value="16MB">16MB</option>
            </select>
          </div>
        </div>

        {/* Erase All Checkbox */}
        <div className="checkbox-row mt-2">
          <label className="checkbox-label">
            <input
              type="checkbox"
              className="form-checkbox"
              checked={flashConfig.eraseAll}
              onChange={(e) => onUpdateFlashConfig({ eraseAll: e.target.checked })}
              disabled={isLoading}
            />
            <span>Erase flash memory before writing</span>
          </label>
        </div>

        {/* Primary Action Buttons */}
        <div className="action-row mt-4">
          <button
            type="button"
            className="btn btn-danger-outline"
            onClick={() => setShowEraseConfirm(true)}
            disabled={
              deviceState !== 'BOOTLOADER_READY' && deviceState !== 'FLASH_COMPLETE'
            }
            title="Erase all flash memory on the ESP32-S3"
          >
            <Trash2 className="w-4 h-4" />
            <span>Erase Entire Flash</span>
          </button>

          <button
            type="button"
            className="btn btn-primary flex-1 py-3 text-sm font-semibold"
            onClick={onStartFlash}
            disabled={!canFlash}
          >
            <Flame className="w-4 h-4 text-amber-400" />
            <span>
              {deviceState === 'FLASHING' || deviceState === 'VERIFYING'
                ? 'Flashing in progress...'
                : 'Flash Firmware'}
            </span>
          </button>
        </div>

        {!canFlash && deviceState !== 'FLASHING' && deviceState !== 'VERIFYING' && (
          <p className="flash-disabled-hint">
            {deviceState === 'DISCONNECTED'
              ? 'Connect the ESP32-S3 in bootloader mode above to enable flashing.'
              : !packageData
              ? 'Select or load a firmware package to enable flashing.'
              : 'Waiting for bootloader synchronization...'}
          </p>
        )}
      </div>

      {/* Erase Confirmation Modal */}
      {showEraseConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <h3 className="modal-title">Confirm Flash Memory Erase</h3>
            </div>
            <p className="modal-text">
              Are you sure you want to erase the <strong>entire flash memory</strong> of the connected ESP32-S3? All firmware, NVS partitions, and stored configuration will be permanently wiped.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowEraseConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setShowEraseConfirm(false);
                  onEraseFlash();
                }}
              >
                Yes, Erase Flash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
