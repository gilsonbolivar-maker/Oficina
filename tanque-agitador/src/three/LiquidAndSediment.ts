/**
 * LiquidAndSediment: Physics-driven liquid volume, free surface with dynamic vortex,
 * dynamic bottom sediment sludge bed, and 3,000 particle sedimentation/suspension simulation.
 */

import * as THREE from 'three';
import { FluidPreset } from '../types/simulation';

export class LiquidAndSediment {
  public group: THREE.Group;

  // Liquid bulk volume
  private liquidMesh: THREE.Mesh;
  private liquidMaterial: THREE.MeshPhysicalMaterial;

  // Free surface with vortex deformation
  private surfaceMesh: THREE.Mesh;
  private surfaceGeometry: THREE.PlaneGeometry;
  private surfaceMaterial: THREE.MeshPhysicalMaterial;

  // Bottom sediment sludge layer
  private sludgeMesh: THREE.Mesh;
  private sludgeMaterial: THREE.MeshStandardMaterial;

  // Sediment particles
  private particleCount = 3200;
  private particlePoints: THREE.Points;
  private particleGeometry: THREE.BufferGeometry;
  private particlePositions: Float32Array;
  private particleVelocities: Float32Array;
  private particleInitialY: Float32Array;
  private particleColors: Float32Array;
  private particleMaterial: THREE.PointsMaterial;

  // Current physics state
  private liquidLevel = 3.4;
  private currentPreset: FluidPreset;
  private suspensionRatio = 0.9; // 0 (100% decanted) to 1 (100% suspended)
  private sludgeHeight = 0.02; // meters

  constructor(initialPreset: FluidPreset) {
    this.group = new THREE.Group();
    this.group.name = 'LiquidAndSedimentSystem';
    this.currentPreset = initialPreset;

    // ==========================================
    // 1. Bulk Liquid Volume
    // ==========================================
    const liquidGeo = new THREE.BoxGeometry(4.94, this.liquidLevel, 4.94);
    this.liquidMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPreset.baseColor),
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      transmission: 0.45,
      ior: 1.333,
      depthWrite: false,
    });
    this.liquidMesh = new THREE.Mesh(liquidGeo, this.liquidMaterial);
    this.liquidMesh.position.set(0, this.liquidLevel / 2, 0);
    this.group.add(this.liquidMesh);

    // ==========================================
    // 2. Liquid Free Surface with Vortex Mesh
    // ==========================================
    this.surfaceGeometry = new THREE.PlaneGeometry(4.92, 4.92, 36, 36);
    this.surfaceGeometry.rotateX(-Math.PI / 2);
    this.surfaceMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialPreset.baseColor),
      transparent: true,
      opacity: 0.8,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.35,
      ior: 1.333,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.surfaceMesh = new THREE.Mesh(this.surfaceGeometry, this.surfaceMaterial);
    this.surfaceMesh.position.set(0, this.liquidLevel, 0);
    this.group.add(this.surfaceMesh);

    // ==========================================
    // 3. Dynamic Bottom Sediment Sludge Layer
    // ==========================================
    const sludgeGeo = new THREE.BoxGeometry(4.92, 0.01, 4.92);
    this.sludgeMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(initialPreset.sedimentColor),
      roughness: 0.85,
      metalness: 0.15,
    });
    this.sludgeMesh = new THREE.Mesh(sludgeGeo, this.sludgeMaterial);
    this.sludgeMesh.position.set(0, 0.02, 0);
    this.group.add(this.sludgeMesh);

    // ==========================================
    // 4. Sediment Particles System (3,200 points)
    // ==========================================
    this.particlePositions = new Float32Array(this.particleCount * 3);
    this.particleVelocities = new Float32Array(this.particleCount * 3);
    this.particleInitialY = new Float32Array(this.particleCount);
    this.particleColors = new Float32Array(this.particleCount * 3);

    const baseCol = new THREE.Color(initialPreset.sedimentColor);

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      // Random distribution inside tank (X: -2.35 to 2.35, Z: -2.35 to 2.35, Y: 0.05 to level)
      const x = (Math.random() - 0.5) * 4.7;
      const z = (Math.random() - 0.5) * 4.7;
      const y = 0.08 + Math.random() * (this.liquidLevel - 0.15);

      this.particlePositions[idx] = x;
      this.particlePositions[idx + 1] = y;
      this.particlePositions[idx + 2] = z;

      this.particleInitialY[i] = y;

      this.particleVelocities[idx] = 0;
      this.particleVelocities[idx + 1] = 0;
      this.particleVelocities[idx + 2] = 0;

      // Slight color variation for particles
      const colVar = baseCol.clone().offsetHSL(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.15
      );
      this.particleColors[idx] = colVar.r;
      this.particleColors[idx + 1] = colVar.g;
      this.particleColors[idx + 2] = colVar.b;
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );
    this.particleGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(this.particleColors, 3)
    );

    // Procedural circle texture for particles
    const circleTexture = this.generateParticleTexture();

    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.055,
      map: circleTexture,
      transparent: true,
      opacity: 0.88,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.particlePoints = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.group.add(this.particlePoints);
  }

  private generateParticleTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
      grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.65, 'rgba(240, 240, 240, 0.85)');
      grad.addColorStop(1, 'rgba(200, 200, 200, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  public setFluidPreset(preset: FluidPreset) {
    this.currentPreset = preset;
    this.liquidMaterial.color.set(preset.baseColor);
    this.surfaceMaterial.color.set(preset.baseColor);
    this.sludgeMaterial.color.set(preset.sedimentColor);

    const baseCol = new THREE.Color(preset.sedimentColor);
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const colVar = baseCol.clone().offsetHSL(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.15
      );
      this.particleColors[idx] = colVar.r;
      this.particleColors[idx + 1] = colVar.g;
      this.particleColors[idx + 2] = colVar.b;
    }
    const colAttr = this.particleGeometry.getAttribute('color');
    if (colAttr) colAttr.needsUpdate = true;
  }

  public setLiquidLevel(level: number) {
    this.liquidLevel = Math.max(0.8, Math.min(3.8, level));

    // Update liquid mesh height and position
    this.liquidMesh.scale.y = this.liquidLevel / 3.4;
    this.liquidMesh.position.y = this.liquidLevel / 2;

    // Update surface mesh position
    this.surfaceMesh.position.y = this.liquidLevel;
  }

  /**
   * Physics Simulation Step:
   * Computes gravitational settling (Stokes' Law) vs. Agitator hydrodynamic pumping,
   * bottom shear stress scouring, and toroidal recirculation loops.
   */
  public updatePhysics(
    delta: number,
    rpm: number,
    direction: 1 | -1,
    stokesVelocityMmPerSec: number,
    zwieteringRpm: number,
    elapsedTime: number
  ) {
    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    const normRPM = Math.min(1.0, rpm / 180);
    const suspensionThreshold = zwieteringRpm * 0.95;
    const isAboveSuspension = rpm >= suspensionThreshold;

    // Dynamic settling velocity in m/s (Stokes' Law)
    // Multiplied by a simulation visual scaling factor so users can observe decantation without waiting hours
    const settlingSpeed = (stokesVelocityMmPerSec / 1000) * (rpm < 5 ? 12 : 4);

    // Impeller circulation speeds (m/s)
    const impellerRadius = 0.85; // D/2 = 1.65 / 2
    const pumpSpeed = normRPM * 3.8; // Downward jet speed under impeller
    const angularSpeed = (rpm / 60) * 2 * Math.PI * direction;

    let totalSuspended = 0;
    const tankHalfWidth = 2.38;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      let x = positions[idx];
      let y = positions[idx + 1];
      let z = positions[idx + 2];

      const r = Math.sqrt(x * x + z * z);
      const theta = Math.atan2(z, x);

      // Current particle velocity components
      let vx = 0;
      let vy = 0;
      let vz = 0;

      // 1. GRAVITATIONAL SETTLING (decantação para o fundo)
      vy -= settlingSpeed;

      // 2. AGITATOR HYDRODYNAMIC FLOW (quando o agitador está girando)
      if (rpm > 1) {
        // Tangential swirl (v_theta = omega * r), dampened near walls by baffles
        const baffleDamping = 1.0 - Math.min(0.85, (r / tankHalfWidth) * 0.85);
        const vTheta = angularSpeed * Math.min(r, 1.2) * baffleDamping;
        
        vx += -Math.sin(theta) * vTheta;
        vz += Math.cos(theta) * vTheta;

        // Lower Axial Hydrofoil Impeller (at Y = 0.55m):
        // Pushes fluid DOWNWARD under the blades (r < 0.9m)
        if (r < impellerRadius + 0.1 && y > 0.25 && y < 1.6) {
          const proximity = 1.0 - (r / (impellerRadius + 0.1));
          vy -= pumpSpeed * proximity * 1.4;
        }

        // Bottom sweep: fluid reaching bottom (y < 0.45m) deflects RADIALLY OUTWARD
        if (y < 0.5) {
          const radialSweep = pumpSpeed * (1.0 - y / 0.5) * 1.2;
          vx += Math.cos(theta) * radialSweep;
          vz += Math.sin(theta) * radialSweep;
          
          // Scour & lift settled particles off the bottom if RPM is sufficient
          if (rpm > 15) {
            const bottomLift = (rpm / Math.max(1, zwieteringRpm)) * 1.5;
            vy += bottomLift;
          }
        }

        // Outer wall upflow: fluid hitting outer walls (r > 1.8m) deflects UPWARDS
        if (r > 1.7 && y < this.liquidLevel - 0.2) {
          const wallProximity = Math.min(1.0, (r - 1.7) / 0.65);
          vy += pumpSpeed * wallProximity * 0.9;
        }

        // Surface inward return flow: near top level (y > liquidLevel - 0.6m) fluid moves INWARD
        if (y > this.liquidLevel - 0.65) {
          const inwardSpeed = pumpSpeed * 0.65;
          vx -= Math.cos(theta) * inwardSpeed;
          vz -= Math.sin(theta) * inwardSpeed;
          // Downward draw at center vortex
          if (r < 0.6) {
            vy -= pumpSpeed * 0.8;
          }
        }

        // Mid-height Rushton Impeller (Y ~ 2.1m):
        // Radial discharge outwards
        if (Math.abs(y - 2.1) < 0.45 && r < 1.8) {
          const rushtonRadial = pumpSpeed * 0.7;
          vx += Math.cos(theta) * rushtonRadial;
          vz += Math.sin(theta) * rushtonRadial;
        }

        // Turbulent eddy diffusion (random velocity perturbations)
        const turbulence = Math.min(0.35, normRPM * 0.35);
        vx += (Math.random() - 0.5) * turbulence;
        vy += (Math.random() - 0.5) * turbulence;
        vz += (Math.random() - 0.5) * turbulence;
      }

      // Integrate position with clamp delta
      const dt = Math.min(0.05, delta);
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;

      // Tank boundary collisions (X, Z: -2.38 to 2.38)
      if (Math.abs(x) > tankHalfWidth) {
        x = Math.sign(x) * tankHalfWidth;
      }
      if (Math.abs(z) > tankHalfWidth) {
        z = Math.sign(z) * tankHalfWidth;
      }

      // Free surface collision (cannot fly out of water)
      if (y > this.liquidLevel - 0.05) {
        y = this.liquidLevel - 0.05;
      }

      // Bottom floor collision (decantation resting bed)
      const floorLevel = 0.06;
      if (y <= floorLevel) {
        y = floorLevel;
        // Friction on floor when settled
        if (rpm < 10) {
          // Stagnant decantation: remains resting on bottom
        } else {
          // Agitator scours bottom: slight jitter to re-entrain
          y += Math.random() * 0.02;
        }
      }

      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;

      // Check if particle is considered suspended (above the bottom 15cm)
      if (y > 0.18) {
        totalSuspended++;
      }
    }

    this.particleGeometry.attributes.position.needsUpdate = true;

    // Calculate suspension percentage
    const currentSuspendedRatio = totalSuspended / this.particleCount;
    this.suspensionRatio = THREE.MathUtils.lerp(this.suspensionRatio, currentSuspendedRatio, 0.05);

    // Update bottom sludge layer visual thickness (grows as solids decant)
    // When 100% decanted -> sludge height = 0.20m (20cm)
    const targetSludgeHeight = Math.max(0.01, (1.0 - this.suspensionRatio) * 0.20);
    this.sludgeHeight = THREE.MathUtils.lerp(this.sludgeHeight, targetSludgeHeight, 0.04);
    this.sludgeMesh.scale.y = this.sludgeHeight / 0.01;
    this.sludgeMesh.position.y = this.sludgeHeight / 2;

    // Liquid opacity & clarity: when decanted, supernatant becomes transparent; when suspended, cloudy
    const baseOpacity = 0.25 + this.suspensionRatio * 0.55 * this.currentPreset.turbidityFactor;
    this.liquidMaterial.opacity = baseOpacity;

    // ==========================================
    // Dynamic Surface Vortex & Ripples
    // ==========================================
    const surfacePositions = this.surfaceGeometry.attributes.position;
    const vertexCount = surfacePositions.count;
    const vortexDepth = normRPM * 0.35; // Center vortex depression up to 35cm
    const waveFreq = 4.0;
    const waveSpeed = 6.0;

    for (let j = 0; j < vertexCount; j++) {
      const vx = surfacePositions.getX(j);
      const vz = surfacePositions.getZ(j);
      const vr = Math.sqrt(vx * vx + vz * vz);

      // Vortex dip formula: exponential funnel at center
      let vy = -vortexDepth * Math.exp(-vr * 1.8);

      // Concentric surface ripples when spinning
      if (normRPM > 0.05) {
        const ripple = Math.sin(vr * waveFreq - elapsedTime * waveSpeed) * (0.015 * normRPM);
        vy += ripple;
      }

      surfacePositions.setY(j, vy);
    }
    surfacePositions.needsUpdate = true;
    this.surfaceGeometry.computeVertexNormals();

    return {
      suspensionPercentage: Math.round(this.suspensionRatio * 100),
      decantedPercentage: Math.round((1.0 - this.suspensionRatio) * 100),
      sludgeBedHeightCm: Math.round(this.sludgeHeight * 100),
      isFullySuspended: isAboveSuspension && this.suspensionRatio > 0.88,
    };
  }

  /**
   * Resets particles to settled state on floor (for quick demonstration of decantation)
   */
  public resetToSettled() {
    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * 4.6;
      positions[idx + 1] = 0.06 + Math.random() * 0.12; // Flat on bottom
      positions[idx + 2] = (Math.random() - 0.5) * 4.6;
    }
    this.particleGeometry.attributes.position.needsUpdate = true;
    this.suspensionRatio = 0.02;
    this.sludgeHeight = 0.18;
  }

  /**
   * Instant flash-mix dispersion of particles throughout the volume
   */
  public flashMix() {
    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * 4.7;
      positions[idx + 1] = 0.1 + Math.random() * (this.liquidLevel - 0.15);
      positions[idx + 2] = (Math.random() - 0.5) * 4.7;
    }
    this.particleGeometry.attributes.position.needsUpdate = true;
    this.suspensionRatio = 0.98;
    this.sludgeHeight = 0.01;
  }

  public dispose() {
    this.liquidMaterial.dispose();
    this.surfaceMaterial.dispose();
    this.sludgeMaterial.dispose();
    this.particleMaterial.dispose();
    this.particleGeometry.dispose();
    this.surfaceGeometry.dispose();
  }
}
