/**
 * DemoControls — Fixed UI overlay for the demo environment.
 * Shows the "Demo Environment" badge, Start Tour button, and Reset button.
 * Only rendered when VITE_APP_MODE === 'demo'.
 */
import React, { useState } from 'react';
import { Play, RotateCcw, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

interface DemoControlsProps {
  onStartTour: () => void;
  onReset: () => void;
  isTourActive: boolean;
}

const DemoControls: React.FC<DemoControlsProps> = ({ onStartTour, onReset, isTourActive }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const handleReset = () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000);
      return;
    }
    setResetConfirm(false);
    onReset();
  };

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col items-end gap-2">
      {/* Environment badge */}
      <div
        className="flex items-center gap-2 bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
        title="Toggle demo controls"
      >
        <FlaskConical className="h-3.5 w-3.5" />
        Demo Environment
        {collapsed ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )}
      </div>

      {/* Action buttons */}
      {!collapsed && (
        <div className="flex flex-col items-end gap-1.5 animate-fade-in">
          {/* Start / Restart Tour */}
          <button
            onClick={onStartTour}
            disabled={isTourActive}
            className="flex items-center gap-2 bg-zinc-900 border border-orange-500/50 hover:border-orange-500 text-orange-400 hover:text-orange-300 text-xs font-semibold px-3 py-2 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={isTourActive ? 'Tour already active' : 'Start guided tour'}
          >
            <Play className="h-3.5 w-3.5" />
            {isTourActive ? 'Tour Running…' : 'Start Tour'}
          </button>

          {/* Reset demo data */}
          <button
            onClick={handleReset}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl shadow-lg transition-all ${
              resetConfirm
                ? 'bg-red-600 text-white border border-red-500'
                : 'bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-200'
            }`}
            title="Reset all demo data to defaults"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetConfirm ? 'Confirm Reset?' : 'Reset Demo'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DemoControls;
