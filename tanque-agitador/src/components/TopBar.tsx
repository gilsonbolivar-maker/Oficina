/**
 * TopBar: Minimalist industrial SCADA header with tank dimensions,
 * suspension status badge (no pulsating dots), and real-time operational telemetry.
 */

import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RotateCw,
  Volume2,
  VolumeX,
  Waves,
  TrendingUp,
  Download,
} from 'lucide-react';
import { TankSimulationState } from '../types/simulation';
import { ScenePhysicsUpdate } from '../three/TankScene';
import { CODIGO_URL, VERSAO } from '../versao';

interface TopBarProps {
  state: TankSimulationState;
  physics: ScenePhysicsUpdate;
  onToggleSound: () => void;
  onOpenInfo: () => void;
  onToggleAgitator: () => void;
  onOpenTelemetry?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  state,
  physics,
  onToggleSound,
  onOpenInfo,
  onToggleAgitator,
  onOpenTelemetry,
}) => {
  // Determine suspension status
  let statusColor = 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40';
  let statusIcon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  let statusText = 'SUSPENSÃO COMPLETA (SEM DECANTAÇÃO)';

  if (physics.currentRPM < 5 || physics.suspensionPercentage < 30) {
    statusColor = 'bg-rose-950/80 text-rose-400 border-rose-500/40';
    statusIcon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
    statusText = 'DECANTAÇÃO ATIVA / LÍQUIDO PARADO';
  } else if (!physics.isFullySuspended || physics.suspensionPercentage < 85) {
    statusColor = 'bg-amber-950/80 text-amber-400 border-amber-500/40';
    statusIcon = <Activity className="w-4 h-4 text-amber-400" />;
    statusText = 'MISTURA PARCIAL / RESSUSPENDENDO';
  }

  const liquidVolume = (state.length * state.width * state.liquidLevel).toFixed(1);

  return (
    <header className="absolute top-0 left-0 right-0 z-30 p-3 sm:p-4 pointer-events-none">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Left: Industrial Identification Badge */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/70 rounded-xl p-3 shadow-xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 font-mono font-bold text-lg">
            TK
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-wide">
                Tanque Industrial 5m × 5m × 4m
              </h1>
              <span data-versao className="text-[10px] font-mono text-slate-400">
                v{VERSAO}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                100 m³ (100.000 L)
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-300 border border-slate-600/70 flex items-center gap-1 shadow-sm">
                <span className="text-slate-400">Desenvolvedor:</span>
                <strong className="text-sky-400 font-semibold">Gilson Bolivar</strong>
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
              <span>Agitador Mecânico Central</span>
              <span className="text-slate-600">•</span>
              <span className="text-sky-400/90">Prevenção de Decantação</span>
            </p>
          </div>
        </div>

        {/* Center/Right: Live SCADA Telemetry & Status */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {/* Main Status Pill */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold shadow-md ${statusColor}`}
          >
            {statusIcon}
            <span className="tracking-wide">{statusText}</span>
          </div>

          {/* Quick Telemetry Chips */}
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 rounded-xl px-3 py-1.5 shadow-xl text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300 pr-2 border-r border-slate-700">
              <RotateCw className="w-3.5 h-3.5 text-sky-400" />
              <span>{physics.currentRPM}</span>
              <span className="text-slate-500 text-[10px]">RPM</span>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300 pr-2 border-r border-slate-700">
              <Waves className="w-3.5 h-3.5 text-emerald-400" />
              <span>{physics.suspensionPercentage}%</span>
              <span className="text-slate-500 text-[10px]">SUSPENSO</span>
            </div>

            <div className="flex items-center gap-1 text-slate-300 pr-2 border-r border-slate-700">
              <span className="text-slate-400">Leito:</span>
              <span className={physics.sludgeBedHeightCm > 2 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                {physics.sludgeBedHeightCm}
              </span>
              <span className="text-slate-500 text-[10px]">cm</span>
            </div>

            <div className="flex items-center gap-1 text-slate-300">
              <span className="text-slate-400">Vol:</span>
              <span>{liquidVolume}</span>
              <span className="text-slate-500 text-[10px]">m³</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md border border-slate-700/70 rounded-xl p-1 shadow-xl">
            {onOpenTelemetry && (
              <button
                onClick={onOpenTelemetry}
                title="Ver Gráficos de Torque & Potência (Últimos 60s)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-sky-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
              >
                <TrendingUp className="w-4 h-4 text-sky-400" />
                <span className="hidden sm:inline">Gráficos (60s)</span>
              </button>
            )}

            <button
              onClick={onToggleSound}
              title={state.soundEnabled ? 'Silenciar Áudio' : 'Ativar Áudio Industrial'}
              className={`p-2 rounded-lg transition-colors ${
                state.soundEnabled
                  ? 'bg-sky-500/20 text-sky-400 hover:bg-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {state.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onOpenInfo}
              title="Guia Técnico & Fórmulas de Decantação"
              className="p-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            <a
              href={CODIGO_URL}
              target="_blank"
              rel="noopener"
              title="Ver o código-fonte do projeto no GitHub"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Código</span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};
