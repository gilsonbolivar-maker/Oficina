/**
 * Types and physical calculation models for the 5x5x4m Industrial Tank & Agitator Simulation
 */

export interface FluidPreset {
  id: string;
  name: string;
  description: string;
  fluidDensity: number; // kg/m3 (e.g. 1000 for water)
  viscosity: number; // Pa.s (e.g. 0.001 for water)
  particleDensity: number; // kg/m3 (e.g. 2200 for sand/mineral, 1300 for organic sludge)
  particleDiameterMicrons: number; // micrometers (um)
  baseColor: string; // Hex color for fluid
  sedimentColor: string; // Hex color for sludge
  turbidityFactor: number; // 0 to 1 opacity influence
}

export const FLUID_PRESETS: FluidPreset[] = [
  {
    id: 'industrial_sludge',
    name: 'Efluente com Lodo Ativado',
    description: 'Tratamento de efluentes industriais com sólidos orgânicos e inorgânicos em suspensão.',
    fluidDensity: 1020,
    viscosity: 0.0015,
    particleDensity: 1350,
    particleDiameterMicrons: 75,
    baseColor: '#2b3f33',
    sedimentColor: '#1d2720',
    turbidityFactor: 0.75,
  },
  {
    id: 'lime_slurry',
    name: 'Leite de Cal / Ca(OH)₂',
    description: 'Suspensão alcalina para neutralização e precipitação química; alta velocidade de decantação.',
    fluidDensity: 1150,
    viscosity: 0.0035,
    particleDensity: 2210,
    particleDiameterMicrons: 110,
    baseColor: '#d6dfd8',
    sedimentColor: '#c2ccc5',
    turbidityFactor: 0.95,
  },
  {
    id: 'silica_slurry',
    name: 'Polpa de Sílica / Areia Fina',
    description: 'Mineração e processamento mineral com partículas minerais densas e abrasivas.',
    fluidDensity: 1180,
    viscosity: 0.0022,
    particleDensity: 2650,
    particleDiameterMicrons: 90,
    baseColor: '#c7b28a',
    sedimentColor: '#8c734b',
    turbidityFactor: 0.85,
  },
  {
    id: 'chemical_precipitate',
    name: 'Precipitado Químico Fino',
    description: 'Reator químico com flocos finos em suspensão branda; decantação lenta.',
    fluidDensity: 1050,
    viscosity: 0.0020,
    particleDensity: 1600,
    particleDiameterMicrons: 45,
    baseColor: '#22526e',
    sedimentColor: '#123347',
    turbidityFactor: 0.70,
  },
];

export type ViewMode = 'acrylic' | 'cutaway' | 'metallic';

export interface TankSimulationState {
  // Tank geometry (fixed 5x5x4m)
  readonly length: 5.0; // meters (X)
  readonly width: 5.0; // meters (Z)
  readonly height: 4.0; // meters (Y)
  
  // Operational parameters
  liquidLevel: number; // meters (0.5 to 3.8, default 3.4m)
  agitatorActive: boolean;
  agitatorRPM: number; // 0 to 180 RPM
  targetRPM: number;
  rotationDirection: 1 | -1; // 1 = clockwise, -1 = counter-clockwise
  
  // Selected fluid
  currentPresetId: string;
  fluidDensity: number; // kg/m³
  viscosity: number; // Pa·s
  particleDensity: number; // kg/m³
  particleDiameter: number; // microns
  
  // Visual toggles
  viewMode: ViewMode;
  showFlowStreamlines: boolean;
  showDimensions: boolean;
  showBaffles: boolean;
  cutawayAngle: number; // 0 to 180 degrees
  soundEnabled: boolean;
  soundVolume: number; // 0 to 1
  
  // Simulation physics output
  suspensionPercentage: number; // 0 to 100%
  decantedPercentage: number; // 0 to 100%
  sludgeBedHeightCm: number; // 0 to 40 cm
  reynoldsNumber: number;
  powerConsumptionKw: number;
  agitatorTorqueNm: number;
  isFullySuspended: boolean;
  zwieteringSpeedRpm: number;
  stokesSettlingVelocityMmPerSec: number;
}



/**
 * Chemical Engineering formulas for Agitated Vessels:
 * 
 * 1. Stokes' Law for gravitational settling:
 *    v_s = [g * (rho_p - rho_f) * d_p^2] / (18 * mu)
 * 
 * 2. Reynolds Number for mixing:
 *    Re = (rho_f * N * D^2) / mu
 *    where N = rev/s, D = impeller diameter (m)
 * 
 * 3. Power consumption:
 *    P = N_p * rho_f * N^3 * D^5
 *    summed per impeller: PBT-45° (N_p ~1.27, D 1.65 m) + Rushton (N_p ~5.0, D 1.40 m, only if submerged)
 * 
 * 4. Zwietering Criterion for Complete Off-Bottom Suspension (N_js):
 *    N_js = s * nu^0.1 * [g * (rho_p - rho_f) / rho_f]^0.45 * d_p^0.2 * X^0.13 * D^(-0.85)
 */
const PBT_POWER_NUMBER = 1.27;
const RUSHTON_POWER_NUMBER = 5.0;
const RUSHTON_DIAMETER = 1.4; // m
const RUSHTON_HEIGHT = 2.1; // m from tank floor
const RUSHTON_BLADE_HALF = 0.11; // m (blade height 0.22 m)

export function calculateAgitationPhysics(
  rpm: number,
  liquidLevel: number,
  fluidDensity: number,
  viscosity: number,
  particleDensity: number,
  particleDiameterMicrons: number
) {
  const g = 9.81;
  const D = 1.65; // Impeller diameter in meters (1.65m in 5m tank -> D/T ~ 0.33)
  const d_p = particleDiameterMicrons * 1e-6; // convert um to m
  const deltaRho = Math.max(10, particleDensity - fluidDensity);
  
  // Stokes settling velocity (m/s)
  const stokesVelocity = (g * deltaRho * Math.pow(d_p, 2)) / (18 * Math.max(1e-5, viscosity));
  const stokesMmPerSec = stokesVelocity * 1000;
  
  // Revolutions per second
  const N = Math.max(0, rpm) / 60;
  
  // Reynolds number
  const reynolds = (fluidDensity * N * Math.pow(D, 2)) / Math.max(1e-5, viscosity);
  
  // Power: each impeller contributes N_p * rho * N^3 * D^5 (fully turbulent, baffled tank).
  // Lower PBT-45° (4 blades): N_p ~ 1.27, D = 1.65 m.
  // Mid Rushton (6 blades):   N_p ~ 5.0,  D = 1.40 m at Y = 2.10 m — only while submerged.
  const rushtonSubmersion = Math.min(
    1,
    Math.max(0, (liquidLevel - (RUSHTON_HEIGHT - RUSHTON_BLADE_HALF)) / (2 * RUSHTON_BLADE_HALF))
  );
  const powerFactor =
    PBT_POWER_NUMBER * Math.pow(D, 5) +
    RUSHTON_POWER_NUMBER * Math.pow(RUSHTON_DIAMETER, 5) * rushtonSubmersion;
  const powerWatts = powerFactor * fluidDensity * Math.pow(N, 3);
  const powerKw = powerWatts / 1000;
  
  // Torque (Nm) = Power / (2 * pi * N)
  const omega = 2 * Math.PI * N;
  const torqueNm = omega > 0.01 ? powerWatts / omega : 0;
  
  // Zwietering critical off-bottom suspension speed (N_js)
  // s ~ 6.2 for pitched blade turbine in baffled square/cylindrical tank with standard clearance
  const kinematicViscosity = viscosity / fluidDensity;
  const s = 6.2;
  const X = 5.0; // Solids weight concentration (%)
  const n_js_rev_per_sec = s * Math.pow(kinematicViscosity, 0.1) * 
    Math.pow((g * deltaRho) / fluidDensity, 0.45) * 
    Math.pow(d_p, 0.2) * 
    Math.pow(X, 0.13) * 
    Math.pow(D, -0.85);
  const zwieteringRpm = Math.round(n_js_rev_per_sec * 60);
  
  // Ratio of current RPM to critical suspension RPM
  const suspensionRatio = rpm / Math.max(1, zwieteringRpm);
  const isFullySuspended = suspensionRatio >= 0.95;
  
  // Equilibrium suspension percentage
  // At 0 RPM -> 0%
  // At N_js -> ~98%
  let targetSuspension = 0;
  if (rpm > 0) {
    if (suspensionRatio < 1.0) {
      targetSuspension = Math.min(95, Math.pow(suspensionRatio, 1.8) * 95);
    } else {
      targetSuspension = Math.min(100, 95 + (suspensionRatio - 1.0) * 5);
    }
  }
  
  const targetDecanted = Math.max(0, 100 - targetSuspension);
  // Maximum sludge bed thickness in this tank if 100% decanted ~ 20 cm
  const sludgeBedHeightCm = (targetDecanted / 100) * 20;
  
  // Tank volume
  const totalVolumeM3 = 5.0 * 5.0 * 4.0; // 100 m³
  const liquidVolumeM3 = 5.0 * 5.0 * liquidLevel; // e.g. 85 m³
  const liquidMassTons = (liquidVolumeM3 * fluidDensity) / 1000;
  
  return {
    stokesMmPerSec,
    reynolds: Math.round(reynolds),
    powerKw: Number(powerKw.toFixed(2)),
    torqueNm: Math.round(torqueNm),
    zwieteringRpm,
    isFullySuspended,
    targetSuspension: Number(targetSuspension.toFixed(1)),
    targetDecanted: Number(targetDecanted.toFixed(1)),
    sludgeBedHeightCm: Number(sludgeBedHeightCm.toFixed(1)),
    totalVolumeM3,
    liquidVolumeM3: Number(liquidVolumeM3.toFixed(1)),
    liquidMassTons: Number(liquidMassTons.toFixed(1)),
  };
}

// Initial operating point: 45 RPM keeps every preset above its N_js (20–38 RPM)
// at a realistic ~0.3 kW/m³. HUD values come from the same formulas used live.
const INITIAL_RPM = 45;
const INITIAL_LEVEL = 3.4;
const initialPreset = FLUID_PRESETS[0];
const initialPhysics = calculateAgitationPhysics(
  INITIAL_RPM,
  INITIAL_LEVEL,
  initialPreset.fluidDensity,
  initialPreset.viscosity,
  initialPreset.particleDensity,
  initialPreset.particleDiameterMicrons
);

export const INITIAL_SIMULATION_STATE: TankSimulationState = {
  length: 5.0,
  width: 5.0,
  height: 4.0,
  
  liquidLevel: INITIAL_LEVEL,
  agitatorActive: true,
  agitatorRPM: INITIAL_RPM,
  targetRPM: INITIAL_RPM,
  rotationDirection: 1,
  
  currentPresetId: 'industrial_sludge',
  fluidDensity: 1020,
  viscosity: 0.0015,
  particleDensity: 1350,
  particleDiameter: 75,
  
  viewMode: 'acrylic',
  showFlowStreamlines: true,
  showDimensions: true,
  showBaffles: true,
  cutawayAngle: 90,
  soundEnabled: false,
  soundVolume: 0.35,
  
  suspensionPercentage: initialPhysics.targetSuspension,
  decantedPercentage: initialPhysics.targetDecanted,
  sludgeBedHeightCm: initialPhysics.sludgeBedHeightCm,
  reynoldsNumber: initialPhysics.reynolds,
  powerConsumptionKw: initialPhysics.powerKw,
  agitatorTorqueNm: initialPhysics.torqueNm,
  isFullySuspended: initialPhysics.isFullySuspended,
  zwieteringSpeedRpm: initialPhysics.zwieteringRpm,
  stokesSettlingVelocityMmPerSec: initialPhysics.stokesMmPerSec,
};
