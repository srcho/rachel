"use client";
import type { Chat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadThreadAction } from "../actions";
import type { RachelUIMessage } from "../agent";
import { mergeSavedMessages } from "./chat-session";

export function useChatRecovery(
  chat: Chat<RachelUIMessage>,
  messages: RachelUIMessage[],
) {
  const [notice, setNotice] = useState("");
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState(true);
  const [revision, setRevision] = useState(0);
  const activity = useRef(Date.now());
  // New chunks prove that the original request is still making progress.
  useEffect(() => {
    if (messages) activity.current = Date.now();
  }, [messages]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly retries the read.
  useEffect(() => {
    let active = true;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reads = 0;
    const busy = () =>
      chat.status === "submitted" || chat.status === "streaming";
    const check = async (token: number) => {
      if (
        !active ||
        token !== generation ||
        document.visibilityState === "hidden"
      )
        return;
      if (!navigator.onLine) {
        setOnline(false);
        setChecking(false);
        setNotice(
          "오프라인이에요. 작성한 내용은 유지되며 연결되면 대화를 다시 확인해요.",
        );
        return;
      }
      setOnline(true);
      if (busy()) {
        // Match the route's 120s budget: a quiet tool can still be doing work.
        if (Date.now() - activity.current < 120_000) {
          setNotice("진행 중인 응답을 이어서 확인하고 있어요.");
          timer = setTimeout(() => void check(token), 1500);
          return;
        }
        // A suspended connection can stay 'streaming' forever. Stop that local
        // connection, then read saved results; never resend a mutation on resume.
        await chat.stop();
        activity.current = Date.now();
        timer = setTimeout(() => void check(token), 500);
        return;
      }
      setChecking(true);
      setNotice("저장된 대화를 확인하고 있어요.");
      const snapshot = chat.messages;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const saved = await Promise.race([
          loadThreadAction(chat.id),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("timeout")), 10_000);
          }),
        ]);
        if (!active || token !== generation) return;
        if (!busy() && chat.messages === snapshot) {
          chat.messages = mergeSavedMessages(
            snapshot,
            saved as RachelUIMessage[],
          );
        }
        const last = chat.messages.at(-1);
        const pending =
          last?.role === "user" ||
          last?.parts.some(
            (part) =>
              (part.type === "text" && part.state === "streaming") ||
              ("state" in part && part.state === "input-streaming"),
          );
        const incomplete =
          pending || last?.metadata?.stopReason === "interrupted";
        setNotice(
          incomplete
            ? "응답이 끝났는지 확인이 필요해요. 저장된 대화와 작업 기록을 유지했어요."
            : "",
        );
        if (!incomplete) chat.clearError();
        // Persistence may finish after the connection disappears. Retry reads
        // briefly, without executing the original user request a second time.
        if (pending && ++reads < 5)
          timer = setTimeout(() => void check(token), 3000);
      } catch {
        if (active && token === generation)
          setNotice(
            "최근 대화를 확인하지 못했어요. 현재 대화와 입력 내용은 유지했어요.",
          );
      } finally {
        clearTimeout(timeout);
        if (active && token === generation) setChecking(false);
      }
    };
    const resume = () => {
      clearTimeout(timer);
      generation++;
      reads = 0;
      if (document.visibilityState === "hidden") return;
      // Let a resumed stream deliver queued chunks before judging its status.
      activity.current = Date.now();
      const token = generation;
      timer = setTimeout(() => void check(token), 250);
    };
    const offline = () => {
      clearTimeout(timer);
      generation++;
      setOnline(false);
      setChecking(false);
      setNotice(
        "오프라인이에요. 작성한 내용은 유지되며 연결되면 대화를 다시 확인해요.",
      );
    };
    setOnline(navigator.onLine);
    if (chat.messages.length) resume();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    return () => {
      active = false;
      generation++;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", offline);
    };
  }, [chat, revision]);
  return { notice, checking, online, refresh };
}
