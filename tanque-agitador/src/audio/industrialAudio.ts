/**
 * Procedural Industrial Sound Synthesizer using Web Audio API
 * Generates electric motor hum, gear mesh hum, and fluid turbulence/sloshing sounds.
 * Zero external audio assets (100% code-generated).
 */

class IndustrialAudioEngine {
  private ctx: AudioContext | null = null;
  private isRunning = false;
  private masterGain: GainNode | null = null;
  
  // Motor synthesis nodes
  private motorOsc1: OscillatorNode | null = null;
  private motorOsc2: OscillatorNode | null = null;
  private motorSubOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;

  // Fluid churning noise nodes
  private fluidNoiseNode: AudioBufferSourceNode | null = null;
  private fluidFilter: BiquadFilterNode | null = null;
  private fluidGain: GainNode | null = null;

  private targetRPM = 0;
  private currentRPM = 0;
  private volume = 0.3;
  private enabled = false;

  private initContext() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    this.ctx = new AudioContextClass();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Motor fundamental & harmonic tones
    this.motorOsc1 = this.ctx.createOscillator();
    this.motorOsc1.type = 'sawtooth';
    
    this.motorOsc2 = this.ctx.createOscillator();
    this.motorOsc2.type = 'triangle';

    this.motorSubOsc = this.ctx.createOscillator();
    this.motorSubOsc.type = 'sine';

    this.motorFilter = this.ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
    this.motorFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

    this.motorOsc1.connect(this.motorFilter);
    this.motorOsc2.connect(this.motorFilter);
    this.motorSubOsc.connect(this.motorFilter);
    this.motorFilter.connect(this.motorGain);
    this.motorGain.connect(this.masterGain);

    this.motorOsc1.start();
    this.motorOsc2.start();
    this.motorSubOsc.start();

    // Create 3 seconds of looping pink/brownish noise for fluid swirling
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brown noise integration
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }

    this.fluidNoiseNode = this.ctx.createBufferSource();
    this.fluidNoiseNode.buffer = noiseBuffer;
    this.fluidNoiseNode.loop = true;

    this.fluidFilter = this.ctx.createBiquadFilter();
    this.fluidFilter.type = 'bandpass';
    this.fluidFilter.frequency.setValueAtTime(350, this.ctx.currentTime);
    this.fluidFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    this.fluidGain = this.ctx.createGain();
    this.fluidGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

    this.fluidNoiseNode.connect(this.fluidFilter);
    this.fluidFilter.connect(this.fluidGain);
    this.fluidGain.connect(this.masterGain);

    this.fluidNoiseNode.start();
    this.isRunning = true;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled && !this.ctx) {
      this.initContext();
    }
    if (this.ctx && this.ctx.state === 'suspended' && enabled) {
      this.ctx.resume();
    }
    this.updateGain();
  }

  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.updateGain();
  }

  public updateRPM(rpm: number) {
    this.targetRPM = rpm;
    if (!this.ctx || !this.isRunning) return;

    // Smooth RPM interpolation
    this.currentRPM += (this.targetRPM - this.currentRPM) * 0.1;
    const now = this.ctx.currentTime;

    if (this.currentRPM > 1) {
      // Motor electrical line frequency & gearbox mesh tone
      // Base frequency proportional to 50Hz/60Hz scaled by motor speed
      const motorBaseFreq = 25 + (this.currentRPM / 180) * 95;
      this.motorOsc1?.frequency.setTargetAtTime(motorBaseFreq, now, 0.05);
      this.motorOsc2?.frequency.setTargetAtTime(motorBaseFreq * 2.01, now, 0.05);
      this.motorSubOsc?.frequency.setTargetAtTime(motorBaseFreq * 0.5, now, 0.05);
      
      this.motorFilter?.frequency.setTargetAtTime(140 + motorBaseFreq * 2.5, now, 0.05);
      
      // Fluid turbulence filter frequency shifts with RPM
      const fluidFreq = 200 + (this.currentRPM / 180) * 450;
      this.fluidFilter?.frequency.setTargetAtTime(fluidFreq, now, 0.1);
      
      const motorIntensity = Math.min(0.22, (this.currentRPM / 180) * 0.22);
      const fluidIntensity = Math.min(0.28, (this.currentRPM / 180) * 0.28);
      
      this.motorGain?.gain.setTargetAtTime(motorIntensity, now, 0.1);
      this.fluidGain?.gain.setTargetAtTime(fluidIntensity, now, 0.1);
    } else {
      this.motorGain?.gain.setTargetAtTime(0, now, 0.2);
      this.fluidGain?.gain.setTargetAtTime(0, now, 0.2);
    }
  }

  private updateGain() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const effectiveGain = this.enabled ? this.volume * 0.5 : 0;
    this.masterGain.gain.setTargetAtTime(effectiveGain, now, 0.08);
  }

  public dispose() {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.isRunning = false;
    }
  }
}

export const industrialAudio = new IndustrialAudioEngine();
