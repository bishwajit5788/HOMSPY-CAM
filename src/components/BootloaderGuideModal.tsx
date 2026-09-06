import React from 'react';
import { X, HelpCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

interface BootloaderGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BootloaderGuideModal: React.FC<BootloaderGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-2xl">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
            <h3 className="modal-title">Seeed Studio XIAO ESP32S3 Sense — Bootloader Mode Guide</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close guide">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div className="bg-slate-900/80 border border-slate-700/60 rounded-lg p-4 text-xs text-slate-300">
            <p>
              The <strong>Seeed Studio XIAO ESP32S3 Sense</strong> uses native USB (GPIO19/GPIO20). In normal operation, the running firmware controls the USB port. To flash new firmware or erase the chip, the board must be placed into the <strong>ESP32-S3 ROM Bootloader (Download Mode)</strong>.
            </p>
          </div>

          {/* Visual Hardware Diagram */}
          <div className="hardware-diagram-box">
            <div className="diagram-header">
              <span className="text-xs font-semibold text-slate-300">XIAO ESP32S3 Sense Button Layout</span>
            </div>
            <div className="diagram-art">
              <svg viewBox="0 0 420 180" className="w-full max-w-md mx-auto">
                {/* Board PCB Outline */}
                <rect x="70" y="20" width="280" height="140" rx="14" fill="#0f172a" stroke="#06b6d4" strokeWidth="2" />
                {/* USB-C Connector */}
                <rect x="50" y="60" width="40" height="60" rx="8" fill="#475569" stroke="#94a3b8" strokeWidth="1.5" />
                <text x="56" y="94" fill="#cbd5e1" fontSize="9" fontWeight="bold">USB-C</text>

                {/* 'B' Boot Button */}
                <rect x="110" y="32" width="28" height="22" rx="4" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1.5" />
                <text x="120" y="47" fill="#ffffff" fontSize="12" fontWeight="bold">B</text>
                <text x="105" y="70" fill="#38bdf8" fontSize="10" fontWeight="bold">BOOT (B)</text>

                {/* 'R' Reset Button */}
                <rect x="110" y="126" width="28" height="22" rx="4" fill="#f59e0b" stroke="#fbbf24" strokeWidth="1.5" />
                <text x="120" y="141" fill="#ffffff" fontSize="12" fontWeight="bold">R</text>
                <text x="105" y="118" fill="#fbbf24" fontSize="10" fontWeight="bold">RESET (R)</text>

                {/* ESP32-S3 Metal Shield */}
                <rect x="175" y="40" width="130" height="100" rx="6" fill="#1e293b" stroke="#64748b" strokeWidth="1" />
                <text x="195" y="75" fill="#e2e8f0" fontSize="11" fontWeight="bold">ESP32-S3</text>
                <text x="195" y="92" fill="#94a3b8" fontSize="9">8MB Flash / 8MB PSRAM</text>
                <text x="195" y="108" fill="#06b6d4" fontSize="8">Seeed XIAO Sense</text>

                {/* Sense B2B Connector */}
                <rect x="320" y="45" width="15" height="90" rx="2" fill="#334155" stroke="#475569" strokeWidth="1" />
                <text x="342" y="92" fill="#94a3b8" fontSize="8" transform="rotate(90 342,92)">Expansion B2B (OV2640 + SD)</text>
              </svg>
            </div>
          </div>

          {/* Step-by-step instructions */}
          <div className="steps-list">
            <h4 className="text-xs font-semibold text-cyan-300 uppercase tracking-wider mb-2">
              Step-by-Step Procedure:
            </h4>
            <ol className="space-y-2.5 text-xs text-slate-200">
              <li className="flex items-start gap-2">
                <span className="step-num">1</span>
                <div>
                  <strong>Connect USB-C:</strong> Plug the XIAO ESP32S3 into your computer using a verified data-capable USB-C cable.
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="step-num">2</span>
                <div>
                  <strong>Press and HOLD the "B" Button:</strong> Press and hold down the miniature button marked <strong>"B"</strong> (Boot button, near top edge next to USB-C).
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="step-num">3</span>
                <div>
                  <strong>Press and Release "R" Button:</strong> While still holding the <strong>"B"</strong> button, click and release the button marked <strong>"R"</strong> (Reset button, near bottom edge).
                  <div className="text-slate-400 mt-0.5">
                    <em>Alternative:</em> Hold <strong>"B"</strong> while plugging the USB cable into your computer.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="step-num">4</span>
                <div>
                  <strong>Release "B" Button:</strong> Now release the <strong>"B"</strong> button. The board's status LED will remain quiet and the ESP32-S3 ROM bootloader is now active!
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="step-num">5</span>
                <div>
                  <strong>Connect & Flash:</strong> In this application, click <strong>"Connect ESP32 (Web Serial)"</strong> and choose the serial port (typically identified as <code>USB JTAG/serial debug unit</code> or <code>Seeed XIAO ESP32S3</code>).
                </div>
              </li>
            </ol>
          </div>

          <div className="bg-amber-950/40 border border-amber-600/40 rounded-lg p-3 text-xs text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
            <div>
              <strong>Important Note:</strong> Web browsers cannot mechanically force the board into ROM download mode if the running firmware has locked the USB controller. Always use the tactile buttons above if connection synchronization fails.
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            <CheckCircle2 className="w-4 h-4" />
            <span>Got it, I understand</span>
          </button>
        </div>
      </div>
    </div>
  );
};
