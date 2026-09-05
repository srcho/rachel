"use client";
import { registerOutboxHandler, runOrQueue } from "@/core/offline/outbox";
import { captureAction } from "../actions";

type CaptureArgs = Parameters<typeof captureAction>;
registerOutboxHandler("capture.add", (...args) =>
  captureAction(...(args as CaptureArgs)),
);

export function saveCapture(...args: CaptureArgs) {
  return runOrQueue("capture.add", args, () => captureAction(...args));
}

export function CaptureOutbox() {
  return null;
}
