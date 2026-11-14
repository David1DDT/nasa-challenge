'use client';

import React, { useState, useEffect, useCallback } from 'react';
import StellariumView, { Star } from '@/components/StellariumView';
import StellariumHeader from '@/components/StellariumHeader';
import StellariumFooter from '@/components/StellariumFooter';
import StarInfoCard from '@/components/StarInfoCard';
import TimeEvolutionSlider from '@/components/TimeEvolutionSlider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export default function Home() {
  const [stars, setStars] = useState<Star[]>([]);
  const [loading, setLoading] = useState(true);

  // View toggles (Geocentric Pure Space POV)
  const [showGrid, setShowGrid] = useState(false);
  const [showStarLabels, setShowStarLabels] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Selection & settings
  const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [targetStarName, setTargetStarName] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<'notebook' | 'satellite'>('notebook');
  const [coordMode, setCoordMode] = useState<'sphere' | 'space_3d'>('sphere');
  const [maxMagnitude, setMaxMagnitude] = useState(16.0);
  const [currentDay, setCurrentDay] = useState<number>(0); // 0 to 410 days (Apr 2025 - Jun 2026)

  // Fetch data from Flask backend with fallback to static local public data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let starsData: Star[] = [];
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/stars?catalog=${catalog}&mode=${coordMode}&limit=4000`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const json = await res.json();
          starsData = json.stars || [];
        }
      } catch (err) {
        console.warn('Backend server not reachable on localhost:5001, loading from local static backup...', err);
        const backupFile =
          catalog === 'satellite'
            ? '/data/satellite_stars_360.json'
            : '/data/notebook_stars.json';
        const res = await fetch(backupFile);
        const json = await res.json();
        starsData = json.stars || [];
      }

      setStars(starsData);
    } catch (e) {
      console.error('Error loading stellar data:', e);
    } finally {
      setLoading(false);
    }
  }, [catalog, coordMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fullscreen toggle handler
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070913] text-white font-sans select-none">
      {/* 3D Geocentric Space View */}
      <StellariumView
        stars={stars}
        showGrid={showGrid}
        showStarLabels={showStarLabels}
        selectedStar={selectedStar}
        onSelectStar={(s) => setSelectedStar(s)}
        targetStarName={targetStarName}
        currentDay={currentDay}
      />

      {/* Top Header: Search & Corner Fullscreen Button */}
      <StellariumHeader
        stars={stars}
        onSelectStar={(star) => {
          setSelectedStar(star);
          setTargetStarName(star.proper_name || star.name);
        }}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Horizontal Time Evolution Slider in Corner */}
      <TimeEvolutionSlider
        currentDay={currentDay}
        onChangeDay={setCurrentDay}
        className="absolute bottom-4 left-4 z-30"
      />

      {/* Bottom Footer: Clock */}
      <StellariumFooter
        locationName="Geocentric Space POV"
      />

      {/* Star Details Card (When a star is clicked) */}
      <StarInfoCard
        star={selectedStar}
        onClose={() => setSelectedStar(null)}
        isNightMode={false}
        currentDay={currentDay}
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#070913]/80 backdrop-blur-md transition-opacity">
          <div className="w-10 h-10 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium tracking-wide text-sky-200">
            Loading satellite 360° star data...
          </p>
        </div>
      )}
    </div>
  );
}
