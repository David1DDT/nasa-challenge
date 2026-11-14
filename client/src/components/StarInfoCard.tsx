'use client';

import React from 'react';
import { X, Sparkles, Orbit, Radio, Compass, Sun, Layers, TrendingUp } from 'lucide-react';
import { Star, computePredictedAstrometricCoords } from './StellariumView';
import { SPHEREX_BANDS, estimateStarFluxAtWavelength } from '@/lib/spherex_bands';

interface StarInfoCardProps {
  star: Star | null;
  onClose: () => void;
  onOpenGraphs?: () => void;
  onZoomAstrometric?: () => void;
  isNightMode?: boolean;
  currentDay?: number;
  isMonochromatic?: boolean;
  selectedBandIndex?: number;
  showMotionTrail?: boolean;
  onToggleMotionTrail?: (trail: boolean) => void;
}

export default function StarInfoCard({
  star,
  onClose,
  onOpenGraphs,
  onZoomAstrometric,
  isNightMode = false,
  currentDay = 1,
  isMonochromatic = false,
  selectedBandIndex = 1,
  showMotionTrail = false,
  onToggleMotionTrail,
}: StarInfoCardProps) {
  if (!star) return null;

  const currentBand =
    SPHEREX_BANDS[Math.max(0, Math.min(101, selectedBandIndex - 1))];
  const bandFlux = currentBand
    ? estimateStarFluxAtWavelength(star, currentBand.wavelengthUm)
    : star.flux_mjy_sr || 1.0;

  // Real Astrometry Evolution over Time (Proper Motion + Parallax from Catalog)
  const pmra = star.pmra_mas_yr || 0;
  const pmdec = star.pmdec_mas_yr || 0;
  const astroCoords = computePredictedAstrometricCoords(star, currentDay, 1.0, 1.0);
  const currentRa = astroCoords.raDeg;
  const currentDec = astroCoords.decDeg;
  const raHours = (currentRa / 15.0).toFixed(4);
  const decFormatted = `${currentDec >= 0 ? '+' : ''}${currentDec.toFixed(4)}°`;

  // Epoch date calculation from SPHEREx Survey S1 start (Day 1 = April 29, 2025)
  const baseDate = new Date(Date.UTC(2025, 3, 29, 0, 24, 27));
  const epochDate = new Date(baseDate.getTime() + Math.max(0, currentDay - 1) * 86400000);
  const formattedEpochDate = epochDate.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const pPhot = star.satellite_photometry;
  const f1 = pPhot?.band1_blue_flux_mjy_sr || star.flux_mjy_sr || 1.0;
  const f2 = pPhot?.band2_cyan_flux_mjy_sr || f1 * 0.8;
  const f3 = pPhot?.band3_orange_flux_mjy_sr || f1 * 0.6;
  const f4 = pPhot?.band4_red_flux_mjy_sr || f1 * 0.4;
  const fRef = Math.max(0.001, (f1 + f2 + f3 + f4) / 4.0);
  const spectralRatio = bandFlux / fRef;

  return (
    <div
      className={`absolute top-16 left-4 z-30 rounded-2xl backdrop-blur-2xl shadow-2xl border p-3.5 transition-all duration-300 pointer-events-auto max-h-[260px] overflow-y-auto ${
        isNightMode
          ? 'bg-red-950/85 border-red-800/50 text-red-100'
          : 'bg-black/85 border-white/15 text-white'
      }`}
      style={{ width: '360px', maxWidth: 'calc(100vw - 32px)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-2 border-b border-white/10">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-sky-400">
            <Radio className="w-3.5 h-3.5" />
            <span>SPHEREx Infrared Target</span>
          </div>
          <h2 className="text-lg font-bold mt-0.5 tracking-tight">
            {star.proper_name || star.name}
          </h2>
          <p className="text-[11px] text-white/50">
            ID: {star.id} {star.spectral_type ? `• Class ${star.spectral_type}` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Physical Attributes */}
      <div className="py-2 grid grid-cols-2 gap-1.5 text-xs">
        <div className="bg-white/5 rounded-xl p-2 border border-white/5">
          <span className="text-white/40 block text-[10px]">Visual Magnitude</span>
          <span className="font-mono text-xs font-semibold text-white">
            {star.magnitude.toFixed(2)}
          </span>
        </div>

        <div className="bg-white/5 rounded-xl p-2 border border-white/5">
          <span className="text-white/40 block text-[10px]">Distance</span>
          <span className="font-mono text-xs font-semibold text-white">
            {star.distance_ly ? `${star.distance_ly.toFixed(1)} ly` : 'Infrared field'}
          </span>
        </div>

        <div className="bg-white/5 rounded-xl p-2 border border-white/5">
          <span className="text-white/40 block text-[10px]">Spectral Class</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: star.color || '#fff' }}
            />
            <span className="font-mono text-xs font-semibold text-white">
              {star.spectral_type || star.spectral_class || 'Star'}
            </span>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-2 border border-white/5">
          <span className="text-white/40 block text-[10px]">Temperature</span>
          <span className="font-mono text-xs font-semibold text-white">
            {star.temperature_k ? `${star.temperature_k.toLocaleString()} K` : '~5500 K'}
          </span>
        </div>
      </div>

      {/* Celestial Coordinates */}
      <div className="py-1.5 border-t border-white/10 text-xs">
        <div className="flex items-center gap-1 text-white/50 font-medium mb-1 text-[11px]">
          <Compass className="w-3 h-3" />
          <span>Coordinates (J2000)</span>
        </div>
        <div className="flex justify-between font-mono bg-white/5 p-1.5 rounded-lg text-[11px]">
          <div>
            <span className="text-white/40">RA: </span>
            <span>{raHours}h ({star.ra.toFixed(2)}°)</span>
          </div>
          <div>
            <span className="text-white/40">Dec: </span>
            <span>{decFormatted}</span>
          </div>
        </div>
      </div>

      {/* Monochromatic 102-Band Active Channel Details */}
      {isMonochromatic && currentBand && (
        <div className="mt-2 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center justify-between text-sky-400 font-semibold mb-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shadow-sm"
                style={{ backgroundColor: currentBand.colorHex }}
              />
              <span>Bandă Unică Monocromatică</span>
            </div>
            <span className="text-[10px] font-mono text-white/50">
              Banda {currentBand.bandIndex} / 102
            </span>
          </div>

          <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-2.5 space-y-1.5 font-mono text-[11px] text-sky-100">
            <div className="flex justify-between">
              <span className="text-white/60">Lungime de undă (λ):</span>
              <span className="font-bold text-white">{currentBand.wavelengthUm.toFixed(3)} µm</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Canal / Detector:</span>
              <span className="font-bold text-sky-300">{currentBand.detectorName}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-white/10">
              <span className="text-white/60">Flux în această bandă:</span>
              <span className="font-bold text-amber-300">
                {bandFlux.toFixed(2)} MJy/sr
              </span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/60">Luminozitate relativă:</span>
              <span
                className={`font-bold font-mono ${
                  spectralRatio >= 1.0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {(spectralRatio * 100).toFixed(0)}%{' '}
                {spectralRatio >= 1.0 ? '▲ (Mai luminoasă)' : '▼ (Mai slabă)'}
              </span>
            </div>
            <div className="text-[10px] text-white/50 font-sans mt-0.5">
              Toate stelele din scenă sunt afișate în culoarea acestei benzi ({currentBand.colorHex}).
            </div>
          </div>
        </div>
      )}

      {/* Real SPHEREx Satellite Multi-Band Photometry & Astrometry */}
      {star.satellite_photometry && (
        <div className="mt-2 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center justify-between text-amber-400 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              <span>Date SPHEREx FITS & Astrometrie</span>
            </div>
            <span className="text-[10px] font-mono text-white/50">{formattedEpochDate}</span>
          </div>
          <div className="space-y-1.5 font-mono text-[11px] bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-amber-100">
            {star.satellite_photometry.band1_blue_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 1 (0.75-1.11 µm):</span>
                <span className="font-bold text-sky-300">
                  {star.satellite_photometry.band1_blue_flux_mjy_sr.toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band2_cyan_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 2 (1.11-1.64 µm):</span>
                <span className="font-bold text-teal-300">
                  {star.satellite_photometry.band2_cyan_flux_mjy_sr.toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band3_orange_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 3 (1.64-2.42 µm):</span>
                <span className="font-bold text-amber-300">
                  {star.satellite_photometry.band3_orange_flux_mjy_sr.toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band4_red_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 4 (2.42-3.82 µm):</span>
                <span className="font-bold text-rose-300">
                  {star.satellite_photometry.band4_red_flux_mjy_sr.toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-white/10 text-[10px]">
              <span className="text-white/60">Mișcare Proprie (pmRA, pmDec):</span>
              <span className="font-bold text-sky-200">
                {pmra >= 0 ? '+' : ''}{pmra.toFixed(2)}, {pmdec >= 0 ? '+' : ''}{pmdec.toFixed(2)} mas/an
              </span>
            </div>
            {star.satellite_photometry.infrared_color_ratio_f4_f1 && (
              <div className="flex justify-between pt-1 border-t border-white/10">
                <span className="text-white/60">Raport Infraroșu (F4/F1):</span>
                <span className="font-bold text-white">
                  {star.satellite_photometry.infrared_color_ratio_f4_f1.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3D Space Coordinates (if available) */}
      {star.space_position_ly && (
        <div className="mt-2 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center gap-1 text-white/50 font-medium mb-1.5">
            <Orbit className="w-3.5 h-3.5" />
            <span>3D Space Vector (Light-Years)</span>
          </div>
          <div className="font-mono text-[11px] bg-white/5 p-2 rounded-lg text-white/70">
            X: {star.space_position_ly.x.toFixed(1)} ly • Y:{' '}
            {star.space_position_ly.y.toFixed(1)} ly • Z:{' '}
            {star.space_position_ly.z.toFixed(1)} ly
          </div>
        </div>
      )}

      {/* Action Buttons: Zoom Astrometric, Coadă Traiectorie & Graphs */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {onZoomAstrometric && (
          <button
            onClick={onZoomAstrometric}
            className="py-1.5 px-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Mărește adânc pe stea până la nivel micro-astrometric pentru a vedea deplasarea produsă în timp"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Zoom Astrometric</span>
          </button>
        )}
        {onOpenGraphs && (
          <button
            onClick={onOpenGraphs}
            className="py-1.5 px-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/35 border border-sky-400/40 text-sky-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
          >
            <TrendingUp className="w-3.5 h-3.5 text-sky-300" />
            <span>Date & Grafice</span>
          </button>
        )}
        {onToggleMotionTrail && (
          <button
            onClick={() => onToggleMotionTrail(!showMotionTrail)}
            className={`col-span-2 py-1.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
              showMotionTrail
                ? 'bg-purple-600/40 hover:bg-purple-600/60 text-purple-200 border-purple-400/50'
                : 'bg-white/5 hover:bg-white/15 text-white/70 border-white/10'
            }`}
          >
            <Orbit className="w-3.5 h-3.5 text-purple-300" />
            <span>{showMotionTrail ? '💫 Coadă Traiectorie: ACTIVĂ' : '💫 Activează Coada Traiectoriei'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
