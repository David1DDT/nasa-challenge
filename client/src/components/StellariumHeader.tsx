'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Maximize, Minimize } from 'lucide-react';
import { Star } from './StellariumView';

interface StellariumHeaderProps {
  stars: Star[];
  onSelectStar: (star: Star) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export default function StellariumHeader({
  stars,
  onSelectStar,
  isFullscreen,
  onToggleFullscreen,
}: StellariumHeaderProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Search filter
  const matches = React.useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase().trim();
    return stars
      .filter((s) => {
        const name = (s.proper_name || s.name || '').toLowerCase();
        const id = (s.id || '').toLowerCase();
        return name.includes(term) || id.includes(term);
      })
      .slice(0, 8);
  }, [searchTerm, stars]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 pointer-events-none">
      {/* Left spacer to keep search centered */}
      <div className="w-10 h-10" />

      {/* Center: Search Bar with Autocomplete */}
      <div ref={dropdownRef} className="relative pointer-events-auto w-full max-w-md mx-4">
        <div className="flex items-center px-4 py-2 rounded-full backdrop-blur-md shadow-xl border transition-all bg-black/45 border-white/15 text-white focus-within:border-white/40 focus-within:bg-black/65">
          <Search className="w-4 h-4 mr-2.5 text-white/60" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search SPHEREx stars..."
            className="w-full bg-transparent text-sm placeholder:text-white/40 focus:outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setIsOpen(false);
              }}
              className="text-white/40 hover:text-white/80 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Results */}
        {isOpen && matches.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl backdrop-blur-xl shadow-2xl border overflow-hidden z-50 bg-black/85 border-white/15">
            <div className="max-h-64 overflow-y-auto divide-y divide-white/5 py-1">
              {matches.map((star) => (
                <button
                  key={star.id}
                  onClick={() => {
                    onSelectStar(star);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left transition-colors hover:bg-white/10"
                >
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      <span>{star.proper_name || star.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-mono">
                        {star.id}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-white/50">
                    Mag: {star.magnitude.toFixed(1)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: The Only Button - Fullscreen in the Corner */}
      <button
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        aria-label="Fullscreen"
        className="pointer-events-auto flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 backdrop-blur-md shadow-lg bg-black/50 hover:bg-black/75 text-white/90 hover:text-white border border-white/15 hover:scale-105 active:scale-95"
      >
        {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
      </button>
    </header>
  );
}
