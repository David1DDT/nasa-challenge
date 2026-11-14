'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import StellariumView, { Star } from '@/components/StellariumView';
import StellariumHeader from '@/components/StellariumHeader';
import StellariumFooter from '@/components/StellariumFooter';
import StarInfoCard from '@/components/StarInfoCard';
import UnifiedControlDeck from '@/components/UnifiedControlDeck';
import LightCurvePanel from '@/components/LightCurvePanel';

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
  const [currentDay, setCurrentDay] = useState<number>(1); // 1 to 410 days (Apr 2025 - Jun 2026)
  const [selectedBandIndex, setSelectedBandIndex] = useState<number>(1); // 1 to 102 SPHEREx bands
  const [isMonochromatic, setIsMonochromatic] = useState<boolean>(false); // false = Full Spectrum RGB, true = Single Band Monochromatic
  const [isLightCurveOpen, setIsLightCurveOpen] = useState<boolean>(true); // Right side 4-band light curve panel, open by default
  const [zoomTargetFov, setZoomTargetFov] = useState<number | null>(null);
  const [showMotionTrail, setShowMotionTrail] = useState<boolean>(false);
  const [isTimedTrailActive, setIsTimedTrailActive] = useState<boolean>(false);
  const trailTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Zoom to Micro-Astrometric scale where proper motion & parallax are visibly distinct
  const handleZoomAstrometric = useCallback(() => {
    setZoomTargetFov(0.00008);
  }, []);

  // Trigger temporary 10s trajectory trail animation burst
  const handleTriggerTimedTrail = useCallback(() => {
    setShowMotionTrail(true);
    setIsTimedTrailActive(true);
    if (trailTimerRef.current) clearTimeout(trailTimerRef.current);

    // After 10 seconds, revert unless persistent mode was toggled
    trailTimerRef.current = setTimeout(() => {
      setIsTimedTrailActive(false);
      setShowMotionTrail(false);
    }, 10000);
  }, []);

  useEffect(() => {
    return () => {
      if (trailTimerRef.current) clearTimeout(trailTimerRef.current);
    };
  }, []);

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
        onSelectStar={(s) => {
          setSelectedStar(s);
          if (s) {
            setTargetStarName(s.proper_name || s.name);
            setIsLightCurveOpen(true);
          }
        }}
        targetStarName={targetStarName}
        currentDay={currentDay}
        isMonochromatic={isMonochromatic}
        selectedBandIndex={selectedBandIndex}
        zoomTargetFov={zoomTargetFov}
        onResetZoom={() => setZoomTargetFov(3.2)}
        showMotionTrail={showMotionTrail}
      />

      {/* Top Header: Search, Telemetry Toggle & Fullscreen Button */}
      <StellariumHeader
        stars={stars}
        onSelectStar={(star) => {
          setSelectedStar(star);
          setTargetStarName(star.proper_name || star.name);
          setIsLightCurveOpen(true);
        }}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isLightCurveOpen={isLightCurveOpen}
        onToggleLightCurve={() => setIsLightCurveOpen(!isLightCurveOpen)}
      />

      {/* Unified Bottom-Left Control Deck: 102 Spectral Bands & Time Evolution */}
      <UnifiedControlDeck
        currentDay={currentDay}
        onChangeDay={setCurrentDay}
        selectedBandIndex={selectedBandIndex}
        onChangeBandIndex={setSelectedBandIndex}
        isMonochromatic={isMonochromatic}
        onToggleMonochromatic={setIsMonochromatic}
        selectedStar={selectedStar}
        className="absolute bottom-4 left-4 z-30"
        onSelectZoomPreset={(fov) => setZoomTargetFov(fov)}
        showMotionTrail={showMotionTrail}
        onToggleMotionTrail={setShowMotionTrail}
        onTriggerTimedTrail={handleTriggerTimedTrail}
        isTimedTrailActive={isTimedTrailActive}
      />

      {/* Right Side Slide-out Panel: 4-Band Light Curve Chart */}
      <LightCurvePanel
        isOpen={isLightCurveOpen}
        onToggle={() => setIsLightCurveOpen(!isLightCurveOpen)}
        star={selectedStar}
        currentDay={currentDay}
        onSeekDay={setCurrentDay}
        onZoomAstrometric={handleZoomAstrometric}
        selectedBandIndex={selectedBandIndex}
        onSelectBandIndex={setSelectedBandIndex}
      />

      {/* Bottom Footer: Clock */}
      <StellariumFooter
        locationName="Geocentric Space POV"
      />

      {/* Star Details Card (When a star is clicked) */}
      <StarInfoCard
        star={selectedStar}
        onClose={() => setSelectedStar(null)}
        onOpenGraphs={() => setIsLightCurveOpen(true)}
        onZoomAstrometric={handleZoomAstrometric}
        isNightMode={false}
        currentDay={currentDay}
        isMonochromatic={isMonochromatic}
        selectedBandIndex={selectedBandIndex}
        showMotionTrail={showMotionTrail}
        onToggleMotionTrail={setShowMotionTrail}
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
