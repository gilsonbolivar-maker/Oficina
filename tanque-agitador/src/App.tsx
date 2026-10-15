/**
 * App: Main Orchestrator for the 5x5x4m Industrial Tank & Agitator 3D Simulation
 * Integrated with Recharts historical trend tracking for torque & power over 60 seconds.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { industrialAudio } from './audio/industrialAudio';
import { BottomDock, TabType } from './components/BottomDock';
import { InfoModal } from './components/InfoModal';
import { TelemetryDataPoint } from './components/TelemetryChart';
import { TopBar } from './components/TopBar';
import { CameraPreset, ScenePhysicsUpdate, TankScene } from './three/TankScene';
import {
  calculateAgitationPhysics,
  INITIAL_SIMULATION_STATE,
  TankSimulationState,
} from './types/simulation';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<TankScene | null>(null);

  const [state, setState] = useState<TankSimulationState>(INITIAL_SIMULATION_STATE);
  const [physics, setPhysics] = useState<ScenePhysicsUpdate>({
    suspensionPercentage: INITIAL_SIMULATION_STATE.suspensionPercentage,
    decantedPercentage: INITIAL_SIMULATION_STATE.decantedPercentage,
    sludgeBedHeightCm: INITIAL_SIMULATION_STATE.sludgeBedHeightCm,
    isFullySuspended: INITIAL_SIMULATION_STATE.isFullySuspended,
    reynoldsNumber: INITIAL_SIMULATION_STATE.reynoldsNumber,
    powerConsumptionKw: INITIAL_SIMULATION_STATE.powerConsumptionKw,
    agitatorTorqueNm: INITIAL_SIMULATION_STATE.agitatorTorqueNm,
    zwieteringSpeedRpm: INITIAL_SIMULATION_STATE.zwieteringSpeedRpm,
    stokesSettlingVelocityMmPerSec: INITIAL_SIMULATION_STATE.stokesSettlingVelocityMmPerSec,
    currentRPM: INITIAL_SIMULATION_STATE.agitatorRPM,
  });

  const physicsRef = useRef(physics);
  useEffect(() => {
    physicsRef.current = physics;
  }, [physics]);

  const [activeTab, setActiveTab] = useState<TabType>('agitator');
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // Initialize 60 seconds of baseline historical telemetry data
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryDataPoint[]>(() => {
    const points: TelemetryDataPoint[] = [];
    const basePower = INITIAL_SIMULATION_STATE.powerConsumptionKw;
    const baseTorque = INITIAL_SIMULATION_STATE.agitatorTorqueNm;
    const baseRpm = INITIAL_SIMULATION_STATE.agitatorRPM;
    const baseSusp = INITIAL_SIMULATION_STATE.suspensionPercentage;

    for (let i = 59; i >= 0; i--) {
      const secondLabel = i === 0 ? 'Agora' : `-${i}s`;
      // Subtle realistic noise for historical curve
      const noise = Math.sin(i * 0.35) * 0.04;
      points.push({
        time: secondLabel,
        second: -i,
        powerKw: Number((basePower * (1 + noise)).toFixed(2)),
        torqueNm: Math.round(baseTorque * (1 + noise)),
        rpm: Math.round(baseRpm * (1 + noise * 0.5)),
        suspensionPct: Math.round(baseSusp),
      });
    }
    return points;
  });

  // Sample historical telemetry once per second for the last 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetryHistory((prev) => {
        const nextSlice = prev.slice(1);
        const updated = nextSlice.map((pt, idx) => {
          const secAgo = 59 - idx;
          return {
            ...pt,
            time: secAgo === 0 ? 'Agora' : `-${secAgo}s`,
            second: -secAgo,
          };
        });

        updated.push({
          time: 'Agora',
          second: 0,
          powerKw: physicsRef.current.powerConsumptionKw,
          torqueNm: physicsRef.current.agitatorTorqueNm,
          rpm: physicsRef.current.currentRPM,
          suspensionPct: physicsRef.current.suspensionPercentage,
        });

        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Initialize Three.js Scene once on mount
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const handlePhysicsUpdate = (update: ScenePhysicsUpdate) => {
      setPhysics(update);
      // Sync procedural Web Audio with RPM
      industrialAudio.updateRPM(update.currentRPM);
    };

    const scene = new TankScene(
      canvasMountRef.current,
      INITIAL_SIMULATION_STATE,
      handlePhysicsUpdate
    );
    sceneRef.current = scene;

    return () => {
      industrialAudio.dispose();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Update Three.js scene when state changes
  const handleUpdateState = useCallback((newState: Partial<TankSimulationState>) => {
    setState((prev) => {
      const merged = { ...prev, ...newState };
      if (sceneRef.current) {
        sceneRef.current.updateState(merged);
      }
      return merged;
    });
  }, []);

  // Audio mute/unmute toggle
  const handleToggleSound = useCallback(() => {
    setState((prev) => {
      const nextSound = !prev.soundEnabled;
      industrialAudio.setEnabled(nextSound);
      industrialAudio.setVolume(prev.soundVolume);
      return { ...prev, soundEnabled: nextSound };
    });
  }, []);

  const handleToggleAgitator = useCallback(() => {
    setState((prev) => {
      const nextActive = !prev.agitatorActive;
      const targetRPM = nextActive ? (prev.targetRPM > 0 ? prev.targetRPM : INITIAL_SIMULATION_STATE.targetRPM) : 0;
      const updated = { ...prev, agitatorActive: nextActive, targetRPM };
      if (sceneRef.current) {
        sceneRef.current.updateState(updated);
      }
      return updated;
    });
  }, []);

  const handleSetCameraPreset = useCallback((preset: CameraPreset) => {
    if (sceneRef.current) {
      sceneRef.current.setCameraPreset(preset);
    }
  }, []);

  const handleResetToSettled = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.resetToSettled();
    }
  }, []);

  const handleFlashMix = useCallback(() => {
    if (sceneRef.current) {
      sceneRef.current.flashMix();
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. Isolated 3D WebGL Canvas Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing z-0"
      />

      {/* 2. Top SCADA Bar */}
      <TopBar
        state={state}
        physics={physics}
        onToggleSound={handleToggleSound}
        onOpenInfo={() => setIsInfoOpen(true)}
        onToggleAgitator={handleToggleAgitator}
        onOpenTelemetry={() => setActiveTab('telemetry')}
      />

      {/* 3. Bottom Control Dock with Telemetry Tab */}
      <BottomDock
        state={{ ...state, zwieteringSpeedRpm: physics.zwieteringSpeedRpm }}
        telemetryData={telemetryHistory}
        activeTabOverride={activeTab}
        onTabChange={setActiveTab}
        onUpdateState={handleUpdateState}
        onSetCameraPreset={handleSetCameraPreset}
        onResetToSettled={handleResetToSettled}
        onFlashMix={handleFlashMix}
      />

      {/* 4. Technical Information Modal */}
      <InfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} />
    </div>
  );
}
