import React from 'react';
import { Activity, CheckCircle, AlertCircle, Clock, Zap, FileText } from 'lucide-react';
import type { FlashProgress } from '../types/esp32';
import type { DeviceState } from '../types/state';
import { formatBytes, formatDuration } from '../utils/formatters';

interface FlashProgressPanelProps {
  progress: FlashProgress;
  deviceState: DeviceState;
}

export const FlashProgressPanel: React.FC<FlashProgressPanelProps> = ({
  progress,
  deviceState,
}) => {
  const isFlashing = deviceState === 'FLASHING' || deviceState === 'VERIFYING';
  const isComplete = deviceState === 'FLASH_COMPLETE';
  const isError = deviceState === 'ERROR' && progress.stage === 'failed';

  // Only show or highlight when an operation was initiated or completed
  const hasStarted = progress.stage !== 'idle';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-purple-400" />
          <h2 className="panel-title">Flash Progress & Diagnostics</h2>
        </div>
        <div className="flex items-center gap-2">
          {isComplete && (
            <span className="badge-emerald text-xs px-2 py-0.5 rounded flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Verified & Complete
            </span>
          )}
          {isError && (
            <span className="badge-rose text-xs px-2 py-0.5 rounded flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Flashing Halted
            </span>
          )}
        </div>
      </div>

      <div className="panel-body">
        {/* Progress Bar & Percentage */}
        <div className="progress-section">
          <div className="progress-info-row">
            <span className="progress-stage-text">
              {progress.stageText || 'Ready to flash'}
            </span>
            <span className="progress-pct font-mono font-bold">
              {progress.percentage}%
            </span>
          </div>

          <div className="progress-track">
            <div
              className={`progress-fill ${
                isComplete
                  ? 'progress-success'
                  : isError
                  ? 'progress-error'
                  : isFlashing
                  ? 'progress-animated'
                  : ''
              }`}
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Real-time Metric Tiles */}
        <div className="metrics-grid mt-4">
          <div className="metric-tile">
            <div className="metric-icon text-cyan-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="metric-label">Data Written</div>
              <div className="metric-value font-mono">
                {formatBytes(progress.writtenBytes)} / {formatBytes(progress.totalBytes)}
              </div>
            </div>
          </div>

          <div className="metric-tile">
            <div className="metric-icon text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="metric-label">Elapsed Time</div>
              <div className="metric-value font-mono">
                {formatDuration(progress.elapsedSeconds)}
              </div>
            </div>
          </div>

          <div className="metric-tile">
            <div className="metric-icon text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="metric-label">Transfer Speed</div>
              <div className="metric-value font-mono">
                {progress.speedKbps > 0 ? `${progress.speedKbps} KB/s` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Current Segment File Detail */}
        {hasStarted && progress.currentFileName && (
          <div className="current-file-banner mt-3">
            <span className="text-slate-400 text-xs">Active Segment:</span>
            <span className="text-cyan-300 font-mono text-xs ml-2 font-medium">
              {progress.currentFileName} ({progress.fileIndex} of {progress.totalFiles})
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
