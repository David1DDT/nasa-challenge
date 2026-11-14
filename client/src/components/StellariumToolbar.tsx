'use client';

import React from 'react';
import { Globe2, Maximize, Minimize, Radio } from 'lucide-react';

interface StellariumToolbarProps {
  showGrid: boolean;
  onToggleGrid: () => void;
  showDeepSky: boolean;
  onToggleDeepSky: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function StellariumToolbar({
  showGrid,
  onToggleGrid,
  showDeepSky,
  onToggleDeepSky,
  isFullscreen,
  onToggleFullscreen,
}: StellariumToolbarProps) {
  const tools = [
    {
      id: 'grid',
      label: 'Celestial Equator & Grid',
      active: showGrid,
      onClick: onToggleGrid,
      icon: <Globe2 className="w-5 h-5" />,
    },
    {
      id: 'dso',
      label: 'SPHEREx Infrared Detection',
      active: showDeepSky,
      onClick: onToggleDeepSky,
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
          <path d="M12 3a9 9 0 0 1 9 9c0 3.5-2 6-5 6s-5-2-5-5 2-4 4-4 3 1.5 3 3-1 2-2 2" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      ),
    },
    {
      id: 'fullscreen',
      label: 'Fullscreen Space View',
      active: isFullscreen,
      onClick: onToggleFullscreen,
      icon: isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />,
    },
  ];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl shadow-2xl border transition-all bg-black/60 border-white/15 text-white/90">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={t.onClick}
            title={t.label}
            aria-label={t.label}
            className={`flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200 ${
              t.active
                ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40 shadow-inner scale-105'
                : 'hover:bg-white/10 text-white/60 hover:text-white'
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
