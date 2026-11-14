'use client';

import React, { useState, useEffect } from 'react';
import { Orbit } from 'lucide-react';

interface StellariumFooterProps {
  locationName?: string;
  onLocationClick?: () => void;
  isNightMode?: boolean;
}

export default function StellariumFooter({
  locationName = 'Geocentric POV • SPHEREx Survey Field',
  onLocationClick,
  isNightMode = false,
}: StellariumFooterProps) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      setTimeStr(`${hh}:${mm}:${ss} UTC`);

      const yyyy = now.getUTCFullYear();
      const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(now.getUTCDate()).padStart(2, '0');
      setDateStr(`${yyyy}-${mo}-${dd}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Bottom Right: Digital Time & Date Pill */}
      <div className="absolute bottom-4 right-4 z-30 pointer-events-auto flex items-center gap-2">
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full text-xs font-mono backdrop-blur-md shadow-lg border bg-black/50 text-white/90 border-white/10">
          <span className="font-semibold">{timeStr || '12:00:00 UTC'}</span>
          <span className="text-white/40 font-sans">|</span>
          <span className="text-white/70 font-sans">{dateStr || '2026-11-14'}</span>
        </div>
      </div>
    </>
  );
}
