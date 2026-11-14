'use client';

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';

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
}

interface StarCloudTier {
  points: THREE.Points;
  baseColors: Float32Array;
  periods: Float32Array;
  amplitudes: Float32Array;
  phases: Float32Array;
}

export default function StellariumView({
  stars,
  showGrid,
  showStarLabels,
  selectedStar,
  onSelectStar,
  targetStarName,
  currentDay = 0,
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

  // Star texture cache
  const starTextureRef = useRef<THREE.Texture | null>(null);

  // Camera orientation: default looking directly into the SPHEREx Infrared Survey Field (Up Close)
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const cameraRot = useRef({ azimuth: 5.3023, altitude: 0.7026 });
  const targetCameraRot = useRef({ azimuth: 5.3023, altitude: 0.7026 });
  const fovRef = useRef(3.2);
  const targetFovRef = useRef(3.2);

  // Keep latest props in refs for animation loop
  const propsRef = useRef({
    stars,
    showStarLabels,
  });
  useEffect(() => {
    propsRef.current = { stars, showStarLabels };
  }, [stars, showStarLabels]);

  // Filter top brightest SPHEREx stars for clean, non-overlapping labels
  const prominentStars = useMemo(() => {
    if (stars.length === 0) return [];
    return [...stars]
      .sort((a, b) => a.magnitude - b.magnitude)
      .slice(0, 6);
  }, [stars]);

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

        const seed = Math.abs(s.ra * 31.415 + s.dec * 17.291) % 1000;
        periods[i] = 25.0 + (seed % 95.0);
        amplitudes[i] = 0.08 + (seed % 28.0) * 0.01;
        phases[i] = (seed * 0.37) % (Math.PI * 2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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

      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = 2;

      tiersRef.current.push({
        points: pts,
        baseColors,
        periods,
        amplitudes,
        phases,
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

  // Real-time time evolution modulation of stellar brightness and infrared flux
  useEffect(() => {
    if (tiersRef.current.length === 0) return;
    for (const tier of tiersRef.current) {
      const colorsAttr = tier.points.geometry.attributes.color as THREE.BufferAttribute;
      if (!colorsAttr) continue;
      const arr = colorsAttr.array as Float32Array;
      const count = tier.periods.length;

      for (let i = 0; i < count; i++) {
        const p = tier.periods[i];
        const a = tier.amplitudes[i];
        const phi = tier.phases[i];
        const mod =
          1.0 +
          a * Math.sin((currentDay / p) * Math.PI * 2 + phi) +
          0.25 * a * Math.sin((currentDay / (p * 0.5)) * Math.PI * 2 + phi * 1.5);

        arr[i * 3] = Math.min(1.0, tier.baseColors[i * 3] * mod);
        arr[i * 3 + 1] = Math.min(1.0, tier.baseColors[i * 3 + 1] * mod);
        arr[i * 3 + 2] = Math.min(1.0, tier.baseColors[i * 3 + 2] * mod);
      }
      colorsAttr.needsUpdate = true;
    }
  }, [currentDay]);

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
    const pts = [
      new THREE.Vector3(-sz, -sz, 0), new THREE.Vector3(-sz + 5, -sz, 0),
      new THREE.Vector3(-sz, -sz, 0), new THREE.Vector3(-sz, -sz + 5, 0),
      new THREE.Vector3(sz, -sz, 0), new THREE.Vector3(sz - 5, -sz, 0),
      new THREE.Vector3(sz, -sz, 0), new THREE.Vector3(sz, sz - 5, 0),
      new THREE.Vector3(-sz, sz, 0), new THREE.Vector3(-sz + 5, sz, 0),
      new THREE.Vector3(-sz, sz, 0), new THREE.Vector3(-sz, sz - 5, 0),
      new THREE.Vector3(sz, sz, 0), new THREE.Vector3(sz - 5, sz, 0),
      new THREE.Vector3(sz, sz, 0), new THREE.Vector3(sz, sz - 5, 0),
    ];
    reticleGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), reticleMat));
    reticleGroup.visible = false;
    reticleGroup.renderOrder = 10;

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
    starsGroup.renderOrder = 2;
    starsGroupRef.current = starsGroup;
    scene.add(starsGroup);

    // Initial build of stars if already loaded
    rebuildStars();

    // High Performance Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Smooth camera interpolation
      cameraRot.current.azimuth += (targetCameraRot.current.azimuth - cameraRot.current.azimuth) * 0.12;
      cameraRot.current.altitude += (targetCameraRot.current.altitude - cameraRot.current.altitude) * 0.12;
      cameraRot.current.altitude = Math.max(-1.5, Math.min(1.5, cameraRot.current.altitude));

      fovRef.current += (targetFovRef.current - fovRef.current) * 0.12;
      if (camera.fov !== fovRef.current) {
        camera.fov = fovRef.current;
        camera.updateProjectionMatrix();
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

  // Update Reticle position on selected star
  useEffect(() => {
    if (!reticleRef.current) return;
    if (selectedStar) {
      reticleRef.current.position.set(
        selectedStar.position.x * 0.98,
        selectedStar.position.y * 0.98,
        selectedStar.position.z * 0.98
      );
      reticleRef.current.lookAt(0, 0, 0);
      reticleRef.current.visible = true;
    } else {
      reticleRef.current.visible = false;
    }
  }, [selectedStar]);

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

    // Natural drag: dragging right moves view right, dragging up moves view up
    const sens = (fovRef.current / 45) * 0.0022;
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
    const step = Math.max(0.12, (targetFovRef.current / 25) * 0.35);
    targetFovRef.current = Math.max(0.4, Math.min(45, targetFovRef.current + Math.sign(e.deltaY) * step));
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
    </div>
  );
}