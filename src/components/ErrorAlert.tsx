import React from 'react';
import { AlertOctagon, X, CheckSquare, RefreshCw } from 'lucide-react';
import type { StateDetails } from '../types/state';

interface ErrorAlertProps {
  stateDetails: StateDetails;
  onDismiss: () => void;
  onRetry?: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  stateDetails,
  onDismiss,
  onRetry,
}) => {
  if (stateDetails.state !== 'ERROR') return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content max-w-lg border-rose-600/60 shadow-2xl shadow-rose-950/40">
        <div className="modal-header border-b border-rose-900/40 pb-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <h3 className="modal-title text-rose-400">Operation Error</h3>
          </div>
          <button type="button" className="btn-icon" onClick={onDismiss} title="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body space-y-4 pt-3">
          {/* Main Error Headline & Technical Message */}
          <div className="bg-rose-950/40 border border-rose-800/40 rounded-lg p-3">
            <div className="text-sm font-semibold text-rose-200">
              {stateDetails.message}
            </div>
            {stateDetails.error && (
              <div className="text-xs font-mono text-rose-300/90 mt-1.5 break-words bg-black/40 p-2 rounded">
                {stateDetails.error}
              </div>
            )}
          </div>

          {/* Actionable Remediation Steps */}
          {stateDetails.troubleshooting && stateDetails.troubleshooting.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-cyan-400" />
                <span>Recommended Actions to Resolve:</span>
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-200 pl-1">
                {stateDetails.troubleshooting.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-actions pt-3 border-t border-slate-800">
          <button type="button" className="btn btn-secondary" onClick={onDismiss}>
            Dismiss
          </button>
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Operation</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
