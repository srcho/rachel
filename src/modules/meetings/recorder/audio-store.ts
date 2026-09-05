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
    value: {
      meetingId: string;
      index: number;
      blob: Blob;
      mime: string;
      sessionId?: string;
      startMs?: number;
      endMs?: number;
    };
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
    await (await db()).add(
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
  async appendRec(
    meetingId: string,
    index: number,
    blob: Blob,
    mime: string,
    session?: { sessionId: string; startMs: number; endMs: number },
  ) {
    await (await db()).add(
      "rec",
      { meetingId, index, blob, mime, ...session },
      `${meetingId}:${String(index).padStart(6, "0")}`,
    );
  },
  async resumeInfo(meetingId: string) {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    const [pcms, recordings] = await Promise.all([
      d.getAll("pcm", range),
      d.getAll("rec", range),
    ]);
    return {
      nextSeq: Math.max(-1, ...pcms.map((p) => p.seq)) + 1,
      nextRecIndex: Math.max(-1, ...recordings.map((r) => r.index)) + 1,
      elapsedMs: Math.max(
        0,
        ...pcms.map((p) => p.endMs),
        ...recordings.map((r) => r.endMs ?? 0),
      ),
      hasData: pcms.length > 0 || recordings.length > 0,
    };
  },
  /** Each MediaRecorder session has its own container header; never concatenate sessions. */
  async getRecordings(meetingId: string) {
    const d = await db();
    const range = IDBKeyRange.bound(`${meetingId}:`, `${meetingId}:￿`);
    const parts = (await d.getAll("rec", range)).sort(
      (a, b) => a.index - b.index,
    );
    const sessions = new Map<
      string,
      { startMs: number; endMs: number; mime: string; parts: Blob[] }
    >();
    for (const p of parts) {
      const id = p.sessionId ?? "legacy";
      const session: {
        startMs: number;
        endMs: number;
        mime: string;
        parts: Blob[];
      } = sessions.get(id) ?? {
        startMs: p.startMs ?? 0,
        endMs: 0,
        mime: p.mime,
        parts: [],
      };
      session.parts.push(p.blob);
      session.endMs = Math.max(session.endMs, p.endMs ?? 0);
      sessions.set(id, session);
    }
    return [...sessions.values()].map((s) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      blob: new Blob(s.parts, { type: s.mime }),
    }));
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
