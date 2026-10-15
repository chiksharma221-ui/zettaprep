import { AUDIO_SAMPLE_RATE } from "@/lib/interview/protocol";

export interface MicFrame {
  pcm: ArrayBuffer; // PCM16 LE mono @ 24 kHz
  rms: number;
}

/**
 * Microphone → AudioWorklet (resample + PCM16) → callback. Exposes an AnalyserNode on the raw
 * mic signal for the visualizer.
 */
export class MicCapture {
  readonly analyser: AnalyserNode;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode;
  private _muted = false;

  constructor(private readonly ctx: AudioContext, private readonly onFrame: (f: MicFrame) => void) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;
    this.sink = ctx.createGain();
    this.sink.gain.value = 0; // keeps the worklet in the render graph without audible output
    this.sink.connect(ctx.destination);
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      processorOptions: { targetRate: AUDIO_SAMPLE_RATE },
    });
    this.node.port.onmessage = (e: MessageEvent<MicFrame>) => {
      if (!this._muted) this.onFrame(e.data);
    };
    this.source.connect(this.analyser);
    this.source.connect(this.node);
    this.node.connect(this.sink);
  }

  get muted() {
    return this._muted;
  }

  setMuted(muted: boolean) {
    this._muted = muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  stop() {
    this.node?.port.close();
    this.node?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.source = null;
    this.stream = null;
  }
}
