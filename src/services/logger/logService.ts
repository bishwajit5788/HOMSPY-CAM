import type { SerialLogEntry, LogType } from '../../types/serial';
import { formatTimestamp } from '../../utils/formatters';

type LogListener = (logs: SerialLogEntry[], latest: SerialLogEntry) => void;

class LogService {
  private logs: SerialLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 2000;

  public getLogs(): SerialLogEntry[] {
    return [...this.logs];
  }

  public addLog(text: string, type: LogType = 'system'): SerialLogEntry {
    const entry: SerialLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: formatTimestamp(),
      rawTime: Date.now(),
      text,
      type,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.notify(entry);
    return entry;
  }

  public clear(): void {
    this.logs = [];
    const clearEntry: SerialLogEntry = {
      id: `${Date.now()}-clear`,
      timestamp: formatTimestamp(),
      rawTime: Date.now(),
      text: '--- Console cleared ---',
      type: 'system',
    };
    this.logs.push(clearEntry);
    this.notify(clearEntry);
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(latest: SerialLogEntry): void {
    const current = [...this.logs];
    this.listeners.forEach((fn) => fn(current, latest));
  }

  public exportLogsAsText(): void {
    if (this.logs.length === 0) return;
    const content = this.logs
      .map((entry) => `${entry.timestamp} [${entry.type.toUpperCase()}] ${entry.text}`)
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `esp32_programmer_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const logService = new LogService();
