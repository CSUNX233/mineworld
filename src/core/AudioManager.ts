const AUDIO_BASE = '/audio';

const SFX = {
  swing: `${AUDIO_BASE}/sfx/impact_punch_heavy_000.ogg`,
  hit: `${AUDIO_BASE}/sfx/impact_metal_heavy_000.ogg`,
  kill: `${AUDIO_BASE}/sfx/sci_fi_explosion_crunch_000.ogg`,
  hurt: `${AUDIO_BASE}/sfx/impact_metal_heavy_000.ogg`,
  coin: `${AUDIO_BASE}/sfx/rpg_handle_coins.ogg`,
  pickup: `${AUDIO_BASE}/sfx/interface_confirm_001.ogg`,
  levelUp: `${AUDIO_BASE}/sfx/digital_power_up1.ogg`,
  portal: `${AUDIO_BASE}/sfx/sci_fi_laser_small_000.ogg`,
  shoot: `${AUDIO_BASE}/sfx/sci_fi_laser_small_000.ogg`,
  explosion: `${AUDIO_BASE}/sfx/sci_fi_explosion_crunch_000.ogg`,
  warn: `${AUDIO_BASE}/sfx/interface_error_001.ogg`,
  uiClick: `${AUDIO_BASE}/sfx/interface_click_001.ogg`,
  uiConfirm: `${AUDIO_BASE}/sfx/interface_confirm_001.ogg`,
  uiError: `${AUDIO_BASE}/sfx/interface_error_001.ogg`,
  jump: `${AUDIO_BASE}/jumpvoice.mp3`,
  walk: `${AUDIO_BASE}/walkvoice.wav`,
} as const;

const AMBIENT_BY_THEME: Record<string, { url: string; volume: number; filter: number }> = {
  cave: {
    url: `${AUDIO_BASE}/ambient/space_engine_low_000.ogg`,
    volume: 0.045,
    filter: 420,
  },
  dungeon: {
    url: `${AUDIO_BASE}/ambient/space_engine_000.ogg`,
    volume: 0.035,
    filter: 360,
  },
  lava: {
    url: `${AUDIO_BASE}/ambient/engine_circular_000.ogg`,
    volume: 0.05,
    filter: 300,
  },
  void: {
    url: `${AUDIO_BASE}/ambient/computer_noise_000.ogg`,
    volume: 0.035,
    filter: 650,
  },
};

const MUSIC_BY_THEME: Record<string, string> = {
  cave: `${AUDIO_BASE}/music/purgatory_closed.ogg`,
  dungeon: `${AUDIO_BASE}/music/purgatory_closed.ogg`,
  lava: `${AUDIO_BASE}/music/elevator_to_reactor.mp3`,
  void: `${AUDIO_BASE}/music/elevator_to_reactor.mp3`,
};

interface BufferHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode | null;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientHandles: BufferHandle[] = [];
  private audioBuffers = new Map<string, AudioBuffer>();
  private pendingBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmRequestId = 0;
  private walkSource: AudioBufferSourceNode | null = null;
  private walkGain: GainNode | null = null;
  private walkRequestId = 0;
  private walkActive = false;
  private volume = 0.8;
  private sfxVolume = 0.8;
  private musicVolume = 0.8;
  private muted = false;

  ensure(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) this.ctx = new Ctor();
    }
    if (this.ctx && !this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private output(): AudioNode | null {
    this.ensure();
    return this.sfxGain ?? this.masterGain ?? this.ctx?.destination ?? null;
  }

  private musicOutput(): AudioNode | null {
    this.ensure();
    return this.musicGain ?? this.masterGain ?? this.ctx?.destination ?? null;
  }

  setVolume(volume: number): void {
    this.setSfxVolume(volume);
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx?.currentTime ?? 0, 0.03);
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx?.currentTime ?? 0, 0.03);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx?.currentTime ?? 0, 0.03);
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get currentVolume(): number {
    return this.sfxVolume;
  }

  get currentMusicVolume(): number {
    return this.musicVolume;
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, slideTo?: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    const output = this.output();
    if (!output) return;
    gain.connect(output);
    osc.connect(gain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private noise(duration: number, volume: number, filterFreq = 1200): void {
    if (!this.ctx) return;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    const output = this.output();
    if (!output) return;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start();
  }

  private async fetchAudio(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    const cached = this.audioBuffers.get(url);
    if (cached) return cached;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(url, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  private loadAudio(url: string): Promise<AudioBuffer | null> {
    const cached = this.audioBuffers.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.pendingBuffers.get(url);
    if (pending) return pending;
    const promise = this.fetchAudio(url);
    this.pendingBuffers.set(url, promise);
    void promise.finally(() => {
      if (this.pendingBuffers.get(url) === promise) this.pendingBuffers.delete(url);
    });
    return promise;
  }

  private playBuffer(buffer: AudioBuffer, volume: number, filterFrequency: number, loop: boolean, useMusic = false): BufferHandle | null {
    if (!this.ctx) return null;
    const output = useMusic ? this.musicOutput() : this.output();
    if (!output) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;

    let filter: BiquadFilterNode | null = null;
    let entry: AudioNode = source;
    if (filterFrequency > 0) {
      filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFrequency;
      source.connect(filter);
      entry = filter;
    }

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    entry.connect(gain);
    gain.connect(output);
    source.start();
    return { source, gain, filter };
  }

  private playSample(url: string, volume: number, filterFrequency = 0): boolean {
    const buffer = this.audioBuffers.get(url);
    if (!buffer) {
      void this.loadAudio(url);
      return false;
    }
    this.playBuffer(buffer, volume, filterFrequency, false);
    return true;
  }

  swing(): void {
    this.ensure();
    if (!this.playSample(SFX.swing, 0.18, 1600)) this.noise(0.1, 0.08, 1800);
  }

  hit(crit = false): void {
    this.ensure();
    if (crit) {
      if (!this.playSample(SFX.hit, 0.24, 2600)) {
        this.tone(180, 0.18, 'square', 0.18, 60);
        this.noise(0.14, 0.14, 2600);
      }
    } else if (!this.playSample(SFX.hit, 0.15, 1500)) {
      this.noise(0.09, 0.1, 1500);
      this.tone(130, 0.1, 'triangle', 0.12, 80);
    }
  }

  kill(): void {
    this.ensure();
    if (!this.playSample(SFX.kill, 0.2, 700)) {
      this.noise(0.24, 0.16, 700);
      this.tone(90, 0.24, 'sawtooth', 0.12, 45);
    }
  }

  hurt(): void {
    this.ensure();
    if (!this.playSample(SFX.hurt, 0.14, 1000)) this.tone(160, 0.22, 'sawtooth', 0.14, 70);
  }

  coin(): void {
    this.ensure();
    if (!this.playSample(SFX.coin, 0.16, 0)) {
      this.tone(880, 0.08, 'sine', 0.1);
      setTimeout(() => this.tone(1320, 0.1, 'sine', 0.08), 45);
    }
  }

  pickup(): void {
    this.ensure();
    if (!this.playSample(SFX.pickup, 0.14, 0)) this.tone(520, 0.12, 'sine', 0.1, 780);
  }

  levelUp(): void {
    this.ensure();
    if (!this.playSample(SFX.levelUp, 0.17, 0)) {
      this.tone(440, 0.14, 'sine', 0.12);
      setTimeout(() => this.tone(660, 0.16, 'sine', 0.12), 90);
      setTimeout(() => this.tone(880, 0.22, 'sine', 0.12), 180);
    }
  }

  portal(): void {
    this.ensure();
    if (!this.playSample(SFX.portal, 0.17, 1800)) {
      this.tone(220, 0.5, 'sine', 0.12, 660);
      this.tone(110, 0.6, 'triangle', 0.08, 440);
    }
  }

  shoot(): void {
    this.ensure();
    if (!this.playSample(SFX.shoot, 0.13, 2600)) this.tone(600, 0.18, 'square', 0.08, 200);
  }

  explosion(): void {
    this.ensure();
    if (!this.playSample(SFX.explosion, 0.22, 500)) {
      this.noise(0.35, 0.22, 500);
      this.tone(70, 0.35, 'sawtooth', 0.16, 30);
    }
  }

  warn(): void {
    this.ensure();
    if (!this.playSample(SFX.warn, 0.17, 1200)) {
      this.tone(720, 0.12, 'square', 0.08, 900);
      setTimeout(() => this.tone(920, 0.16, 'square', 0.08, 1100), 120);
    }
  }

  uiClick(): void {
    this.ensure();
    this.playSample(SFX.uiClick, 0.1, 0);
  }

  uiConfirm(): void {
    this.ensure();
    this.playSample(SFX.uiConfirm, 0.12, 0);
  }

  uiError(): void {
    this.ensure();
    this.playSample(SFX.uiError, 0.13, 0);
  }

  jump(): void {
    this.ensure();
    if (!this.playSample(SFX.jump, 0.22, 0)) this.tone(360, 0.18, 'sine', 0.1, 520);
  }

  startWalk(): void {
    this.ensure();
    if (this.walkSource || this.walkActive) return;
    this.walkActive = true;
    const requestId = ++this.walkRequestId;
    void this.loadAudio(SFX.walk).then((buffer) => {
      if (!buffer || !this.ctx || !this.walkActive || requestId !== this.walkRequestId) return;
      this.stopWalkSource();
      const handle = this.playBuffer(buffer, 0.16, 0, true, false);
      if (handle) {
        this.walkSource = handle.source;
        this.walkGain = handle.gain;
      }
    });
  }

  stopWalk(): void {
    this.walkActive = false;
    this.walkRequestId++;
    this.stopWalkSource();
  }

  private stopWalkSource(): void {
    if (this.walkSource) {
      try {
        this.walkSource.stop();
      } catch {
        // already stopped
      }
      this.walkSource.disconnect();
      this.walkGain?.disconnect();
    }
    this.walkSource = null;
    this.walkGain = null;
  }

  startAmbient(themeId: string): void {
    this.stopAmbient();
    this.ensure();
    if (!this.ctx || !this.masterGain) return;

    const ambient = AMBIENT_BY_THEME[themeId] ?? AMBIENT_BY_THEME.cave;
    void this.launchAmbient(ambient);
  }

  private async launchAmbient(ambient: { url: string; volume: number; filter: number }): Promise<void> {
    const buffer = await this.loadAudio(ambient.url);
    if (!buffer || !this.ctx || !this.masterGain) return;
    const handle = this.playBuffer(buffer, ambient.volume, ambient.filter, true, true);
    if (handle) this.ambientHandles.push(handle);
  }

  stopAmbient(): void {
    this.ambientHandles.forEach((handle) => {
      try {
        handle.source.stop();
      } catch {
        // already stopped
      }
      handle.source.disconnect();
      handle.filter?.disconnect();
      handle.gain.disconnect();
    });
    this.ambientHandles = [];
  }

  startBGM(themeId: string): void {
    const requestId = ++this.bgmRequestId;
    this.stopBGM();
    this.ensure();
    if (!this.ctx) return;

    const url = MUSIC_BY_THEME[themeId] ?? MUSIC_BY_THEME.cave;
    void this.launchBGM(url, requestId);
  }

  private async launchBGM(url: string, requestId: number): Promise<void> {
    const buffer = await this.loadAudio(url);
    if (!buffer || !this.ctx || !this.masterGain || requestId !== this.bgmRequestId) return;
    this.stopBGM();
    const handle = this.playBuffer(buffer, 0.468, 0, true, true);
    if (handle) {
      this.bgmSource = handle.source;
      this.bgmGain = handle.gain;
    }
  }

  stopBGM(): void {
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch {
        // already stopped
      }
      this.bgmSource.disconnect();
      this.bgmGain?.disconnect();
    }
    this.bgmSource = null;
    this.bgmGain = null;
  }
}
