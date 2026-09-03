import { z } from "zod";

export const MEETING_EVENTS = {
  started: "meeting.started",
  ended: "meeting.ended",
  transcribed: "meeting.transcribed",
  summarized: "meeting.summarized",
  deleted: "meeting.deleted",
} as const;

export const turnSchema = z.object({
  turnId: z.number().int(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string(),
  speaker: z.string().optional(),
});

/** 라이브 패스 세그먼트 업로드 메타 */
export const segmentMetaSchema = z.object({
  seq: z.number().int().min(0),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

/** 파이널 패스 청크 업로드 메타. offsetTable: 청크 내부 ms → 회의 ms 매핑(세그먼트 경계) */
export const chunkMetaSchema = z.object({
  chunkIndex: z.number().int().min(0),
  chunkCount: z.number().int().min(1),
  offsetTable: z
    .array(
      z.object({
        chunkMs: z.number().int().min(0),
        meetingMs: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const actionItemSchema = z.object({
  title: z.string().min(1).max(200),
  owner: z.string().optional(),
  due: z
    .string()
    .optional()
    .describe("ISO 날짜 또는 '다음 주 월요일' 같은 표현"),
  sourceSeq: z.array(z.number().int()).default([]),
});

export const meetingSummarySchema = z.object({
  tldr: z.string().max(400),
  keyPoints: z.array(z.string().max(200)).max(10),
  decisions: z.array(z.string().max(200)).max(10),
  actionItems: z.array(actionItemSchema).max(15),
  openQuestions: z.array(z.string().max(200)).max(10),
  participants: z.array(z.string().max(60)).max(20),
  followups: z
    .array(
      z.object({ title: z.string().max(200), when: z.string().optional() }),
    )
    .max(5),
});
export type MeetingSummary = z.infer<typeof meetingSummarySchema>;

export const startMeetingSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  calendarEventId: z.string().uuid().optional(),
  audioMime: z.string().optional(),
});
