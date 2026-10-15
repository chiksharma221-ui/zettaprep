/**
 * AudioWorklet: captures mono microphone audio, resamples from the AudioContext rate
 * (usually 48 kHz) to 24 kHz, converts to little-endian PCM16 and posts 40 ms frames to the
 * main thread together with the frame's RMS level (used for local barge-in detection).
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 24000;
    this.step = sampleRate / this.targetRate; // input samples per output sample
    this.frameSamples = Math.round(this.targetRate * 0.04);
    this.frame = new Int16Array(this.frameSamples);
    this.idx = 0;
    this.carry = 0; // fractional read position carried across render quanta
    this.sumSq = 0;
  }

  emit() {
    const rms = Math.sqrt(this.sumSq / this.frameSamples);
    const out = this.frame;
    this.port.postMessage({ pcm: out.buffer, rms }, [out.buffer]);
    this.frame = new Int16Array(this.frameSamples);
    this.idx = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;

    let t = this.carry;
    while (t < ch.length) {
      const i = Math.floor(t);
      const frac = t - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : ch[i];
      let s = a + (b - a) * frac;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      this.sumSq += s * s;
      this.frame[this.idx++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.idx === this.frameSamples) this.emit();
      t += this.step;
    }
    this.carry = t - ch.length;
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
