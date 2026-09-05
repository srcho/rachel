import { z } from "zod";
import {
  KIND_LABEL,
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "./constants";

export { KIND_LABEL, NOTIFICATION_KINDS, type NotificationKind };

export const pushPayloadSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  title: z.string().max(80),
  body: z.string().max(200),
  url: z.string().default("/today"),
  tag: z.string().optional(),
  taskId: z.string().uuid().optional(),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().optional(),
});
