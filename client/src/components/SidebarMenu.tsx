'use client';

import React from 'react';
import { X, Database, Globe, Sliders, MapPin, Radio, Sparkles } from 'lucide-react';

interface SidebarMenuProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: 'satellite' | 'notebook';
  onChangeCatalog: (cat: 'satellite' | 'notebook') => void;
  coordMode: 'sphere' | 'space_3d';
  onChangeCoordMode: (mode: 'sphere' | 'space_3d') => void;
  maxMagnitude: number;
  onChangeMaxMagnitude: (val: number) => void;
  totalStarsCount: number;
  isNightMode?: boolean;
}

export default function SidebarMenu({
  isOpen,
  onClose,
  catalog,
  onChangeCatalog,
  coordMode,
  onChangeCoordMode,
  maxMagnitude,
  onChangeMaxMagnitude,
  totalStarsCount,
  isNightMode = false,
}: SidebarMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex pointer-events-auto">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer */}
      <div
        className={`relative w-80 max-w-[85vw] h-full shadow-2xl p-5 overflow-y-auto z-10 border-r flex flex-col justify-between transition-transform duration-300 ${
          isNightMode
            ? 'bg-red-950/95 border-red-800/40 text-red-100'
            : 'bg-black/90 border-white/15 text-white'
        }`}
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-bold tracking-tight">Stellarium Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Catalog Source Selection */}
          <div className="mt-5 space-y-2">
            <label className="text-xs font-semibold tracking-wider uppercase text-white/50 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>Satellite Data Source</span>
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onChangeCatalog('satellite')}
                className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                  catalog === 'satellite'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-md'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                360° All-Sky (119K)
              </button>
              <button
                onClick={() => onChangeCatalog('notebook')}
                className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                  catalog === 'notebook'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                SPHEREx (file.ipynb)
              </button>
            </div>
          </div>

          {/* Coordinate Mode */}
          <div className="mt-5 space-y-2">
            <label className="text-xs font-semibold tracking-wider uppercase text-white/50 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>3D Visualization Mode</span>
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onChangeCoordMode('sphere')}
                className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                  coordMode === 'sphere'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-md'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                Sferă Cerească
              </button>
              <button
                onClick={() => onChangeCoordMode('space_3d')}
                className={`py-2 px-3 rounded-xl border text-center font-medium transition-all ${
                  coordMode === 'space_3d'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-200 shadow-md'
                    : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                }`}
              >
                Zbor 3D în Spațiu
              </button>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              {coordMode === 'sphere'
                ? 'Proiecție sferică Stellarium la 360° văzută de pe Pământ.'
                : 'Coordonate reale în spațiu (ani-lumină) măsurate prin paralaxă satelitară.'}
            </p>
          </div>

          {/* Magnitude Limit Slider */}
          <div className="mt-5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold tracking-wider uppercase text-white/50 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span>Limita de Magnitudine</span>
              </span>
              <span className="font-mono text-white/80">{maxMagnitude.toFixed(1)} mag</span>
            </div>
            <input
              type="range"
              min="2.0"
              max="8.0"
              step="0.5"
              value={maxMagnitude}
              onChange={(e) => onChangeMaxMagnitude(parseFloat(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-white/30">
              <span>Doar luminoase (2.0)</span>
              <span>Tot cerul (8.0)</span>
            </div>
          </div>

          {/* Status Details */}
          <div className="mt-6 p-3 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1.5">
            <div className="flex justify-between text-white/60">
              <span>Stele randate:</span>
              <span className="font-mono text-white font-semibold">
                {totalStarsCount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Bază de date locală:</span>
              <span className="font-mono text-sky-300">119.625 stele</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Filtru satelit:</span>
              <span className="font-mono text-amber-300">SPHEREx D1 + D4</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-white/10 text-[11px] text-white/40 text-center">
          NASA Challenge • SPHEREx 3D Stellarium
        </div>
      </div>
    </div>
  );
}
