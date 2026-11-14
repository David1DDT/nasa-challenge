'use client';

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as THREE from 'three';
import { SPHEREX_BANDS, estimateStarFluxAtWavelength, getStarVariability } from '@/lib/spherex_bands';

export interface Star {
  id: string;
  name: string;
  proper_name?: string;
  bayer?: string;
  flamsteed?: string;
  constellation?: string | { code: string; name: string };
  ra: number;
  dec: number;
  magnitude: number;
  distance_ly?: number;
  distance_pc?: number;
  spectral_type?: string;
  spectral_class?: string;
  color?: string;
  color_hex?: string;
  color_rgb?: { r: number; g: number; b: number };
  color_rgb_norm?: number[];
  temperature_k?: number;
  size?: number;
  position: { x: number; y: number; z: number };
  space_position_ly?: { x: number; y: number; z: number };
  flux_mjy_sr?: number;
  pmra_mas_yr?: number;
  pmdec_mas_yr?: number;
  radial_velocity_kms?: number;
  satellite_photometry?: {
    band1_blue_flux_mjy_sr?: number;
    band2_cyan_flux_mjy_sr?: number;
    band3_orange_flux_mjy_sr?: number;
    band4_red_flux_mjy_sr?: number;
    infrared_color_ratio_f4_f1?: number;
    detectors_used?: string[];
    composition?: string;
  };
}

interface StellariumViewProps {
  stars: Star[];
  showGrid: boolean;
  showStarLabels: boolean;
  selectedStar: Star | null;
  onSelectStar: (star: Star | null) => void;
  targetStarName?: string | null;
  currentDay?: number;
  isMonochromatic?: boolean;
  selectedBandIndex?: number;
  zoomTargetFov?: number | null;
  onResetZoom?: () => void;
  showMotionTrail?: boolean;
}

// Predict continuous astrometric position between dataset observation epochs
export function computePredictedAstrometricCoords(
  star: Star,
  day: number,
  boostFactor: number = 1.0,
  radius: number = 980.0
): { x: number; y: number; z: number; raDeg: number; decDeg: number } {
  const pmra = star.pmra_mas_yr || 0;
  const pmdec = star.pmdec_mas_yr || 0;
  const cosDec = Math.max(0.08, Math.cos((star.dec * Math.PI) / 180));
  // Mission counting starts strictly from Day 1 (elapsed days = day - 1)
  const elapsedDays = Math.max(0, day - 1);
  const tYears = elapsedDays / 365.25;

  // 1. Uniform proper motion linear drift (mas)
  const pmDriftRaMas = pmra * cosDec * tYears * boostFactor;
  const pmDriftDecMas = pmdec * tYears * boostFactor;

  // 2. Continuous Keplerian parallax reflex orbit relative to initial Day 1
  const distLy = star.distance_ly || 1800;
  const parallaxMas = Math.max(0.5, Math.min(60.0, 3261.56 / distLy)) * boostFactor;
  const baseRaRad = (star.ra * Math.PI) / 180.0;
  const baseDecRad = (star.dec * Math.PI) / 180.0;
  const theta = (2 * Math.PI * elapsedDays) / 365.25;
  const plxRaMas = parallaxMas * (Math.sin(theta - baseRaRad) - Math.sin(-baseRaRad));
  const plxDecMas = parallaxMas * Math.sin(baseDecRad) * (Math.cos(theta - baseRaRad) - Math.cos(-baseRaRad));

  const totalDeltaRaMas = pmDriftRaMas + plxRaMas;
  const totalDeltaDecMas = pmDriftDecMas + plxDecMas;

  const deltaRaDeg = totalDeltaRaMas / (3600000.0 * cosDec);
  const deltaDecDeg = totalDeltaDecMas / 3600000.0;
  const curRaDeg = star.ra + deltaRaDeg;
  const curDecDeg = Math.max(-89.9, Math.min(89.9, star.dec + deltaDecDeg));

  const curRaRad = (curRaDeg * Math.PI) / 180.0;
  const curDecRad = (curDecDeg * Math.PI) / 180.0;

  const px = radius * Math.cos(curDecRad) * Math.sin(curRaRad);
  const py = radius * Math.sin(curDecRad);
  const pz = radius * Math.cos(curDecRad) * Math.cos(curRaRad);

  return { x: px, y: py, z: pz, raDeg: curRaDeg, decDeg: curDecDeg };
}

interface StarCloudTier {
  points: THREE.Points;
  basePositions: Float32Array;
  baseColors: Float32Array;
  stars: Star[];
}

export default function StellariumView({
  stars,
  showGrid,
  showStarLabels,
  selectedStar,
  onSelectStar,
  targetStarName,
  currentDay = 1,
  isMonochromatic = false,
  selectedBandIndex = 1,
  zoomTargetFov = null,
  onResetZoom,
  showMotionTrail = false,
}: StellariumViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const tiersRef = useRef<StarCloudTier[]>([]);

  // Groups
  const starsGroupRef = useRef<THREE.Group | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const reticleRef = useRef<THREE.Group | null>(null);
  const j2000Ref = useRef<THREE.Group | null>(null);
  const trailGroupRef = useRef<THREE.Group | null>(null);
  const trailGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const fieldTrailGeoRef = useRef<THREE.BufferGeometry | null>(null);

  // Star texture cache
  const starTextureRef = useRef<THREE.Texture | null>(null);

  // Camera orientation: default looking directly into the SPHEREx Infrared Survey Field (Up Close)
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const cameraRot = useRef({ azimuth: 5.3023, altitude: 0.7026 });
  const targetCameraRot = useRef({ azimuth: 5.3023, altitude: 0.7026 });
  const fovRef = useRef(3.2);
  const targetFovRef = useRef(3.2);
  const [hudFov, setHudFov] = useState<number>(3.2);

  // Filter top brightest SPHEREx stars for clean, non-overlapping labels
  const prominentStars = useMemo(() => {
    if (stars.length === 0) return [];
    return [...stars]
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, 6);
  }, [stars]);

  // Top stars with highest proper motion to display field-wide trajectory trails
  const highPmStars = useMemo(() => {
    if (!stars || stars.length === 0) return [];
    return [...stars]
      .filter((s) => s.pmra_mas_yr || s.pmdec_mas_yr)
      .sort((a, b) => {
        const pma = Math.hypot(a.pmra_mas_yr || 0, a.pmdec_mas_yr || 0);
        const pmb = Math.hypot(b.pmra_mas_yr || 0, b.pmdec_mas_yr || 0);
        return pmb - pma;
      })
      .slice(0, 80);
  }, [stars]);

  // Keep latest props in refs for animation loop
  const propsRef = useRef({
    stars,
    showStarLabels,
    currentDay,
    showMotionTrail,
    selectedStar,
    highPmStars,
  });
  useEffect(() => {
    propsRef.current = { stars, showStarLabels, currentDay, showMotionTrail, selectedStar, highPmStars };
  }, [stars, showStarLabels, currentDay, showMotionTrail, selectedStar, highPmStars]);

  // Star glow texture generator
  const getStarTexture = useCallback(() => {
    if (starTextureRef.current) return starTextureRef.current;
    if (typeof document === 'undefined') return null;

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.12, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.35, 'rgba(225, 238, 255, 0.5)');
    grad.addColorStop(0.7, 'rgba(180, 215, 255, 0.12)');
    grad.addColorStop(1.0, 'rgba(180, 215, 255, 0.0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    starTextureRef.current = texture;
    return texture;
  }, []);

  // Builder for multi-tiered Star Cloud with adaptive photometry range
  const rebuildStars = useCallback(() => {
    if (!starsGroupRef.current || stars.length === 0) return;
    const group = starsGroupRef.current;
    group.clear();

    const texture = getStarTexture();

    // Calculate dynamic magnitude distribution for SPHEREx infrared stars
    let minMag = Infinity;
    let maxMag = -Infinity;
    for (let i = 0; i < stars.length; i++) {
      const m = stars[i].magnitude;
      if (m < minMag) minMag = m;
      if (m > maxMag) maxMag = m;
    }
    const magRange = Math.max(1.0, maxMag - minMag);
    const t1Cut = minMag + magRange * 0.15;
    const t2Cut = minMag + magRange * 0.40;
    const t3Cut = minMag + magRange * 0.70;

    const tier1 = stars.filter((s) => s.magnitude < t1Cut);
    const tier2 = stars.filter((s) => s.magnitude >= t1Cut && s.magnitude < t2Cut);
    const tier3 = stars.filter((s) => s.magnitude >= t2Cut && s.magnitude < t3Cut);
    const tier4 = stars.filter((s) => s.magnitude >= t3Cut);

    tiersRef.current = [];
    const createStarCloud = (starList: Star[], pointSize: number) => {
      const count = starList.length;
      if (count === 0) return null;

      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const baseColors = new Float32Array(count * 3);
      const periods = new Float32Array(count);
      const amplitudes = new Float32Array(count);
      const phases = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const s = starList[i];
        positions[i * 3] = s.position.x;
        positions[i * 3 + 1] = s.position.y;
        positions[i * 3 + 2] = s.position.z;

        let r = 1.0, g = 1.0, b = 1.0;
        if (s.color_rgb_norm && s.color_rgb_norm.length === 3) {
          r = s.color_rgb_norm[0];
          g = s.color_rgb_norm[1];
          b = s.color_rgb_norm[2];
        } else if (s.color_rgb) {
          r = s.color_rgb.r / 255.0;
          g = s.color_rgb.g / 255.0;
          b = s.color_rgb.b / 255.0;
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;

        baseColors[i * 3] = r;
        baseColors[i * 3 + 1] = g;
        baseColors[i * 3 + 2] = b;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const scales = new Float32Array(count);
      scales.fill(1.0);
      geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

      const mat = new THREE.PointsMaterial({
        size: pointSize,
        map: texture || undefined,
        transparent: true,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        sizeAttenuation: false,
      });

      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = 'attribute float aScale;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          'gl_PointSize = size;',
          'gl_PointSize = clamp(size * (aScale > 0.0 ? aScale : 1.0), 1.0, 32.0);'
        );
      };

      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = 2;

      tiersRef.current.push({
        points: pts,
        basePositions: new Float32Array(positions),
        baseColors,
        stars: starList,
      });

      return pts;
    };

    const p1 = createStarCloud(tier1, 15);
    const p2 = createStarCloud(tier2, 8);
    const p3 = createStarCloud(tier3, 4.5);
    const p4 = createStarCloud(tier4, 2.2);

    if (p1) group.add(p1);
    if (p2) group.add(p2);
    if (p3) group.add(p3);
    if (p4) group.add(p4);
  }, [stars, getStarTexture]);

  // Real-time modulation: 102 Spectral Bands Monochromatic vs Full Spectrum + Proper Motion Astrometry
  useEffect(() => {
    if (tiersRef.current.length === 0) return;

    const currentBand =
      SPHEREX_BANDS[Math.max(0, Math.min(101, selectedBandIndex - 1))];
    const monoColor = currentBand ? currentBand.colorRgb : [0.22, 0.74, 0.97];
    const elapsedDays = Math.max(0, currentDay - 1);
    const tYears = elapsedDays / 365.25;

    for (const tier of tiersRef.current) {
      const colorsAttr = tier.points.geometry.attributes.color as THREE.BufferAttribute;
      const positionsAttr = tier.points.geometry.attributes.position as THREE.BufferAttribute;
      const scalesAttr = tier.points.geometry.attributes.aScale as THREE.BufferAttribute | undefined;
      if (!colorsAttr || !positionsAttr) continue;
      const arr = colorsAttr.array as Float32Array;
      const posArr = positionsAttr.array as Float32Array;
      const scalesArr = scalesAttr ? (scalesAttr.array as Float32Array) : null;
      const count = tier.stars.length;

      for (let i = 0; i < count; i++) {
        const star = tier.stars[i];

        // Continuous Keplerian parallax orbit + proper motion linear drift from dataset
        // Boost matches the trail when motion trail is active so stars stay pinned to their trails
        const boost = showMotionTrail ? (targetFovRef.current < 0.005 ? 1.0 : Math.min(2500.0, Math.max(1.0, 0.12 / targetFovRef.current))) : 1.0;
        if (star.pmra_mas_yr || star.pmdec_mas_yr || star.distance_ly) {
          const pt = computePredictedAstrometricCoords(star, currentDay, boost, 1000.0);
          if (isFinite(pt.x) && isFinite(pt.y) && isFinite(pt.z)) {
            posArr[i * 3] = pt.x;
            posArr[i * 3 + 1] = pt.y;
            posArr[i * 3 + 2] = pt.z;
          }
        } else {
          posArr[i * 3] = tier.basePositions[i * 3];
          posArr[i * 3 + 1] = tier.basePositions[i * 3 + 1];
          posArr[i * 3 + 2] = tier.basePositions[i * 3 + 2];
        }

        // Base star brightness from visual magnitude
        const mag = star.magnitude ?? 9.0;
        const baseB = Math.max(0.28, Math.min(1.0, 0.40 + 0.60 * ((13.0 - mag) / 7.0)));

        // Spectral Flux in current band directly from SPHEREx data
        const pPhot = star.satellite_photometry;
        const f1 = Math.max(0.01, pPhot?.band1_blue_flux_mjy_sr || star.flux_mjy_sr || 1.0);
        const f2 = Math.max(0.01, pPhot?.band2_cyan_flux_mjy_sr || f1 * 0.85);
        const f3 = Math.max(0.01, pPhot?.band3_orange_flux_mjy_sr || f1 * 0.65);
        const f4 = Math.max(0.01, pPhot?.band4_red_flux_mjy_sr || f1 * 0.45);
        const fRef = Math.max(0.01, (f1 + f2 + f3 + f4) / 4.0);

        const fluxAtWl = currentBand
          ? estimateStarFluxAtWavelength(star, currentBand.wavelengthUm)
          : fRef;

        // Controlled ratio of flux at this wavelength compared to average flux
        const rawRatio = fluxAtWl / fRef;
        const ratio = Math.max(0.3, Math.min(2.5, isFinite(rawRatio) ? rawRatio : 1.0));

        // Smooth contrast enhancement (gamma = 1.25, keeping points natural and round)
        const ratioExag = Math.pow(ratio, 1.25);

        // Natural individual stellar variability (decorrelated from spatial RA/Dec coordinates to eliminate stripes)
        const { isVariable, periodDays, amplitude, phase } = getStarVariability(star);
        const timeMod = isVariable
          ? 1.0 + amplitude * Math.sin((elapsedDays / periodDays) * Math.PI * 2 + phase)
          : 1.0;

        if (isMonochromatic && currentBand) {
          // MONOCHROMATIC SINGLE-BAND MODE:
          const finalB = Math.max(0.05, Math.min(1.0, baseB * ratioExag * timeMod));
          const finalScale = Math.max(0.6, Math.min(1.5, Math.pow(ratioExag, 0.25) * Math.pow(timeMod, 0.3)));

          arr[i * 3] = monoColor[0] * finalB;
          arr[i * 3 + 1] = monoColor[1] * finalB;
          arr[i * 3 + 2] = monoColor[2] * finalB;

          if (scalesArr) scalesArr[i] = isFinite(finalScale) ? finalScale : 1.0;
        } else {
          // FULL SPECTRUM MULTI-BAND RGB MODE:
          const finalScale = Math.max(0.7, Math.min(1.4, Math.pow(timeMod, 0.25)));

          arr[i * 3] = Math.min(1.0, tier.baseColors[i * 3] * timeMod);
          arr[i * 3 + 1] = Math.min(1.0, tier.baseColors[i * 3 + 1] * timeMod);
          arr[i * 3 + 2] = Math.min(1.0, tier.baseColors[i * 3 + 2] * timeMod);

          if (scalesArr) scalesArr[i] = isFinite(finalScale) ? finalScale : 1.0;
        }
      }
      colorsAttr.needsUpdate = true;
      positionsAttr.needsUpdate = true;
      if (scalesAttr) scalesAttr.needsUpdate = true;
    }
  }, [currentDay, isMonochromatic, selectedBandIndex, showMotionTrail]);

  // Main Three.js Scene Setup (Geocentric Pure Deep Space POV)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x020308);

    const camera = new THREE.PerspectiveCamera(fovRef.current, width / height, 0.1, 5000);
    cameraRef.current = camera;
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Reticle Group (for star selection)
    const reticleGroup = new THREE.Group();
    reticleRef.current = reticleGroup;
    scene.add(reticleGroup);

    const reticleMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    });
    const sz = 16;
    const len = 6;
    const pts = [
      // Bottom-Left
      new THREE.Vector3(-sz, -sz, 0), new THREE.Vector3(-sz + len, -sz, 0),
      new THREE.Vector3(-sz, -sz, 0), new THREE.Vector3(-sz, -sz + len, 0),
      // Bottom-Right
      new THREE.Vector3(sz, -sz, 0), new THREE.Vector3(sz - len, -sz, 0),
      new THREE.Vector3(sz, -sz, 0), new THREE.Vector3(sz, -sz + len, 0),
      // Top-Left
      new THREE.Vector3(-sz, sz, 0), new THREE.Vector3(-sz + len, sz, 0),
      new THREE.Vector3(-sz, sz, 0), new THREE.Vector3(-sz, sz - len, 0),
      // Top-Right
      new THREE.Vector3(sz, sz, 0), new THREE.Vector3(sz - len, sz, 0),
      new THREE.Vector3(sz, sz, 0), new THREE.Vector3(sz, sz - len, 0),
    ];
    reticleGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), reticleMat));
    reticleGroup.visible = false;
    reticleGroup.renderOrder = 10;

    // Static J2000 Epoch Reference Marker (Golden Crosshair)
    const j2000Group = new THREE.Group();
    j2000Ref.current = j2000Group;
    scene.add(j2000Group);

    const j2000Mat = new THREE.LineBasicMaterial({
      color: 0xf59e0b, // Amber Gold
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false,
    });
    const csz = 14;
    const jpts = [
      new THREE.Vector3(-csz, 0, 0), new THREE.Vector3(csz, 0, 0),
      new THREE.Vector3(0, -csz, 0), new THREE.Vector3(0, csz, 0),
    ];
    j2000Group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(jpts), j2000Mat));
    j2000Group.visible = false;
    j2000Group.renderOrder = 9;

    // Glowing Motion Trajectory Trail Group
    const trailGroup = new THREE.Group();
    trailGroup.renderOrder = 8;
    trailGroupRef.current = trailGroup;
    scene.add(trailGroup);

    const maxTrailPts = 60;
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(maxTrailPts * 3);
    const trailColors = new Float32Array(maxTrailPts * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
    trailGeoRef.current = trailGeo;

    const trailLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const trailLine = new THREE.Line(trailGeo, trailLineMat);
    trailGroup.add(trailLine);

    // Glowing waypoint dots along the trajectory tail
    const trailDotsMat = new THREE.PointsMaterial({
      size: 5,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
    });
    const trailDots = new THREE.Points(trailGeo, trailDotsMat);
    trailGroup.add(trailDots);

    // Field-wide proper motion trails for all prominent moving stars
    const maxFieldStars = 80;
    const maxFieldPts = maxFieldStars * 2;
    const fieldTrailGeo = new THREE.BufferGeometry();
    const fieldPositions = new Float32Array(maxFieldPts * 3);
    const fieldColors = new Float32Array(maxFieldPts * 3);
    fieldTrailGeo.setAttribute('position', new THREE.BufferAttribute(fieldPositions, 3));
    fieldTrailGeo.setAttribute('color', new THREE.BufferAttribute(fieldColors, 3));
    fieldTrailGeoRef.current = fieldTrailGeo;

    const fieldTrailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const fieldTrailLines = new THREE.LineSegments(fieldTrailGeo, fieldTrailMat);
    trailGroup.add(fieldTrailLines);

    trailGroup.visible = false;

    // Celestial Grid Group (Equator & Coordinates in Space)
    const gridGroup = new THREE.Group();
    gridGroup.renderOrder = 1;
    gridGroupRef.current = gridGroup;
    scene.add(gridGroup);

    // Celestial Equator line (blue)
    const eqPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const th = (i / 128) * Math.PI * 2;
      eqPts.push(new THREE.Vector3(Math.sin(th) * 980, 0, Math.cos(th) * 980));
    }
    gridGroup.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(eqPts),
        new THREE.LineBasicMaterial({
          color: 0x2563eb,
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
        })
      )
    );
    gridGroup.visible = showGrid;

    // Stars Group (Pure Geocentric Celestial Sphere)
    const starsGroup = new THREE.Group();
    starsGroup.renderOrder = 2;
    starsGroupRef.current = starsGroup;
    scene.add(starsGroup);

    // Initial build of stars if already loaded
    rebuildStars();

    // High Performance Animation Loop
    let animId: number;
    let lastHudUpdate = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera interpolation
      cameraRot.current.azimuth += (targetCameraRot.current.azimuth - cameraRot.current.azimuth) * 0.12;
      cameraRot.current.altitude += (targetCameraRot.current.altitude - cameraRot.current.altitude) * 0.12;
      cameraRot.current.altitude = Math.max(-1.5, Math.min(1.5, cameraRot.current.altitude));

      fovRef.current += (targetFovRef.current - fovRef.current) * 0.12;
      if (Math.abs(camera.fov - fovRef.current) > 1e-8) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
      }

      // Keep target reticles scaled smoothly with camera FOV so they never blow up or disappear
      const sFactor = Math.max(0.0000004, fovRef.current / 50.0);
      if (reticleRef.current) reticleRef.current.scale.setScalar(sFactor);
      if (j2000Ref.current) j2000Ref.current.scale.setScalar(sFactor);

      // Throttle HUD FOV state updates to 5 FPS to preserve 60 FPS WebGL
      const now = performance.now();
      if (now - lastHudUpdate > 200) {
        setHudFov(fovRef.current);
        lastHudUpdate = now;
      }

      // Update Motion Trajectory Trails if enabled
      if (propsRef.current.showMotionTrail && trailGroupRef.current) {
        trailGroupRef.current.visible = true;
        const fov = fovRef.current;
        // Boost factor matches the stars when trails are enabled: 1.0x at deep zoom, adaptive boost at wide zoom
        const boost = fov < 0.005 ? 1.0 : Math.min(2500.0, Math.max(1.0, 0.12 / fov));
        const cDay = propsRef.current.currentDay;
        const trailDurationDays = Math.min(120, Math.max(25, cDay * 0.4 + 25));

        // 1. High-detail Hero Trail for Selected Star
        const starToTrace = propsRef.current.selectedStar || (stars.length > 0 ? stars[0] : null);
        if (starToTrace && trailGeoRef.current) {
          const numPts = 60;
          const posAttr = trailGeoRef.current.attributes.position as THREE.BufferAttribute;
          const colAttr = trailGeoRef.current.attributes.color as THREE.BufferAttribute;
          const pArr = posAttr.array as Float32Array;
          const cArr = colAttr.array as Float32Array;

          // If at start (Day 1), render the initial 60-day trajectory preview loop so trail is immediately visible
          const isAtStart = cDay <= 1.05;

          for (let k = 0; k < numPts; k++) {
            const frac = k / (numPts - 1);
            const sampleDay = isAtStart
              ? (1.0 + frac * 60.0)
              : Math.max(1.0, cDay - trailDurationDays * (1.0 - frac));
            const pt = computePredictedAstrometricCoords(starToTrace, sampleDay, boost, 1000.0);

            pArr[k * 3] = pt.x;
            pArr[k * 3 + 1] = pt.y;
            pArr[k * 3 + 2] = pt.z;

            // Gradient: transparent at tail (k=0) -> bright cyan/gold at head (k=numPts-1)
            const alpha = Math.pow(frac, 1.4);
            cArr[k * 3] = (0.25 + 0.75 * (1.0 - frac)) * alpha;
            cArr[k * 3 + 1] = (0.25 + 0.75 * frac) * alpha;
            cArr[k * 3 + 2] = alpha;
          }

          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
        }

        // 2. Field-wide proper motion trails for all prominent moving stars
        if (fieldTrailGeoRef.current && propsRef.current.highPmStars) {
          const fPosAttr = fieldTrailGeoRef.current.attributes.position as THREE.BufferAttribute;
          const fColAttr = fieldTrailGeoRef.current.attributes.color as THREE.BufferAttribute;
          const fPArr = fPosAttr.array as Float32Array;
          const fCArr = fColAttr.array as Float32Array;
          const starsList = propsRef.current.highPmStars.slice(0, 80);

          for (let sIdx = 0; sIdx < starsList.length; sIdx++) {
            const s = starsList[sIdx];
            const isAtStart = cDay <= 1.05;
            const startDay = isAtStart ? 1.0 : Math.max(1.0, cDay - 50);
            const endDay = isAtStart ? 51.0 : cDay;

            const ptStart = computePredictedAstrometricCoords(s, startDay, boost, 1000.0);
            const ptEnd = computePredictedAstrometricCoords(s, endDay, boost, 1000.0);

            const vIdx = sIdx * 2;
            // Vertex 0: Tail (faded purple)
            fPArr[vIdx * 3] = ptStart.x;
            fPArr[vIdx * 3 + 1] = ptStart.y;
            fPArr[vIdx * 3 + 2] = ptStart.z;
            fCArr[vIdx * 3] = 0.50;
            fCArr[vIdx * 3 + 1] = 0.20;
            fCArr[vIdx * 3 + 2] = 0.85;

            // Vertex 1: Head (bright electric cyan)
            fPArr[(vIdx + 1) * 3] = ptEnd.x;
            fPArr[(vIdx + 1) * 3 + 1] = ptEnd.y;
            fPArr[(vIdx + 1) * 3 + 2] = ptEnd.z;
            fCArr[(vIdx + 1) * 3] = 0.22;
            fCArr[(vIdx + 1) * 3 + 1] = 0.90;
            fCArr[(vIdx + 1) * 3 + 2] = 1.0;
          }

          fPosAttr.needsUpdate = true;
          fColAttr.needsUpdate = true;
        }
      } else if (trailGroupRef.current) {
        trailGroupRef.current.visible = false;
      }

      const az = cameraRot.current.azimuth;
      const alt = cameraRot.current.altitude;
      const lookDir = new THREE.Vector3(
        Math.cos(alt) * Math.sin(az),
        Math.sin(alt),
        Math.cos(alt) * Math.cos(az)
      );
      camera.lookAt(lookDir.multiplyScalar(1000));

      renderer.render(scene, camera);

      // 2D Star Labels rendering synchronized with camera view
      if (labelsCanvasRef.current) {
        const c2d = labelsCanvasRef.current;
        const curW = container.clientWidth;
        const curH = container.clientHeight;
        if (c2d.width !== curW || c2d.height !== curH) {
          c2d.width = curW;
          c2d.height = curH;
        }

        const ctx = c2d.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, curW, curH);

          if (propsRef.current.showStarLabels && prominentStars.length > 0) {
            const halfW = curW / 2;
            const halfH = curH / 2;
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);

            ctx.font = '500 13px system-ui, -apple-system, sans-serif';
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';

            for (let i = 0; i < Math.min(prominentStars.length, 30); i++) {
              const s = prominentStars[i];
              const starVec = new THREE.Vector3(s.position.x, s.position.y, s.position.z).normalize();

              if (starVec.dot(forward) > 0.35) {
                const vProj = new THREE.Vector3(s.position.x, s.position.y, s.position.z).project(camera);
                const sx = vProj.x * halfW + halfW;
                const sy = -vProj.y * halfH + halfH;

                if (sx >= 40 && sx <= curW - 50 && sy >= 50 && sy <= curH - 60) {
                  const alpha = Math.max(0.45, Math.min(0.95, (3.2 - s.magnitude) * 0.42));
                  ctx.fillStyle = `rgba(225, 238, 255, ${alpha})`;
                  ctx.fillText(s.proper_name || s.name, sx + 10, sy - 6);
                }
              }
            }
          }
        }
      }
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [rebuildStars, prominentStars]);

  // Synchronize Stars when `stars` updates
  useEffect(() => {
    rebuildStars();
  }, [rebuildStars]);

  // Update Grid
  useEffect(() => {
    if (gridGroupRef.current) {
      gridGroupRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Update Reticle & J2000 Reference positions on selected star
  useEffect(() => {
    if (!reticleRef.current) return;
    if (selectedStar) {
      const livePt = computePredictedAstrometricCoords(selectedStar, currentDay, 1.0, 980.0);
      reticleRef.current.position.set(livePt.x, livePt.y, livePt.z);
      reticleRef.current.lookAt(0, 0, 0);
      reticleRef.current.visible = true;

      if (j2000Ref.current) {
        // Base J2000 reference crosshair stays pinned at initial epoch
        const baseX = selectedStar.position.x * 0.98;
        const baseY = selectedStar.position.y * 0.98;
        const baseZ = selectedStar.position.z * 0.98;
        j2000Ref.current.position.set(baseX, baseY, baseZ);
        j2000Ref.current.lookAt(0, 0, 0);
        j2000Ref.current.visible = true;
      }
    } else {
      reticleRef.current.visible = false;
      if (j2000Ref.current) {
        j2000Ref.current.visible = false;
      }
    }
  }, [selectedStar, currentDay]);

  // Rotate Camera to Star smoothly (without changing zoom level!)
  const rotateToStar = useCallback((s: Star) => {
    const v = new THREE.Vector3(s.position.x, s.position.y, s.position.z).normalize();
    const alt = Math.asin(Math.max(-1, Math.min(1, v.y)));
    let az = Math.atan2(v.x, v.z);
    if (az < 0) az += Math.PI * 2;

    let curAz = targetCameraRot.current.azimuth % (Math.PI * 2);
    if (curAz < 0) curAz += Math.PI * 2;
    let diffAz = az - curAz;
    if (diffAz > Math.PI) diffAz -= Math.PI * 2;
    if (diffAz < -Math.PI) diffAz += Math.PI * 2;

    targetCameraRot.current.azimuth += diffAz;
    targetCameraRot.current.altitude = alt;
    // Keep user's zoom level intact - do NOT zoom out!
    onSelectStar(s);
  }, [onSelectStar]);

  // Handle external zoom requests (e.g. Astrometric deep zoom button)
  useEffect(() => {
    if (zoomTargetFov !== null && zoomTargetFov !== undefined) {
      targetFovRef.current = zoomTargetFov;
      if (selectedStar) {
        rotateToStar(selectedStar);
      }
    }
  }, [zoomTargetFov, selectedStar, rotateToStar]);

  // Target star name from search
  useEffect(() => {
    if (!targetStarName) return;
    const target = stars.find(
      (s) =>
        s.name.toLowerCase() === targetStarName.toLowerCase() ||
        (s.proper_name && s.proper_name.toLowerCase() === targetStarName.toLowerCase())
    );
    if (target) {
      rotateToStar(target);
    }
  }, [targetStarName, stars, rotateToStar]);

  // Mouse / Pointer Interaction handlers (Natural 1:1 Direct Drag)
  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    prevMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - prevMouse.current.x;
    const dy = e.clientY - prevMouse.current.y;
    prevMouse.current = { x: e.clientX, y: e.clientY };

    // Natural drag proportional to FOV: smooth at wide angle and micro-precise at astrometric zoom
    const sens = Math.max(1e-8, (fovRef.current / 45) * 0.0022);
    targetCameraRot.current.azimuth += dx * sens;
    targetCameraRot.current.altitude += dy * sens;
    targetCameraRot.current.altitude = Math.max(-1.5, Math.min(1.5, targetCameraRot.current.altitude));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const moved =
      Math.abs(e.clientX - prevMouse.current.x) > 4 ||
      Math.abs(e.clientY - prevMouse.current.y) > 4;

    isDragging.current = false;

    // Raycast on click to select star
    if (!moved && cameraRef.current && containerRef.current && starsGroupRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.params.Points = { threshold: 14 };
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

      const intersects = raycaster.intersectObjects(starsGroupRef.current.children);
      if (intersects.length > 0 && intersects[0].point) {
        const pt = intersects[0].point;
        let bestDist = Infinity;
        let bestStar: Star | null = null;
        for (const s of stars) {
          const d = Math.hypot(s.position.x - pt.x, s.position.y - pt.y, s.position.z - pt.z);
          if (d < bestDist) {
            bestDist = d;
            bestStar = s;
          }
        }
        if (bestStar) rotateToStar(bestStar);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const minFov = 0.00002; // Micro-astrometric deep zoom (down to ~0.07 arcsec / 70 mas!)
    const maxFov = 65.0;
    const factor = e.deltaY < 0 ? 0.78 : 1.28;
    targetFovRef.current = Math.max(minFov, Math.min(maxFov, targetFovRef.current * factor));
  };

  return (
    <div
      className="relative w-full h-full select-none overflow-hidden cursor-grab active:cursor-grabbing"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
    >
      <div ref={containerRef} className="absolute inset-0" />
      <canvas ref={labelsCanvasRef} className="absolute inset-0 pointer-events-none" />

      {/* Astrometric Zoom HUD Overlay */}
      {hudFov < 1.5 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full backdrop-blur-xl bg-black/85 border border-sky-400/40 shadow-2xl text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="text-white/70">Câmp (FOV):</span>
            <span className="text-sky-300 font-bold">
              {hudFov < 0.01 ? `${(hudFov * 3600).toFixed(2)}"` : `${hudFov.toFixed(3)}°`}
            </span>
            <span className="text-white/40">|</span>
            <span className="text-white/70">Mărire:</span>
            <span className="text-amber-300 font-bold">
              {Math.round(50.0 / hudFov).toLocaleString()}×
            </span>
          </div>

          {propsRef.current.showMotionTrail && (
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/20 text-purple-300 font-bold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
              <span>Coadă Traiectorie Activă</span>
            </div>
          )}

          {hudFov < 0.005 && (
            <div className="flex items-center gap-2 pl-2 border-l border-white/20 text-[11px]">
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                [+] J2000 Bază
              </span>
              <span className="text-sky-400 font-semibold flex items-center gap-1">
                <span className="inline-block w-2 h-2 border border-sky-400" />
                [⛶] Poziție Live
              </span>
            </div>
          )}

          <button
            onClick={() => {
              targetFovRef.current = 3.2;
              if (onResetZoom) onResetZoom();
            }}
            className="ml-1 px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] transition-colors cursor-pointer"
          >
            Reset Zoom
          </button>
        </div>
      )}
    </div>
  );
}