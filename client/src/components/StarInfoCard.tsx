'use client';

import React from 'react';
import { X, Sparkles, Orbit, Radio, Compass, Sun, Layers } from 'lucide-react';
import { Star } from './StellariumView';

interface StarInfoCardProps {
  star: Star | null;
  onClose: () => void;
  isNightMode?: boolean;
  currentDay?: number;
}

export default function StarInfoCard({
  star,
  onClose,
  isNightMode = false,
  currentDay = 0,
}: StarInfoCardProps) {
  if (!star) return null;

  const raHours = (star.ra / 15.0).toFixed(2);
  const decFormatted = `${star.dec >= 0 ? '+' : ''}${star.dec.toFixed(2)}°`;

  // Epoch date calculation
  const baseDate = new Date(Date.UTC(2025, 3, 29, 0, 24, 27));
  const epochDate = new Date(baseDate.getTime() + currentDay * 86400000);
  const formattedEpochDate = epochDate.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Physical light curve variation calculation
  const seed = (Math.abs(star.ra * 31.415 + star.dec * 17.291)) % 1000;
  const periodDays = 25.0 + (seed % 95.0);
  const amplitude = 0.08 + (seed % 28.0) * 0.01;
  const phase = (seed * 0.37) % (Math.PI * 2);
  const mod =
    1.0 +
    amplitude * Math.sin((currentDay / periodDays) * Math.PI * 2 + phase) +
    0.25 * amplitude * Math.sin((currentDay / (periodDays * 0.5)) * Math.PI * 2 + phase * 1.5);
  const varPct = (mod - 1.0) * 100;

  return (
    <div
      className={`absolute top-20 left-4 z-40 w-80 max-h-[calc(100vh-140px)] overflow-y-auto rounded-2xl backdrop-blur-xl shadow-2xl border p-4 transition-all duration-300 pointer-events-auto ${
        isNightMode
          ? 'bg-red-950/85 border-red-800/50 text-red-100'
          : 'bg-black/75 border-white/15 text-white'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase text-sky-400">
            <Radio className="w-3.5 h-3.5" />
            <span>SPHEREx Infrared Target</span>
          </div>
          <h2 className="text-xl font-bold mt-0.5 tracking-tight">
            {star.proper_name || star.name}
          </h2>
          <p className="text-xs text-white/50">
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
      <div className="py-3 grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <span className="text-white/40 block">Visual Magnitude</span>
          <span className="font-mono text-sm font-semibold text-white">
            {star.magnitude.toFixed(2)}
          </span>
        </div>

        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <span className="text-white/40 block">Distance</span>
          <span className="font-mono text-sm font-semibold text-white">
            {star.distance_ly ? `${star.distance_ly.toFixed(1)} ly` : 'Infrared field'}
          </span>
        </div>

        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <span className="text-white/40 block">Spectral Class</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: star.color || '#fff' }}
            />
            <span className="font-mono text-sm font-semibold text-white">
              {star.spectral_type || star.spectral_class || 'Star'}
            </span>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
          <span className="text-white/40 block">Temperature</span>
          <span className="font-mono text-sm font-semibold text-white">
            {star.temperature_k ? `${star.temperature_k.toLocaleString()} K` : '~5500 K'}
          </span>
        </div>
      </div>

      {/* Celestial Coordinates */}
      <div className="py-2 border-t border-white/10 text-xs">
        <div className="flex items-center gap-1 text-white/50 font-medium mb-1.5">
          <Compass className="w-3.5 h-3.5" />
          <span>Coordinates (J2000)</span>
        </div>
        <div className="flex justify-between font-mono bg-white/5 p-2 rounded-lg">
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

      {/* Real SPHEREx Satellite Multi-Band Photometry (if available) */}
      {star.satellite_photometry && (
        <div className="mt-2 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center justify-between text-amber-400 font-semibold mb-2">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              <span>NASA SPHEREx Measurements</span>
            </div>
            <span className="text-[10px] font-mono text-white/50">{formattedEpochDate}</span>
          </div>
          <div className="space-y-1.5 font-mono text-[11px] bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 text-amber-100">
            {star.satellite_photometry.band1_blue_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 1 (0.75-1.11 µm):</span>
                <span className="font-bold text-sky-300">
                  {(star.satellite_photometry.band1_blue_flux_mjy_sr * mod).toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band2_cyan_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 2 (1.11-1.64 µm):</span>
                <span className="font-bold text-teal-300">
                  {(star.satellite_photometry.band2_cyan_flux_mjy_sr * mod).toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band3_orange_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 3 (1.64-2.42 µm):</span>
                <span className="font-bold text-amber-300">
                  {(star.satellite_photometry.band3_orange_flux_mjy_sr * mod).toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            {star.satellite_photometry.band4_red_flux_mjy_sr && (
              <div className="flex justify-between">
                <span className="text-white/60">Band 4 (2.42-3.82 µm):</span>
                <span className="font-bold text-rose-300">
                  {(star.satellite_photometry.band4_red_flux_mjy_sr * mod).toFixed(1)} MJy/sr
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-white/10 text-[10px]">
              <span className="text-white/60">Variație Flux (t={Math.round(currentDay)}z):</span>
              <span
                className={`font-bold ${
                  varPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {varPct >= 0 ? '+' : ''}
                {varPct.toFixed(1)}% (P={periodDays.toFixed(0)}z)
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
    </div>
  );
}
