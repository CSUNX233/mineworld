import { AUDIO_ASSETS } from './AudioAssets';
import { SOUND_CUES, CHAPTER_MUSIC, CHAPTER_AMBIENCE, type SoundEvent } from './AudioEvents';

type Point = { x: number; z: number };
interface Voice { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode | null; event: SoundEvent; priority: number; }
interface Stream { id: string; media: HTMLAudioElement; node: MediaElementAudioSourceNode; gain: GainNode; retiring: boolean; timer?: ReturnType<typeof setTimeout>; }
interface AudibleMonster { id: number; dead: boolean; state: string; health: number; maxHealth: number; position: Point; roomId: string; def: { id: string; behavior: string }; }

/** Recorded audio only. Bounded short voices and decoded cache; long tracks stream. */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private ambience: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private decodedBytes = 0;
  private loading = 0;
  private queue: Array<() => void> = [];
  private voices: Voice[] = [];
  private streams: Stream[] = [];
  private ambientStreams: Stream[] = [];
  private last = new Map<string, number>();
  private variants = new Map<string, number>();
  private listener: Point = { x: 0, z: 0 };
  private yaw = 0;
  private chapter = 0;
  private desiredMusic = 'c0dd7e6a6';
  private ambientIds: string[] = [];
  private bgmToken = 0;
  private floorMode = false;
  private walking = false;
  private walkTime = 0;
  private scanTime = 0;
  private states = new Map<number, string>();
  private phases = new Map<number, number>();
  private muted = false;
  private paused = false;
  private sfxVolume = .8;
  private musicVolume = .8;

  constructor() {
    try { const s = JSON.parse(localStorage.getItem('mineworld-audio-v1') ?? '{}'); this.sfxVolume = this.clamp(s.sfx ?? .8); this.musicVolume = this.clamp(s.music ?? .8); this.muted = s.muted === true; } catch { /* optional preferences */ }
    document.addEventListener('pointerdown', () => this.ensure(), { passive: true });
    document.addEventListener('keydown', () => this.ensure(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.stopVoices(); this.walking = false; this.allStreams().forEach(s => s.media.pause()); void this.ctx?.suspend().catch(() => {}); }
      else if (this.ctx) this.ensure();
    });
    window.addEventListener('pagehide', () => { this.stopVoices(); this.allStreams().forEach(s => s.media.pause()); });
    window.addEventListener('pageshow', () => { if (this.ctx) this.ensure(); });
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button,[role="button"]') : null;
      if (!target || target.closest('.touch-controls') || target.matches(':disabled,[aria-disabled="true"]')) return;
      this.play(/关闭|返回|取消/.test(target.textContent ?? '') ? 'uiBack' : 'uiClick');
    });
  }

  private clamp(v: number): number { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : .8; }
  private save(): void { try { localStorage.setItem('mineworld-audio-v1', JSON.stringify({ sfx: this.sfxVolume, music: this.musicVolume, muted: this.muted })); } catch { /* game saves are independent */ } }
  private blockedByPause(event: SoundEvent): boolean {
    return this.paused && !['uiClick','uiConfirm','uiBack','uiError','equip','unequip','forge','coin','pickup','material','heal','potion','levelUp'].includes(event);
  }
  ensure(): void {
    if (document.hidden) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : .85;
      const limiter = this.ctx.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .15;
      this.master.connect(limiter); limiter.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.gain.value = this.sfxVolume; this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.gain.value = this.musicVolume; this.music.connect(this.master);
      this.ambience = this.ctx.createGain(); this.ambience.gain.value = this.sfxVolume * .55; this.ambience.connect(this.master);
      void this.preload(['swing','hit','hurt','shieldBreak','coin','pickup','uiClick','uiConfirm','uiError','walk']);
      this.startBGM(this.desiredMusic);
      this.launchAmbience();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
    this.allStreams().forEach(s => { if (!s.retiring && s.media.paused) void s.media.play().catch(() => {}); });
  }
  setVolume(v: number): void { this.setSfxVolume(v); }
  setSfxVolume(v: number): void { this.sfxVolume = this.clamp(v); this.sfx?.gain.setTargetAtTime(this.sfxVolume, this.ctx!.currentTime, .03); this.ambience?.gain.setTargetAtTime(this.sfxVolume * .55, this.ctx!.currentTime, .03); this.save(); }
  setMusicVolume(v: number): void { this.musicVolume = this.clamp(v); this.music?.gain.setTargetAtTime(this.musicVolume, this.ctx!.currentTime, .03); this.save(); }
  toggleMute(): boolean { this.muted = !this.muted; this.master?.gain.setTargetAtTime(this.muted ? 0 : .85, this.ctx!.currentTime, .03); this.save(); return this.muted; }
  get isMuted(): boolean { return this.muted; }
  get currentVolume(): number { return this.sfxVolume; }
  get currentMusicVolume(): number { return this.musicVolume; }

  private async load(id: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(id); if (hit) { this.buffers.delete(id); this.buffers.set(id, hit); return hit; }
    if (!this.ctx || !AUDIO_ASSETS[id]) return null;
    const existing = this.pending.get(id); if (existing) return existing;
    const task = (async () => {
      if (this.loading >= 3) await new Promise<void>(resolve => this.queue.push(resolve)); else this.loading++;
      const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 12000);
      try {
        const response = await fetch(import.meta.env.BASE_URL + AUDIO_ASSETS[id], { signal: abort.signal });
        if (!response.ok) return null;
        const buffer = await this.ctx!.decodeAudioData(await response.arrayBuffer());
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        while (this.decodedBytes + bytes > 24 * 1024 * 1024 && this.buffers.size) {
          const oldest = this.buffers.keys().next().value!; const b = this.buffers.get(oldest)!;
          this.decodedBytes -= b.length * b.numberOfChannels * 4; this.buffers.delete(oldest);
        }
        if (bytes <= 24 * 1024 * 1024) { this.buffers.set(id, buffer); this.decodedBytes += bytes; }
        return buffer;
      } catch { return null; }
      finally { clearTimeout(timer); const next = this.queue.shift(); if (next) next(); else this.loading--; }
    })();
    this.pending.set(id, task);
    try { return await task; } finally { this.pending.delete(id); }
  }
  async preload(events: SoundEvent[]): Promise<void> { if (!this.ctx) return; await Promise.all([...new Set(events.flatMap(e => SOUND_CUES[e].clips))].map(id => this.load(id))); }

  play(event: SoundEvent, point?: Point, scale = 1): void {
    this.ensure(); if (!this.ctx || !this.sfx || this.muted || document.hidden || this.blockedByPause(event)) return;
    const cue = SOUND_CUES[event], now = performance.now();
    const distance = point ? Math.hypot(point.x - this.listener.x, point.z - this.listener.z) : 0;
    if (distance > 20 || now - (this.last.get(event) ?? -Infinity) < cue.interval) return;
    if (this.voices.filter(v => v.event === event).length >= cue.max) return;
    this.last.set(event, now);
    let variant = Math.floor(Math.random() * cue.clips.length);
    if (cue.clips.length > 1 && variant === this.variants.get(event)) variant = (variant + 1) % cue.clips.length;
    this.variants.set(event, variant);
    const id = cue.clips[variant]; const epoch = this.bgmToken;
    void this.load(id).then(buffer => {
      // Discard stale events after download, scene changes, or returning from background.
      if (!buffer || !this.ctx || !this.sfx || epoch !== this.bgmToken || document.hidden || this.muted || this.blockedByPause(event) || performance.now() - now > (cue.priority >= 7 ? 1000 : 220)) return;
      if (this.voices.filter(v => v.event === event).length >= cue.max) return;
      if (this.voices.length >= 18) {
        const lowest = this.voices.reduce((a, b) => a.priority <= b.priority ? a : b);
        if (lowest.priority >= cue.priority) return;
        this.stopVoice(lowest);
      }
      const source = this.ctx.createBufferSource(); source.buffer = buffer;
      source.playbackRate.value = cue.priority >= 6 || event.startsWith('ui') ? 1 : .97 + Math.random() * .06;
      const gain = this.ctx.createGain(); gain.gain.value = cue.volume * scale / (1 + distance * distance * .035);
      const pan = point && this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      source.connect(gain);
      if (pan && point) { pan.pan.value = Math.max(-.8, Math.min(.8, ((point.x-this.listener.x)*Math.cos(this.yaw)-(point.z-this.listener.z)*Math.sin(this.yaw))/10)); gain.connect(pan); pan.connect(this.sfx); } else gain.connect(this.sfx);
      const voice: Voice = { source, gain, pan, event, priority: cue.priority }; this.voices.push(voice);
      source.onended = () => this.cleanVoice(voice); source.start();
      const duration = Math.min(buffer.duration / source.playbackRate.value, event === 'dropRed' ? 5 : event === 'boss' ? 4 : 2.5);
      gain.gain.setTargetAtTime(0, this.ctx.currentTime + Math.max(0, duration - .04), .012);
      source.stop(this.ctx.currentTime + duration);
      if (event === 'dropRed' || event === 'shieldBreak') this.duck();
    });
  }
  private cleanVoice(v: Voice): void { const index = this.voices.indexOf(v); if (index >= 0) this.voices.splice(index, 1); v.source.disconnect(); v.gain.disconnect(); v.pan?.disconnect(); }
  private stopVoice(v: Voice): void { try { v.source.stop(); } catch { /* ended */ } this.cleanVoice(v); }
  private stopVoices(): void { [...this.voices].forEach(v => this.stopVoice(v)); }
  private duck(): void { if (!this.music || !this.ctx) return; const g = this.music.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(this.musicVolume * .55, t, .025); g.setTargetAtTime(this.musicVolume, t + .7, .25); }

  private allStreams(): Stream[] { return [...this.streams, ...this.ambientStreams]; }
  private stream(id: string, output: AudioNode, volume: number): Stream | null {
    if (!this.ctx || !AUDIO_ASSETS[id]) return null;
    const media = new Audio(import.meta.env.BASE_URL + AUDIO_ASSETS[id]); media.loop = true; media.preload = 'metadata';
    const node = this.ctx.createMediaElementSource(media), gain = this.ctx.createGain(); gain.gain.value = 0; node.connect(gain); gain.connect(output);
    const s: Stream = { id, media, node, gain, retiring: false };
    media.addEventListener('playing', () => { if (!s.retiring && this.ctx) gain.gain.setTargetAtTime(volume, this.ctx.currentTime, .4); });
    void media.play().catch(() => {}); return s;
  }
  private retire(s: Stream, immediate = false): void {
    s.retiring = true; if (s.timer) clearTimeout(s.timer);
    const close = () => { s.media.pause(); s.media.removeAttribute('src'); s.media.load(); s.node.disconnect(); s.gain.disconnect(); this.streams = this.streams.filter(v => v !== s); this.ambientStreams = this.ambientStreams.filter(v => v !== s); };
    if (immediate || !this.ctx) close(); else { s.gain.gain.setTargetAtTime(0, this.ctx.currentTime, .25); s.timer = setTimeout(close, 1000); }
  }
  startBGM(id: string): void {
    if (!AUDIO_ASSETS[id]) id = CHAPTER_MUSIC[this.chapter];
    this.desiredMusic = id;
    if (!this.ctx || !this.music || this.streams.some(s => s.id === id && !s.retiring)) return;
    this.streams.filter(s => s.retiring).forEach(s => this.retire(s, true));
    this.streams.forEach(s => this.retire(s));
    const s = this.stream(id, this.music, 1); if (s) this.streams.push(s);
  }
  stopBGM(): void { this.bgmToken++; this.streams.slice().forEach(s => this.retire(s, true)); }
  startAmbient(_theme: string): void { this.ambientIds = CHAPTER_AMBIENCE[this.chapter]; this.launchAmbience(); }
  private launchAmbience(): void {
    if (!this.ctx || !this.ambience || !this.ambientIds.length) return;
    if (this.ambientStreams.map(s => s.id).join() === this.ambientIds.join()) return;
    this.stopAmbient();
    this.ambientIds.forEach((id, i) => { const s = this.stream(id, this.ambience!, i === 0 ? .6 : .25); if (s) this.ambientStreams.push(s); });
  }
  stopAmbient(): void { this.ambientStreams.slice().forEach(s => this.retire(s, true)); }
  setFloor(floor: number): void { this.chapter = Math.min(4, Math.max(0, Math.floor((floor-1)/5))); this.floorMode = true; this.paused = false; this.bgmToken++; this.stopVoices(); this.states.clear(); this.phases.clear(); this.startBGM(CHAPTER_MUSIC[this.chapter]); this.startAmbient(''); void this.preload(['fire','frost','lightning','soul','earth','dropRed','dropRare','boss','slime','undead','demon','beast']); }
  menu(kind: 'menu' | 'camp' | 'victory' | 'death'): void { this.floorMode = false; this.paused = false; this.bgmToken++; this.stopWalk(); this.stopVoices(); this.ambientIds = []; this.stopAmbient(); this.startBGM(kind === 'camp' || kind === 'death' ? 'ee654417d' : 'c0dd7e6a6'); }
  setPaused(value: boolean): void { if (this.paused === value) return; this.paused = value; if (value) { this.stopVoices(); this.stopWalk(); } }
  update(dt: number, position: Point, yaw: number, monsters: AudibleMonster[], locked: readonly string[]): void {
    this.listener = position; this.yaw = yaw;
    if (this.walking && !this.paused) { this.walkTime -= dt; if (this.walkTime <= 0) { this.play('walk'); this.walkTime = .36; } }
    this.scanTime -= dt; if (this.scanTime > 0 || this.paused || !this.floorMode) return; this.scanTime = .2;
    let boss = false; const live = new Set<number>();
    for (const m of monsters) {
      if (m.dead) continue; live.add(m.id);
      const near = Math.hypot(m.position.x-position.x,m.position.z-position.z) < 16;
      if (m.def.behavior === 'boss' && locked.includes(m.roomId)) {
        boss = true; const phase = m.health / m.maxHealth > .66 ? 0 : m.health / m.maxHealth > .33 ? 1 : 2;
        if (this.phases.get(m.id) !== phase) { this.play('boss', m.position); this.phases.set(m.id, phase); }
      }
      if (near && m.state === 'attack' && this.states.get(m.id) !== 'attack') this.monster(m, 'attack');
      if (near && locked.includes(m.roomId) && m.id % 7 === 0) this.play('breath', m.position);
      this.states.set(m.id, m.state);
    }
    for (const id of this.states.keys()) if (!live.has(id)) { this.states.delete(id); this.phases.delete(id); }
    this.startBGM(boss ? '8053957da' : CHAPTER_MUSIC[this.chapter]);
  }
  monster(m: AudibleMonster, kind: 'attack' | 'death'): void {
    const id = m.def.id; const family: SoundEvent = m.def.behavior === 'boss' ? 'boss' : /slime|spit/.test(id) ? 'slime' : /zombie|skeleton|mourner|burial|grave|bell/.test(id) ? 'undead' : /shadow|void|abyss|ghost|lich/.test(id) ? 'demon' : 'beast';
    this.play(family, m.position, kind === 'death' ? .85 : .7);
  }
  skill(id: string): void { const e: SoundEvent = id === 'guard_counter' ? 'guard' : id === 'seismic_slam' ? 'earth' : /company|soul/.test(id) ? 'soul' : id === 'frost_nova' ? 'frost' : id === 'lightning_chain' ? 'lightning' : /fire|flame|ember|detonate/.test(id) ? 'fire' : 'swing'; this.play(e); }
  projectile(element: string, point: Point): void { this.play(element === 'fire' ? 'fireHit' : element === 'frost' ? 'frost' : element === 'lightning' ? 'lightning' : element === 'shadow' ? 'soul' : 'earth', point, .6); }
  hit(crit = false, element = 'physical', point?: Point): void { const e: SoundEvent = element === 'fire' ? 'fireHit' : element === 'frost' ? 'frost' : element === 'lightning' ? 'lightning' : element === 'shadow' ? 'soul' : 'hit'; this.play(e, point, crit ? 1.15 : 1); if (point) this.play('enemyHurt', point); }
  private dropTimer: ReturnType<typeof setTimeout> | null = null;
  private dropTier = -1;
  lootDrop(rarity: string): void {
    const tier = ['common','magic','rare','epic','legendary','mythic'].indexOf(rarity); this.dropTier = Math.max(this.dropTier, tier);
    if (this.dropTimer) return;
    const token = this.bgmToken;
    this.dropTimer = setTimeout(() => { const t = this.dropTier; this.dropTier = -1; this.dropTimer = null; if (token === this.bgmToken) this.play(t >= 4 ? 'dropRed' : t >= 2 ? 'dropRare' : t === 1 ? 'dropBlue' : 'dropLow', undefined, t === 3 ? 1.15 : 1); }, 60);
  }
  swing(): void { this.play('swing'); } kill(): void { this.play('beast'); }
  hurt(): void { this.play('hurt'); } coin(): void { this.play('coin'); }
  pickup(): void { this.play('pickup'); } levelUp(): void { this.play('levelUp'); }
  portal(): void { this.play('portal'); } shoot(): void { this.play('shoot'); }
  explosion(): void { this.play('earth'); } warn(): void { this.play('warn'); }
  uiClick(): void { this.play('uiClick'); } uiConfirm(): void { this.play('uiConfirm'); }
  uiError(): void { this.play('uiError'); } jump(): void { this.play('jump'); }
  startWalk(): void { this.walking = true; } stopWalk(): void { this.walking = false; this.walkTime = 0; }
}
