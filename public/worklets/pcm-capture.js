// AudioWorklet: 입력 채널을 Int16 PCM 블록(2048 샘플)으로 메인 스레드에 전달. 필요하면 16k 로 리샘플.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target =
      (options.processorOptions && options.processorOptions.targetRate) ||
      16000;
    this.ratio = sampleRate / this.target; // 전역 sampleRate = AudioContext 실제 레이트
    this.buf = new Int16Array(2048);
    this.n = 0;
    this.acc = 0; // 리샘플 누적 위치
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (Math.abs(this.ratio - 1) < 1e-6) {
      for (let i = 0; i < ch.length; i++) this.push(ch[i]);
    } else {
      // 선형 보간 다운샘플
      let pos = this.acc;
      while (pos < ch.length - 1) {
        const i = Math.floor(pos);
        const f = pos - i;
        this.push(ch[i] * (1 - f) + ch[i + 1] * f);
        pos += this.ratio;
      }
      this.acc = pos - ch.length;
    }
    return true;
  }
  push(s) {
    const v = Math.max(-1, Math.min(1, s));
    this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    if (this.n === this.buf.length) {
      this.port.postMessage(this.buf.buffer.slice(0));
      this.n = 0;
    }
  }
}
registerProcessor("pcm-capture", PcmCapture);
