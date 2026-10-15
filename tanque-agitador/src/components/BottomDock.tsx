/**
 * BottomDock: Consolidated collapsible bottom control center
 * Complies with Three.js Skill Directive 5 (Zero Viewport Occlusion).
 * Groups operational agitator controls, sedimentation tests, fluid presets,
 * 3D display modes, and camera angles.
 */

import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Droplets,
  Eye,
  FastForward,
  Gauge,
  Layers,
  Power,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { CameraPreset } from '../three/TankScene';
import {
  FLUID_PRESETS,
  FluidPreset,
  TankSimulationState,
  ViewMode,
} from '../types/simulation';
import { TelemetryChart, TelemetryDataPoint } from './TelemetryChart';

interface BottomDockProps {
  state: TankSimulationState;
  telemetryData: TelemetryDataPoint[];
  onUpdateState: (newState: Partial<TankSimulationState>) => void;
  onSetCameraPreset: (preset: CameraPreset) => void;
  onResetToSettled: () => void;
  onFlashMix: () => void;
  activeTabOverride?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export type TabType = 'agitator' | 'telemetry' | 'fluid' | 'view' | 'camera';

export const BottomDock: React.FC<BottomDockProps> = ({
  state,
  telemetryData,
  onUpdateState,
  onSetCameraPreset,
  onResetToSettled,
  onFlashMix,
  activeTabOverride,
  onTabChange,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [internalTab, setInternalTab] = useState<TabType>('agitator');

  const activeTab = activeTabOverride !== undefined ? activeTabOverride : internalTab;
  const handleTabClick = (tab: TabType) => {
    setInternalTab(tab);
    if (collapsed) setCollapsed(false);
    if (onTabChange) onTabChange(tab);
  };

  const selectedPreset =
    FLUID_PRESETS.find((p) => p.id === state.currentPresetId) || FLUID_PRESETS[0];

  return (
    <div className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-20 w-[96vw] max-w-4xl transition-all duration-300 ease-out">
      {/* Collapse / Expand Toggle Button */}
      <div className="flex justify-center -mb-2 relative z-30">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 bg-slate-900/95 border border-slate-700/80 rounded-full shadow-lg hover:text-sky-400 hover:bg-slate-800 transition-colors"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
              <span>Expandir Controles (3D View)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
              <span>Modo Cinema / Ocultar Painel</span>
            </>
          )}
        </button>
      </div>

      {/* Main Glassmorphic Dock Container */}
      {!collapsed && (
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-3 sm:p-4 text-slate-200">
          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3 overflow-x-auto no-scrollbar gap-1 sm:gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleTabClick('agitator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'agitator'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Agitador & Motor</span>
              </button>

              <button
                onClick={() => handleTabClick('telemetry')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'telemetry'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Histórico & Gráficos (60s)</span>
              </button>

              <button
                onClick={() => handleTabClick('fluid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'fluid'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Droplets className="w-3.5 h-3.5" />
                <span>Decantação & Fluido</span>
              </button>

              <button
                onClick={() => handleTabClick('view')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'view'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Visualização 3D</span>
              </button>

              <button
                onClick={() => handleTabClick('camera')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'camera'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Câmeras</span>
              </button>
            </div>

            {/* Quick Agitator Status Indicator */}
            <div className="flex items-center gap-2 pl-2">
              <button
                onClick={() => onUpdateState({ agitatorActive: !state.agitatorActive })}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
                  state.agitatorActive
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{state.agitatorActive ? 'LIGADO' : 'DESLIGADO'}</span>
              </button>
            </div>
          </div>

          {/* TAB 1: AGITATOR & SPEED */}
          {activeTab === 'agitator' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              {/* RPM Slider */}
              <div className="md:col-span-6 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Velocidade de Rotação (RPM):</span>
                  <span className="font-mono text-sky-400 font-bold text-sm">
                    {state.targetRPM} RPM
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="180"
                  step="5"
                  value={state.targetRPM}
                  onChange={(e) =>
                    onUpdateState({
                      targetRPM: Number(e.target.value),
                      agitatorActive: Number(e.target.value) > 0 ? true : state.agitatorActive,
                    })
                  }
                  className="w-full accent-sky-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0 (Parado)</span>
                  <span className="text-amber-400/80">{state.zwieteringSpeedRpm} (Njs Suspensão)</span>
                  <span>180 (Máx)</span>
                </div>
              </div>

              {/* Preset Speed Buttons */}
              <div className="md:col-span-6 flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => onUpdateState({ targetRPM: 0, agitatorActive: false })}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  0 RPM (Decantar)
                </button>
                <button
                  onClick={() => onUpdateState({ targetRPM: 35, agitatorActive: true })}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  35 RPM (Suave)
                </button>
                <button
                  onClick={() =>
                    onUpdateState({
                      targetRPM: state.zwieteringSpeedRpm,
                      agitatorActive: true,
                    })
                  }
                  title="Velocidade Crítica de Zwietering para levantar 100% dos sedimentos do fundo"
                  className="px-2.5 py-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900 text-xs text-sky-300 border border-sky-700/60 transition-colors font-medium"
                >
                  {state.zwieteringSpeedRpm} RPM (Njs Crítico)
                </button>
                <button
                  onClick={() => onUpdateState({ targetRPM: 120, agitatorActive: true })}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                >
                  120 RPM (Forte)
                </button>
                <button
                  onClick={() =>
                    onUpdateState({
                      rotationDirection: state.rotationDirection === 1 ? -1 : 1,
                    })
                  }
                  title="Inverter sentido de giro do agitador"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3 text-sky-400" />
                  <span>{state.rotationDirection === 1 ? 'Horário' : 'Anti-horário'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB: HISTORICAL TELEMETRY (TORQUE & POWER 60s) */}
          {activeTab === 'telemetry' && (
            <div className="py-1">
              <TelemetryChart
                data={telemetryData}
                currentPowerKw={state.powerConsumptionKw}
                currentTorqueNm={state.agitatorTorqueNm}
                currentRpm={state.agitatorRPM}
              />
            </div>
          )}

          {/* TAB 2: FLUID & SEDIMENTATION */}
          {activeTab === 'fluid' && (
            <div className="space-y-3">
              {/* Presets Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FLUID_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      onUpdateState({
                        currentPresetId: preset.id,
                        fluidDensity: preset.fluidDensity,
                        viscosity: preset.viscosity,
                        particleDensity: preset.particleDensity,
                        particleDiameter: preset.particleDiameterMicrons,
                      });
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      state.currentPresetId === preset.id
                        ? 'bg-sky-950/70 border-sky-500 text-sky-200'
                        : 'bg-slate-800/70 border-slate-700/70 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className="w-3 h-3 rounded-full border border-slate-500 shadow-sm"
                        style={{ backgroundColor: preset.baseColor }}
                      />
                      <span className="text-xs font-bold truncate">{preset.name}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ρ = {preset.fluidDensity} kg/m³
                    </div>
                  </button>
                ))}
              </div>

              {/* Rapid Decantation & Suspension Test Buttons */}
              <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      onUpdateState({ targetRPM: 0, agitatorActive: false });
                      onResetToSettled();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-700/70 text-rose-300 hover:bg-rose-900 text-xs font-medium transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Simular Decantação Completa (Fundo)</span>
                  </button>

                  <button
                    onClick={() => {
                      onUpdateState({ targetRPM: 130, agitatorActive: true });
                      onFlashMix();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-950/80 border border-sky-700/70 text-sky-300 hover:bg-sky-900 text-xs font-medium transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Ressuspensão Instantânea (Flash Mix)</span>
                  </button>
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  Sedimentação Stokes:{' '}
                  <span className="text-sky-300">
                    {state.stokesSettlingVelocityMmPerSec?.toFixed(2)} mm/s
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 3D VIEW MODES & TOGGLES */}
          {activeTab === 'view' && (
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              {/* Wall style pills */}
              <div className="sm:col-span-6 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Estrutura das Paredes:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onUpdateState({ viewMode: 'acrylic' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      state.viewMode === 'acrylic'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Acrílico 360°
                  </button>
                  <button
                    onClick={() => onUpdateState({ viewMode: 'cutaway' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      state.viewMode === 'cutaway'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Corte Transversal 50%
                  </button>
                  <button
                    onClick={() => onUpdateState({ viewMode: 'metallic' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      state.viewMode === 'metallic'
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/50'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    Aço com Visor
                  </button>
                </div>
              </div>

              {/* Visual layers toggle */}
              <div className="sm:col-span-6 space-y-1.5">
                <span className="text-xs text-slate-400 font-medium">Elementos Visuais:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() =>
                      onUpdateState({ showFlowStreamlines: !state.showFlowStreamlines })
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      state.showFlowStreamlines
                        ? 'bg-sky-950 text-sky-300 border-sky-700'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Linhas de Fluxo
                  </button>
                  <button
                    onClick={() => onUpdateState({ showDimensions: !state.showDimensions })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      state.showDimensions
                        ? 'bg-sky-950 text-sky-300 border-sky-700'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    Cotas 5x5x4m
                  </button>
                  <button
                    onClick={() => onUpdateState({ showBaffles: !state.showBaffles })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      state.showBaffles
                        ? 'bg-sky-950 text-sky-300 border-sky-700'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    4 Chicanas
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CAMERA PRESETS */}
          {activeTab === 'camera' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => onSetCameraPreset('isometric')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
                >
                  Visão Isométrica Geral
                </button>
                <button
                  onClick={() => onSetCameraPreset('front')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
                >
                  Corte Frontal Nível dos Olhos
                </button>
                <button
                  onClick={() => onSetCameraPreset('top')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
                >
                  Vista Superior / Vórtice
                </button>
                <button
                  onClick={() => onSetCameraPreset('impeller')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
                >
                  Foco na Turbina de Fundo
                </button>
                <button
                  onClick={() => onSetCameraPreset('ground')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
                >
                  Nível do Chão (Base)
                </button>
              </div>

              <div className="text-[11px] text-slate-400 italic">
                * Dica: Arraste com o mouse para orbitar 360°, scroll para zoom.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
