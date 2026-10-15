/**
 * TelemetryChart: Recharts historical line chart component
 * Displays torque (N·m) and power consumption (kW) over the last 60 seconds of simulation.
 */

import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Gauge, Zap } from 'lucide-react';

export interface TelemetryDataPoint {
  time: string;
  second: number;
  powerKw: number;
  torqueNm: number;
  rpm: number;
  suspensionPct: number;
}

interface TelemetryChartProps {
  data: TelemetryDataPoint[];
  currentPowerKw: number;
  currentTorqueNm: number;
  currentRpm: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-xl backdrop-blur-md text-xs font-mono">
        <div className="text-slate-400 font-semibold mb-2 border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
          <span>Tempo: {label}</span>
          <span className="text-[10px] text-slate-500">Janela 60s</span>
        </div>
        <div className="space-y-1.5">
          {payload.map((item) => (
            <div key={item.dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: item.color }}>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}:
              </span>
              <span className="text-slate-100 font-bold">
                {item.dataKey === 'powerKw'
                  ? `${item.value.toFixed(2)} kW`
                  : item.dataKey === 'torqueNm'
                  ? `${Math.round(item.value)} N·m`
                  : `${item.value}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  data,
  currentPowerKw,
  currentTorqueNm,
  currentRpm,
}) => {
  // Calculate rolling statistics
  const avgPower =
    data.length > 0
      ? (data.reduce((acc, curr) => acc + curr.powerKw, 0) / data.length).toFixed(2)
      : '0.00';

  const maxTorque =
    data.length > 0 ? Math.round(Math.max(...data.map((d) => d.torqueNm))) : 0;

  const maxPower =
    data.length > 0 ? Math.max(...data.map((d) => d.powerKw)).toFixed(2) : '0.00';

  return (
    <div className="space-y-3">
      {/* Real-time Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 text-sky-400 text-[11px] font-semibold mb-1">
            <Zap className="w-3.5 h-3.5" />
            <span>Potência Instantânea</span>
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-100">
            {currentPowerKw.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">kW</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Média 60s: <span className="text-slate-300">{avgPower} kW</span>
          </div>
        </div>

        <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-semibold mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span>Torque Instantâneo</span>
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-100">
            {Math.round(currentTorqueNm)}{' '}
            <span className="text-xs font-normal text-slate-400">N·m</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Pico 60s: <span className="text-slate-300">{maxTorque} N·m</span>
          </div>
        </div>

        <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold mb-1">
            <Gauge className="w-3.5 h-3.5" />
            <span>Rotação do Eixo</span>
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-100">
            {currentRpm} <span className="text-xs font-normal text-slate-400">RPM</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Potência Máx: <span className="text-slate-300">{maxPower} kW</span>
          </div>
        </div>

        <div className="bg-slate-800/70 border border-slate-700/60 rounded-xl p-2.5">
          <div className="flex items-center gap-1.5 text-indigo-400 text-[11px] font-semibold mb-1">
            <Activity className="w-3.5 h-3.5" />
            <span>Janela Temporal</span>
          </div>
          <div className="text-base sm:text-lg font-mono font-bold text-slate-100">
            60 <span className="text-xs font-normal text-slate-400">segundos</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
            Amostragem: <span className="text-slate-300">1 ponto / seg</span>
          </div>
        </div>
      </div>

      {/* Main Recharts Line Chart */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 pt-4">
        <div className="flex items-center justify-between mb-2 px-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">
              Histórico de Potência & Torque (Últimos 60s)
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-sky-400">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" />
              <span>Potência (kW)</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
              <span>Torque (N·m)</span>
            </div>
          </div>
        </div>

        <div className="w-full h-56 sm:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={9}
              />
              {/* Left Y Axis: Power (kW) */}
              <YAxis
                yAxisId="left"
                stroke="#38bdf8"
                tick={{ fontSize: 10, fill: '#38bdf8' }}
                domain={[0, 'auto']}
                unit=" kW"
              />
              {/* Right Y Axis: Torque (N·m) */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f59e0b"
                tick={{ fontSize: 10, fill: '#f59e0b' }}
                domain={[0, 'auto']}
                unit=" Nm"
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="powerKw"
                name="Potência Consumida"
                stroke="#38bdf8"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="torqueNm"
                name="Torque no Eixo"
                stroke="#f59e0b"
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
