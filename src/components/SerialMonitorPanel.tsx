import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal,
  Play,
  Square,
  Trash2,
  Download,
  Send,
  ArrowDown,
  Pause,
} from 'lucide-react';
import type { BaudRate, LineEnding, SerialLogEntry } from '../types/serial';
import type { DeviceState } from '../types/state';

interface SerialMonitorPanelProps {
  logs: SerialLogEntry[];
  isMonitorOpen: boolean;
  baudRate: BaudRate;
  lineEnding: LineEnding;
  deviceState: DeviceState;
  onBaudRateChange: (baud: BaudRate) => void;
  onLineEndingChange: (ending: LineEnding) => void;
  onToggleMonitor: () => void;
  onClearLogs: () => void;
  onExportLogs: () => void;
  onSendText: (text: string) => void;
}

const BAUD_RATES: BaudRate[] = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
];

export const SerialMonitorPanel: React.FC<SerialMonitorPanelProps> = ({
  logs,
  isMonitorOpen,
  baudRate,
  lineEnding,
  deviceState,
  onBaudRateChange,
  onLineEndingChange,
  onToggleMonitor,
  onClearLogs,
  onExportLogs,
  onSendText,
}) => {
  const [inputText, setInputText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Filter logs if paused
  const [frozenLogs, setFrozenLogs] = useState<SerialLogEntry[]>([]);

  useEffect(() => {
    if (!isPaused) {
      setFrozenLogs(logs);
    }
  }, [logs, isPaused]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && terminalRef.current && !isPaused) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [frozenLogs, autoScroll, isPaused]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !isMonitorOpen) return;
    onSendText(inputText);
    setInputText('');
  };

  const handleQuickCommand = (cmd: string) => {
    if (!isMonitorOpen) return;
    onSendText(cmd);
  };

  const isFlashing = deviceState === 'FLASHING' || deviceState === 'VERIFYING';

  return (
    <div className="panel-card flex flex-col h-full">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="panel-title">Serial Monitor & Terminal</h2>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Baud Rate */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">Baud:</span>
            <select
              className="form-select text-xs py-1 px-2 w-24"
              value={baudRate}
              onChange={(e) => onBaudRateChange(Number(e.target.value) as BaudRate)}
              disabled={isMonitorOpen}
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          {/* Line Ending */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400">Ending:</span>
            <select
              className="form-select text-xs py-1 px-2 w-20"
              value={lineEnding}
              onChange={(e) => onLineEndingChange(e.target.value as LineEnding)}
            >
              <option value={'\n'}>LF (\n)</option>
              <option value={'\r\n'}>CRLF</option>
              <option value={'\r'}>CR (\r)</option>
              <option value={''}>None</option>
            </select>
          </div>

          {/* Connect / Disconnect Monitor */}
          <button
            type="button"
            className={`btn btn-xs ${isMonitorOpen ? 'btn-danger' : 'btn-emerald'}`}
            onClick={onToggleMonitor}
            disabled={isFlashing}
            title={
              isMonitorOpen
                ? 'Close serial monitor'
                : 'Open serial monitor at selected baud rate'
            }
          >
            {isMonitorOpen ? (
              <>
                <Square className="w-3 h-3" />
                <span>Stop Monitor</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                <span>Start Monitor</span>
              </>
            )}
          </button>

          {/* Pause / Resume */}
          <button
            type="button"
            className={`btn btn-secondary btn-xs ${isPaused ? 'bg-amber-900 text-amber-300' : ''}`}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume live terminal stream' : 'Pause terminal display'}
          >
            <Pause className="w-3 h-3" />
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          {/* Auto-scroll Toggle */}
          <button
            type="button"
            className={`btn btn-secondary btn-xs ${autoScroll ? 'text-cyan-400' : 'text-slate-500'}`}
            onClick={() => setAutoScroll(!autoScroll)}
            title="Toggle terminal auto-scroll to bottom"
          >
            <ArrowDown className="w-3 h-3" />
            <span>Scroll</span>
          </button>

          {/* Clear */}
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onClearLogs}
            title="Clear terminal buffer"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>

          {/* Export Log */}
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={onExportLogs}
            title="Download terminal logs as a text file"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>
        </div>
      </div>

      <div className="panel-body flex-1 flex flex-col p-0">
        {/* Terminal Screen */}
        <div ref={terminalRef} className="terminal-display flex-1">
          {frozenLogs.length === 0 ? (
            <div className="terminal-placeholder">
              <span>[Terminal idle. Click "Start Monitor" to listen on {baudRate} baud.]</span>
            </div>
          ) : (
            frozenLogs.map((entry) => (
              <div key={entry.id} className={`terminal-line line-${entry.type}`}>
                <span className="line-ts">{entry.timestamp}</span>
                <span className="line-text">{entry.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Quick Commands & TX Input Bar */}
        <div className="terminal-footer">
          {/* Quick command buttons for XIAO ESP32S3 Camera firmware */}
          <div className="quick-commands-bar">
            <span className="text-[11px] text-slate-400">Quick Commands:</span>
            <button
              type="button"
              className="btn-quick-cmd"
              onClick={() => handleQuickCommand('capture')}
              disabled={!isMonitorOpen}
              title="Send 'capture' to take a photo"
            >
              capture
            </button>
            <button
              type="button"
              className="btn-quick-cmd"
              onClick={() => handleQuickCommand('status')}
              disabled={!isMonitorOpen}
              title="Send 'status' to print diagnostics"
            >
              status
            </button>
            <button
              type="button"
              className="btn-quick-cmd"
              onClick={() => handleQuickCommand('help')}
              disabled={!isMonitorOpen}
              title="Send 'help' command"
            >
              help
            </button>
          </div>

          <form onSubmit={handleSend} className="terminal-input-row">
            <input
              type="text"
              className="terminal-input"
              placeholder={
                isMonitorOpen
                  ? "Type command to send over serial (e.g. 'capture', 'status')..."
                  : "Serial monitor closed. Click 'Start Monitor' to send data."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={!isMonitorOpen}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm px-4"
              disabled={!isMonitorOpen || !inputText.trim()}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
