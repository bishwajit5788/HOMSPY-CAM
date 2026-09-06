import React from 'react';
import { X, Cpu, Camera, HardDrive, BatteryCharging, Radio, Info } from 'lucide-react';
import type { BoardProfile } from '../types/esp32';

interface BoardSpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardProfile: BoardProfile;
}

export const BoardSpecsModal: React.FC<BoardSpecsModalProps> = ({
  isOpen,
  onClose,
  boardProfile,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-3xl">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-cyan-400" />
            <h3 className="modal-title">{boardProfile.name} — Hardware Reference</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close reference">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {/* Key Specs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="spec-card">
              <div className="spec-card-header">
                <Cpu className="w-4 h-4 text-cyan-400" />
                <span className="spec-card-title">Processor & Memory</span>
              </div>
              <ul className="spec-list">
                <li><strong>MCU:</strong> {boardProfile.mcu}</li>
                <li><strong>Flash:</strong> 8MB QSPI High-Speed Flash</li>
                <li><strong>PSRAM:</strong> {boardProfile.psram} (Crucial for camera framebuffers)</li>
                <li><strong>SRAM:</strong> 512KB internal SRAM</li>
                <li><strong>ROM:</strong> 384KB Bootloader ROM</li>
              </ul>
            </div>

            <div className="spec-card">
              <div className="spec-card-header">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span className="spec-card-title">OV2640 Camera Subsystem</span>
              </div>
              <ul className="spec-list">
                <li><strong>Sensor:</strong> Omnivision OV2640 (2-Megapixel)</li>
                <li><strong>Max Resolution:</strong> UXGA 1600x1200 JPEG</li>
                <li><strong>Bus:</strong> 8-bit DVP Parallel Video Interface</li>
                <li><strong>Clock (XCLK):</strong> GPIO 10 (20 MHz)</li>
                <li><strong>I2C Control:</strong> SDA GPIO 40 / SCL GPIO 39</li>
                <li><strong>Sync:</strong> VSYNC GPIO 38 / HREF GPIO 47 / PCLK GPIO 13</li>
              </ul>
            </div>

            <div className="spec-card">
              <div className="spec-card-header">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span className="spec-card-title">MicroSD Expansion Interface</span>
              </div>
              <ul className="spec-list">
                <li><strong>Mode:</strong> SPI / SD_MMC 1-bit high-speed</li>
                <li><strong>CS (Chip Select):</strong> GPIO 21</li>
                <li><strong>SCK (Clock):</strong> GPIO 7 (D8)</li>
                <li><strong>MISO (Data In):</strong> GPIO 8 (D9)</li>
                <li><strong>MOSI (Data Out):</strong> GPIO 9 (D10)</li>
              </ul>
            </div>

            <div className="spec-card">
              <div className="spec-card-header">
                <BatteryCharging className="w-4 h-4 text-purple-400" />
                <span className="spec-card-title">Power & Battery Management</span>
              </div>
              <ul className="spec-list">
                <li><strong>Input:</strong> 5V via USB-C or VIN pads</li>
                <li><strong>Battery:</strong> 3.7V Li-ion / LiPo charging circuit</li>
                <li><strong>Charge Current:</strong> 50mA / 100mA selectable</li>
                <li><strong>Solar Stage 1:</strong> Ideal for low-power solar trail camera</li>
              </ul>
            </div>
          </div>

          {/* Camera Pin Mapping Table */}
          <div className="pin-table-box">
            <h4 className="text-xs font-semibold text-slate-300 mb-2">
              Internal B2B Camera Pinout Reference (XIAO ESP32S3 Sense):
            </h4>
            <div className="overflow-x-auto">
              <table className="specs-table text-xs w-full">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>ESP32-S3 GPIO</th>
                    <th>Signal</th>
                    <th>ESP32-S3 GPIO</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>CAM D0 (Y2)</td>
                    <td className="font-mono text-cyan-300">GPIO 15</td>
                    <td>CAM D1 (Y3)</td>
                    <td className="font-mono text-cyan-300">GPIO 17</td>
                  </tr>
                  <tr>
                    <td>CAM D2 (Y4)</td>
                    <td className="font-mono text-cyan-300">GPIO 18</td>
                    <td>CAM D3 (Y5)</td>
                    <td className="font-mono text-cyan-300">GPIO 16</td>
                  </tr>
                  <tr>
                    <td>CAM D4 (Y6)</td>
                    <td className="font-mono text-cyan-300">GPIO 14</td>
                    <td>CAM D5 (Y7)</td>
                    <td className="font-mono text-cyan-300">GPIO 12</td>
                  </tr>
                  <tr>
                    <td>CAM D6 (Y8)</td>
                    <td className="font-mono text-cyan-300">GPIO 11</td>
                    <td>CAM D7 (Y9)</td>
                    <td className="font-mono text-cyan-300">GPIO 48</td>
                  </tr>
                  <tr>
                    <td>XCLK (Clock)</td>
                    <td className="font-mono text-cyan-300">GPIO 10</td>
                    <td>PCLK (Pixel Clock)</td>
                    <td className="font-mono text-cyan-300">GPIO 13</td>
                  </tr>
                  <tr>
                    <td>VSYNC (V-Sync)</td>
                    <td className="font-mono text-cyan-300">GPIO 38</td>
                    <td>HREF (H-Sync)</td>
                    <td className="font-mono text-cyan-300">GPIO 47</td>
                  </tr>
                  <tr>
                    <td>SCCB SDA</td>
                    <td className="font-mono text-cyan-300">GPIO 40</td>
                    <td>SCCB SCL</td>
                    <td className="font-mono text-cyan-300">GPIO 39</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Architecture Roadmap Notice */}
          <div className="roadmap-notice">
            <Radio className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300">
              <strong>Solar Camera Roadmap:</strong> This application provides the <strong>Stage 1 (ESP32-S3 Flasher + Diagnostics)</strong> foundation. Stage 2 (Local Wi-Fi), Stage 3 (Long-range digital video), Stage 4 (Gateway receiver), and Stage 5 (Cloud/remote monitoring) will integrate seamlessly onto this core architecture.
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
