import { AUDIO_SAMPLE_RATE } from "@/lib/interview/protocol";

interface Scheduled {
  src: AudioBufferSourceNode;
  itemId: string;
  start: number;
  end: number;
}

/**
 * Gapless streaming player for PCM16 deltas from the Realtime API. Chunks are scheduled
 * back-to-back on the AudioContext clock. `interrupt()` stops everything instantly and reports
 * how many milliseconds of the current item the candidate actually heard, which the gateway
 * forwards as `conversation.item.truncate` so the model's memory matches what was heard.
 */
export class PcmPlayer {
  readonly analyser: AnalyserNode;
  private out: GainNode;
  private queue: Scheduled[] = [];
  private nextStart = 0;
  private itemStart = new Map<string, number>();
  private playing = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: AudioContext, private readonly onPlayingChange: (playing: boolean) => void) {
    this.out = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.7;
    this.out.connect(this.analyser);
    this.analyser.connect(ctx.destination);
  }

  get isPlaying() {
    return this.playing;
  }

  enqueue(itemId: string, base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
    if (samples.length === 0) return;
    const buffer = this.ctx.createBuffer(1, samples.length, AUDIO_SAMPLE_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) ch[i] = samples[i] / 0x8000;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out);
    // Small lead-in on the first chunk absorbs network jitter.
    const start = Math.max(this.ctx.currentTime + (this.queue.length ? 0 : 0.05), this.nextStart);
    src.start(start);
    const entry: Scheduled = { src, itemId, start, end: start + buffer.duration };
    this.queue.push(entry);
    this.nextStart = entry.end;
    if (!this.itemStart.has(itemId)) this.itemStart.set(itemId, start);

    src.onended = () => {
      this.queue = this.queue.filter((q) => q !== entry);
      if (this.queue.length === 0) this.scheduleIdle();
    };
    this.setPlaying(true);
  }

  /** Stops playback immediately. Returns the interrupted item and the audio ms actually played. */
  interrupt(): { itemId: string; audioEndMs: number } | null {
    const now = this.ctx.currentTime;
    const current = this.queue.find((q) => q.start <= now && q.end > now) ?? this.queue[0];
    let result: { itemId: string; audioEndMs: number } | null = null;
    if (current) {
      const itemStart = this.itemStart.get(current.itemId) ?? current.start;
      result = { itemId: current.itemId, audioEndMs: Math.max(0, (now - itemStart) * 1000) };
    }
    for (const q of this.queue) {
      q.src.onended = null;
      try {
        q.src.stop();
      } catch {
        /* already stopped */
      }
      q.src.disconnect();
    }
    this.queue = [];
    this.nextStart = 0;
    this.itemStart.clear();
    this.setPlaying(false);
    return result;
  }

  private scheduleIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    // Debounce: more deltas for the same response usually arrive within a few ms.
    this.idleTimer = setTimeout(() => {
      if (this.queue.length === 0) {
        this.itemStart.clear();
        this.setPlaying(false);
      }
    }, 120);
  }

  private setPlaying(p: boolean) {
    if (p === this.playing) return;
    this.playing = p;
    this.onPlayingChange(p);
  }

  dispose() {
    this.interrupt();
    this.analyser.disconnect();
    this.out.disconnect();
  }
}
