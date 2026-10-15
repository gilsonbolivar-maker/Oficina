/**
 * TankScene: Master Three.js Scene Controller
 * Implements RoomEnvironment, ACESFilmicToneMapping, PCFSoftShadowMap,
 * OrbitControls, smooth exponential camera damping, and full coordination of
 * TankModel, AgitatorModel, LiquidAndSediment, and FlowStreamlines.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  calculateAgitationPhysics,
  FLUID_PRESETS,
  TankSimulationState,
  ViewMode,
} from '../types/simulation';
import { AgitatorModel } from './AgitatorModel';
import { FlowStreamlines } from './FlowStreamlines';
import { LiquidAndSediment } from './LiquidAndSediment';
import { TankModel } from './TankModel';

export type CameraPreset = 'isometric' | 'front' | 'top' | 'impeller' | 'ground';

export interface ScenePhysicsUpdate {
  suspensionPercentage: number;
  decantedPercentage: number;
  sludgeBedHeightCm: number;
  isFullySuspended: boolean;
  reynoldsNumber: number;
  powerConsumptionKw: number;
  agitatorTorqueNm: number;
  zwieteringSpeedRpm: number;
  stokesSettlingVelocityMmPerSec: number;
  currentRPM: number;
}

export class TankScene {
  private container: HTMLDivElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;

  private tankModel: TankModel;
  private agitatorModel: AgitatorModel;
  private liquidSystem: LiquidAndSediment;
  private streamlines: FlowStreamlines;

  // Animation & simulation timing
  private clock: THREE.Clock;
  private animationFrameId = 0;
  private isDisposed = false;

  // Camera damping target
  private targetCameraPos: THREE.Vector3;
  private targetLookAt: THREE.Vector3;
  private isMovingCamera = false;

  // Current simulation state
  private state: TankSimulationState;
  private onPhysicsUpdate?: (update: ScenePhysicsUpdate) => void;

  constructor(
    container: HTMLDivElement,
    initialState: TankSimulationState,
    onPhysicsUpdate?: (update: ScenePhysicsUpdate) => void
  ) {
    this.container = container;
    this.state = { ...initialState };
    this.onPhysicsUpdate = onPhysicsUpdate;
    this.clock = new THREE.Clock();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090d16); // Deep industrial slate
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.035);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(7.8, 5.8, 7.8);

    this.targetCameraPos = this.camera.position.clone();
    this.targetLookAt = new THREE.Vector3(0, 2.0, 0);

    // 3. Renderer setup (PBR standards from Three.js skill)
    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !isHeadless;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.copy(this.targetLookAt);
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Prevent camera from going beneath floor
    this.controls.minDistance = 2.0;
    this.controls.maxDistance = 24.0;

    // Detect user manual interaction
    this.controls.addEventListener('start', () => {
      this.isMovingCamera = false;
    });

    // 5. Studio Environment Map (RoomEnvironment via PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    pmremGenerator.dispose();

    // 6. Balanced 3-Point Studio Lighting
    this.setupLighting();

    // 7. Ground Contact Shadow & Factory Floor
    this.setupGround();

    // 8. Instantiate procedural models
    const initialPreset =
      FLUID_PRESETS.find((p) => p.id === initialState.currentPresetId) || FLUID_PRESETS[0];

    this.tankModel = new TankModel();
    this.agitatorModel = new AgitatorModel();
    this.liquidSystem = new LiquidAndSediment(initialPreset);
    this.streamlines = new FlowStreamlines();

    this.scene.add(this.tankModel.group);
    this.scene.add(this.agitatorModel.group);
    this.scene.add(this.liquidSystem.group);
    this.scene.add(this.streamlines.group);

    // Apply initial visibility
    this.tankModel.setViewMode(initialState.viewMode);
    this.tankModel.setBafflesVisible(initialState.showBaffles);
    this.tankModel.setDimensionsVisible(initialState.showDimensions);
    this.streamlines.setVisible(initialState.showFlowStreamlines);
    this.liquidSystem.setLiquidLevel(initialState.liquidLevel);

    // Pre-warm shaders
    this.renderer.compile(this.scene, this.camera);

    // Resize listener
    window.addEventListener('resize', this.handleResize);

    // Start render loop
    this.tick();
  }

  private setupLighting() {
    // Hemisphere ambient fill (cool sky, warm industrial ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.7);
    hemiLight.position.set(0, 15, 0);
    this.scene.add(hemiLight);

    // Key Light (sun/high studio softbox with shadow mapping)
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(8, 12, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    this.scene.add(keyLight);

    // Cool Rim Light (accents back edges of the tank and motor)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    rimLight.position.set(-8, 9, -7);
    this.scene.add(rimLight);

    // Gentle fill light from front-left
    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.6);
    fillLight.position.set(-6, 3, 6);
    this.scene.add(fillLight);
  }

  private setupGround() {
    // Factory grid floor
    const gridHelper = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
    gridHelper.position.y = -0.28;
    this.scene.add(gridHelper);

    // Radial contact shadow under tank
    const shadowGeo = new THREE.PlaneGeometry(8.5, 8.5);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 120);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    }
    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.27;
    this.scene.add(shadowMesh);
  }

  private handleResize = () => {
    if (!this.container || this.isDisposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public setCameraPreset(preset: CameraPreset) {
    this.isMovingCamera = true;
    switch (preset) {
      case 'isometric':
        this.targetCameraPos.set(7.5, 5.8, 7.5);
        this.targetLookAt.set(0, 2.0, 0);
        break;
      case 'front':
        this.targetCameraPos.set(0, 2.3, 8.4);
        this.targetLookAt.set(0, 2.0, 0);
        break;
      case 'top':
        this.targetCameraPos.set(0.01, 9.2, 0.1);
        this.targetLookAt.set(0, 2.0, 0);
        break;
      case 'impeller':
        this.targetCameraPos.set(2.4, 1.2, 2.4);
        this.targetLookAt.set(0, 0.7, 0);
        break;
      case 'ground':
        this.targetCameraPos.set(6.2, 0.6, 4.5);
        this.targetLookAt.set(0, 1.8, 0);
        break;
    }
  }

  public updateState(newState: Partial<TankSimulationState>) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...newState };

    if (newState.viewMode && newState.viewMode !== prevState.viewMode) {
      this.tankModel.setViewMode(newState.viewMode);
    }

    if (
      newState.showBaffles !== undefined &&
      newState.showBaffles !== prevState.showBaffles
    ) {
      this.tankModel.setBafflesVisible(newState.showBaffles);
    }

    if (
      newState.showDimensions !== undefined &&
      newState.showDimensions !== prevState.showDimensions
    ) {
      this.tankModel.setDimensionsVisible(newState.showDimensions);
    }

    if (
      newState.showFlowStreamlines !== undefined &&
      newState.showFlowStreamlines !== prevState.showFlowStreamlines
    ) {
      this.streamlines.setVisible(newState.showFlowStreamlines);
    }

    if (
      newState.liquidLevel !== undefined &&
      newState.liquidLevel !== prevState.liquidLevel
    ) {
      this.liquidSystem.setLiquidLevel(newState.liquidLevel);
    }

    if (
      newState.currentPresetId &&
      newState.currentPresetId !== prevState.currentPresetId
    ) {
      const preset = FLUID_PRESETS.find((p) => p.id === newState.currentPresetId);
      if (preset) {
        this.liquidSystem.setFluidPreset(preset);
      }
    }
  }

  public resetToSettled() {
    this.liquidSystem.resetToSettled();
  }

  public flashMix() {
    this.liquidSystem.flashMix();
  }

  private tick = () => {
    if (this.isDisposed) return;

    this.animationFrameId = requestAnimationFrame(this.tick);

    const delta = Math.min(0.1, this.clock.getDelta());
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Smoothly interpolate RPM towards target RPM (motor mechanical inertia)
    const effectiveTargetRPM = this.state.agitatorActive ? this.state.targetRPM : 0;
    this.state.agitatorRPM = THREE.MathUtils.damp(
      this.state.agitatorRPM,
      effectiveTargetRPM,
      1.8,
      delta
    );

    // 2. Rotate mechanical agitator shaft & impellers
    this.agitatorModel.update(delta, this.state.agitatorRPM, this.state.rotationDirection);

    // 3. Compute agitation physics calculations
    const physics = calculateAgitationPhysics(
      this.state.agitatorRPM,
      this.state.liquidLevel,
      this.state.fluidDensity,
      this.state.viscosity,
      this.state.particleDensity,
      this.state.particleDiameter
    );

    // 4. Update particle suspension, settling and liquid vortex
    const simResult = this.liquidSystem.updatePhysics(
      delta,
      this.state.agitatorRPM,
      this.state.rotationDirection,
      physics.stokesMmPerSec,
      physics.zwieteringRpm,
      elapsedTime
    );

    // 5. Update streamlines
    this.streamlines.update(
      delta,
      this.state.agitatorRPM,
      this.state.rotationDirection,
      elapsedTime
    );

    // 6. Camera smooth interpolation if moving to a preset
    if (this.isMovingCamera) {
      this.camera.position.x = THREE.MathUtils.damp(
        this.camera.position.x,
        this.targetCameraPos.x,
        4.0,
        delta
      );
      this.camera.position.y = THREE.MathUtils.damp(
        this.camera.position.y,
        this.targetCameraPos.y,
        4.0,
        delta
      );
      this.camera.position.z = THREE.MathUtils.damp(
        this.camera.position.z,
        this.targetCameraPos.z,
        4.0,
        delta
      );

      this.controls.target.x = THREE.MathUtils.damp(
        this.controls.target.x,
        this.targetLookAt.x,
        4.0,
        delta
      );
      this.controls.target.y = THREE.MathUtils.damp(
        this.controls.target.y,
        this.targetLookAt.y,
        4.0,
        delta
      );
      this.controls.target.z = THREE.MathUtils.damp(
        this.controls.target.z,
        this.targetLookAt.z,
        4.0,
        delta
      );

      if (this.camera.position.distanceTo(this.targetCameraPos) < 0.05) {
        this.isMovingCamera = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // 7. Fire physics update to React UI HUD throttled every few frames
    if (this.onPhysicsUpdate && Math.floor(elapsedTime * 15) % 2 === 0) {
      this.onPhysicsUpdate({
        suspensionPercentage: simResult.suspensionPercentage,
        decantedPercentage: simResult.decantedPercentage,
        sludgeBedHeightCm: simResult.sludgeBedHeightCm,
        isFullySuspended: simResult.isFullySuspended,
        reynoldsNumber: physics.reynolds,
        powerConsumptionKw: physics.powerKw,
        agitatorTorqueNm: physics.torqueNm,
        zwieteringSpeedRpm: physics.zwieteringRpm,
        stokesSettlingVelocityMmPerSec: physics.stokesMmPerSec,
        currentRPM: Math.round(this.state.agitatorRPM),
      });
    }
  };

  public dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);

    this.tankModel.dispose();
    this.agitatorModel.dispose();
    this.liquidSystem.dispose();
    this.streamlines.dispose();

    this.controls.dispose();
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
