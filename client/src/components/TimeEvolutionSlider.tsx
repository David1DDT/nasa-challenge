'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Calendar, Sparkles, FastForward } from 'lucide-react';

interface TimeEvolutionSliderProps {
  currentDay: number; // 0 to 410 days
  onChangeDay: React.Dispatch<React.SetStateAction<number>>;
  className?: string;
}

export default function TimeEvolutionSlider({
  currentDay,
  onChangeDay,
  className = '',
}: TimeEvolutionSliderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1); // 1x, 2x, 5x, 10x
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Base observation start date: April 29, 2025 (Mission Day 1)
  const baseDate = new Date(Date.UTC(2025, 3, 29, 0, 24, 27));

  // Compute current date from currentDay (Day 1 = baseDate)
  const currentDate = new Date(baseDate.getTime() + Math.max(0, currentDay - 1) * 86400000);
  const formattedDate = currentDate.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // SPHEREx Survey pass (Surveys 1 to 4 over the 2-year mission)
  let surveyName = 'Survey 1';
  if (currentDay > 300) surveyName = 'Survey 4 (QR3)';
  else if (currentDay > 200) surveyName = 'Survey 3 (QR2)';
  else if (currentDay > 100) surveyName = 'Survey 2 (DR2)';
  else surveyName = 'Survey 1 (DR1)';

  // Animation Loop for Playback
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Rate: 10 days per real second at 1x speed
      const dayStep = delta * 12 * playSpeed;
      onChangeDay((prev) => {
        const next = prev + dayStep;
        if (next >= 410) {
          setIsPlaying(false);
          return 410;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playSpeed, onChangeDay]);

  const handleReset = () => {
    setIsPlaying(false);
    onChangeDay(1);
  };

  const toggleSpeed = () => {
    const speeds = [1, 2, 5, 10];
    const nextIdx = (speeds.indexOf(playSpeed) + 1) % speeds.length;
    setPlaySpeed(speeds[nextIdx]);
  };

  return (
    <div
      className={`pointer-events-auto backdrop-blur-xl bg-black/80 border border-white/15 rounded-2xl p-3.5 shadow-2xl transition-all duration-200 select-none ${className}`}
      style={{ minWidth: '320px', maxWidth: '420px' }}
    >
      {/* Header Info */}
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-sky-500/20 text-sky-400">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-sky-400 block leading-tight">
              Evoluție în Timp • SPHEREx
            </span>
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-white">
              <Calendar className="w-3 h-3 text-white/50" />
              <span>{formattedDate}</span>
              <span className="text-white/30">•</span>
              <span className="text-sky-300 font-sans text-[11px] font-medium">{surveyName}</span>
            </div>
          </div>
        </div>

        {/* Days elapsed badge */}
        <div className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-mono text-white/80 border border-white/10">
          Ziua {Math.round(currentDay)} / 410
        </div>
      </div>

      {/* Horizontal Time Slider */}
      <div className="relative py-1">
        <input
          type="range"
          min={1}
          max={410}
          step={0.5}
          value={currentDay}
          onChange={(e) => {
            onChangeDay(parseFloat(e.target.value));
          }}
          className="w-full h-2 bg-gradient-to-r from-sky-500/40 via-amber-500/40 to-rose-500/40 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />

        {/* Timeline Survey Labels */}
        <div className="flex justify-between text-[9px] font-mono text-white/40 mt-1 px-0.5">
          <span>Z1 (Apr 2025)</span>
          <span>Z120 (Sep 2025)</span>
          <span>Z250 (Feb 2026)</span>
          <span>Z410 (Iun 2026)</span>
        </div>
      </div>

      {/* Controls Bar: Play, Speed, Reset */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pauză' : 'Redare'}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              isPlaying
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 border border-sky-500/30'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pauză</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Redă Evoluția</span>
              </>
            )}
          </button>

          <button
            onClick={toggleSpeed}
            title="Viteză de redare"
            className="flex items-center gap-0.5 px-2 py-1 rounded-full text-xs font-mono font-semibold bg-white/10 hover:bg-white/20 text-white/80 transition-colors border border-white/10"
          >
            <FastForward className="w-3 h-3 text-sky-400" />
            <span>{playSpeed}x</span>
          </button>
        </div>

        <button
          onClick={handleReset}
          title="Resetează la prima observație"
          className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
