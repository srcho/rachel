/** WAV(RIFF, PCM 16-bit mono) 인코딩·헤더 검증. 브라우저와 서버 양쪽에서 쓴다. */

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataBytes: number;
  durationSec: number;
}

export function encodeWav(pcm: Int16Array, sampleRate: number): Blob {
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits
  writeStr(36, "data");
  v.setUint32(40, dataBytes, true);
  new Int16Array(buffer, 44).set(pcm);
  return new Blob([buffer], { type: "audio/wav" });
}

/** 헤더를 읽어 포맷·길이를 돌려준다. 유효하지 않으면 throw. */
export function parseWavHeader(buf: ArrayBuffer): WavInfo {
  if (buf.byteLength < 44) throw new Error("WAV 헤더가 너무 짧아요");
  const v = new DataView(buf);
  const tag = (off: number) =>
    String.fromCharCode(
      v.getUint8(off),
      v.getUint8(off + 1),
      v.getUint8(off + 2),
      v.getUint8(off + 3),
    );
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE")
    throw new Error("RIFF/WAVE 형식이 아니에요");
  // fmt 청크 탐색(일부 인코더는 LIST 청크를 앞에 둔다)
  let off = 12;
  let fmt:
    | { channels: number; sampleRate: number; bits: number; format: number }
    | undefined;
  let dataBytes: number | undefined;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    if (id === "fmt ") {
      fmt = {
        format: v.getUint16(off + 8, true),
        channels: v.getUint16(off + 10, true),
        sampleRate: v.getUint32(off + 12, true),
        bits: v.getUint16(off + 22, true),
      };
    } else if (id === "data") {
      dataBytes = Math.min(size, buf.byteLength - off - 8);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || dataBytes === undefined)
    throw new Error("fmt/data 청크를 찾지 못했어요");
  if (fmt.format !== 1 || fmt.bits !== 16)
    throw new Error("16-bit PCM WAV 만 지원해요");
  const durationSec = dataBytes / (fmt.sampleRate * fmt.channels * 2);
  return {
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitsPerSample: fmt.bits,
    dataBytes,
    durationSec,
  };
}

/** Muse 배치 한도 검증: mono, 16k/24k, ≤ maxSeconds, ≤ maxBytes */
export function assertMuseWav(
  info: WavInfo,
  totalBytes: number,
  limits: { maxSeconds: number; maxBytes: number },
): void {
  if (info.channels !== 1)
    throw new Error(`mono 만 허용해요 (channels=${info.channels})`);
  if (info.sampleRate !== 16_000 && info.sampleRate !== 24_000)
    throw new Error(`16k/24k 만 허용해요 (${info.sampleRate})`);
  if (info.durationSec > limits.maxSeconds)
    throw new Error(
      `요청당 ${limits.maxSeconds}초를 넘었어요 (${Math.round(info.durationSec)}s)`,
    );
  if (totalBytes > limits.maxBytes)
    throw new Error(
      `요청당 ${limits.maxBytes} 바이트를 넘었어요 (${totalBytes})`,
    );
}
