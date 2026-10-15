/**
 * FlowStreamlines: 3D animated visual streamlines representing the dual toroidal
 * recirculation loops created by the lower axial hydrofoil and upper radial turbine.
 * Clearly demonstrates how fluid mechanics prevents decantation and promotes suspension.
 */

import * as THREE from 'three';

export class FlowStreamlines {
  public group: THREE.Group;
  private lineObjects: THREE.Line[] = [];
  private animatedParticles: THREE.Points;
  private particlePositions: Float32Array;
  private particleAlphas: Float32Array;
  private streamlineCount = 12;
  private streamPointsPerLine = 60;
  private totalStreamParticles: number;
  private particleGeo: THREE.BufferGeometry;
  private particleMat: THREE.PointsMaterial;
  private lineMat: THREE.LineBasicMaterial;
  private visible = true;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ToroidalFlowStreamlines';

    this.totalStreamParticles = this.streamlineCount * 30; // 360 flowing flow-indicator nodes
    this.particlePositions = new Float32Array(this.totalStreamParticles * 3);
    this.particleAlphas = new Float32Array(this.totalStreamParticles);

    this.lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });

    // Build the 12 toroidal 3D closed curves around the tank
    for (let s = 0; s < this.streamlineCount; s++) {
      const azimuth = (s * Math.PI * 2) / this.streamlineCount;
      const curvePoints: THREE.Vector3[] = [];

      // Parametric toroidal circulation loop
      for (let p = 0; p <= this.streamPointsPerLine; p++) {
        const t = (p / this.streamPointsPerLine) * Math.PI * 2;
        // Loop coordinates:
        // Center of loop is at radius ~1.4m, height Y ~ 1.8m
        // Downward along center shaft (r ~ 0.5m, y ~ 0.8m)
        // Outward along floor (r ~ 2.1m, y ~ 0.2m)
        // Upward along wall (r ~ 2.2m, y ~ 2.8m)
        // Inward near surface (r ~ 0.7m, y ~ 3.2m)
        const radius = 1.35 + Math.cos(t) * 0.85;
        const y = 1.75 - Math.sin(t) * 1.35;

        // Slight azimuthal twist from impeller rotation
        const twistAngle = azimuth + Math.sin(t * 0.5) * 0.25;
        const x = Math.cos(twistAngle) * radius;
        const z = Math.sin(twistAngle) * radius;

        curvePoints.push(new THREE.Vector3(x, y, z));
      }

      const geo = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const line = new THREE.Line(geo, this.lineMat);
      this.lineObjects.push(line);
      this.group.add(line);
    }

    // Initialize animated particles flowing along these loops
    for (let i = 0; i < this.totalStreamParticles; i++) {
      this.particlePositions[i * 3] = 0;
      this.particlePositions[i * 3 + 1] = 1.0;
      this.particlePositions[i * 3 + 2] = 0;
      this.particleAlphas[i] = Math.random();
    }

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.particlePositions, 3)
    );

    // Glowing cyan / aqua flow nodes
    this.particleMat = new THREE.PointsMaterial({
      size: 0.12,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.animatedParticles = new THREE.Points(this.particleGeo, this.particleMat);
    this.group.add(this.animatedParticles);
  }

  public setVisible(visible: boolean) {
    this.visible = visible;
    this.group.visible = visible;
  }

  public update(delta: number, rpm: number, direction: 1 | -1, elapsedTime: number) {
    if (!this.visible) return;

    const normRPM = Math.min(1.0, rpm / 180);
    // Streamlines fade out when agitator is stopped
    const targetOpacity = normRPM > 0.02 ? 0.35 * Math.min(1.0, normRPM * 2.5) : 0;
    this.lineMat.opacity = THREE.MathUtils.lerp(this.lineMat.opacity, targetOpacity, 0.08);
    this.particleMat.opacity = THREE.MathUtils.lerp(
      this.particleMat.opacity,
      normRPM > 0.02 ? 0.85 : 0,
      0.08
    );

    if (rpm < 1) return;

    const speed = (rpm / 60) * 1.8;
    const positions = this.particleGeo.attributes.position.array as Float32Array;

    let pIdx = 0;
    for (let s = 0; s < this.streamlineCount; s++) {
      const azimuth = (s * Math.PI * 2) / this.streamlineCount;
      const particlesPerLine = 30;

      for (let k = 0; k < particlesPerLine; k++) {
        // Continuous loop phase
        const phaseOffset = k / particlesPerLine;
        const t = ((elapsedTime * speed * direction + phaseOffset) % 1.0) * Math.PI * 2;

        const radius = 1.35 + Math.cos(t) * 0.85;
        const y = 1.75 - Math.sin(t) * 1.35;
        const twistAngle = azimuth + Math.sin(t * 0.5) * 0.25;

        const x = Math.cos(twistAngle) * radius;
        const z = Math.sin(twistAngle) * radius;

        const idx = pIdx * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        pIdx++;
      }
    }

    this.particleGeo.attributes.position.needsUpdate = true;
  }

  public dispose() {
    this.lineMat.dispose();
    this.particleMat.dispose();
    this.particleGeo.dispose();
    this.lineObjects.forEach((line) => line.geometry.dispose());
  }
}
