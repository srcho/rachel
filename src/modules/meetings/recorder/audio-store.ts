"use client";
import { type IDBPDatabase, openDB } from "idb";

/**
 * 기기 오디오 보관(IndexedDB 'rachel-audio').
 *  - pcm: 라이브 패스 WAV 세그먼트(파이널 패스까지 임시)  key `${meetingId}:${seq}`
 *  - rec: 압축 녹음 청크(영구, 재생용)                        key `${meetingId}:${index}`
 */
interface Schema {
  pcm: {
    key: string;
    value: {
      meetingId: string;
      seq: number;
      startMs: number;
      endMs: number;
      blob: Blob;
    };
  };
  rec: {
    key: string;
    value: { meetingId: string; index: number; blob: Blob; mime: string };
  };
}

let dbp: Promise<IDBPDatabase<Schema>> | undefined;
function db() {
  if (!dbp) {
    dbp = openDB<Schema>("rachel-audio", 1, {
      upgrade(d) {
        d.createObjectStore("pcm");
        d.createObjectStore("rec");
      },
    });
  }
  return dbp;
}

export const audioStore = {
  async persist(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  },
  async estimate(): Promise<{ usage: number; quota: number } | null> {
    try {
      const e = await navigator.storage?.estimate?.();
      return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null;
    } catch {
      return null;
    }
  },
  async putPcm(
    meetingId: string,
    seq: number,
    startMs: number,
    endMs: number,
    blob: Blob,
  ) {
    await (await db()).put(
      "pcm",
      { meetingId, seq, startMs, endMs, blob },
      `${meetingId}:${String(seq).padStart(6, "0")}`,
    );
  },
  async listPcm(meetingId: string) {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    return (await d.getAll("pcm", range)).sort((a, b) => a.seq - b.seq);
  },
  /** 세그먼트 하나(파이널 패스가 청크마다 필요한 것만 읽는다) */
  async getPcm(meetingId: string, seq: number) {
    return (await db()).get(
      "pcm",
      `${meetingId}:${String(seq).padStart(6, "0")}`,
    );
  },
  async deletePcm(meetingId: string) {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    const keys = await d.getAllKeys("pcm", range);
    const tx = d.transaction("pcm", "readwrite");
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
  },
  async appendRec(meetingId: string, index: number, blob: Blob, mime: string) {
    await (await db()).put(
      "rec",
      { meetingId, index, blob, mime },
      `${meetingId}:${String(index).padStart(6, "0")}`,
    );
  },
  /** 재생용 단일 Blob(청크 결합) */
  async getRecording(meetingId: string): Promise<Blob | null> {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    const parts = (await d.getAll("rec", range)).sort(
      (a, b) => a.index - b.index,
    );
    if (parts.length === 0) return null;
    return new Blob(
      parts.map((p) => p.blob),
      { type: parts[0]?.mime ?? "audio/webm" },
    );
  },
  async hasRecording(meetingId: string): Promise<boolean> {
    const d = await db();
    return (
      (await d.count(
        "rec",
        IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`),
      )) > 0
    );
  },
  async deleteRecording(meetingId: string) {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    const keys = await d.getAllKeys("rec", range);
    const tx = d.transaction("rec", "readwrite");
    await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done]);
  },
};
