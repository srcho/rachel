import { z } from "zod";

const iso = z.string().datetime({ offset: true });

export const createEventSchema = z.object({
  calendarId: z
    .string()
    .nullish()
    .describe(
      "listEvents 의 calendars[].id. 모르면 null — 기본(primary) 캘린더에 만든다. 지어내지 말 것",
    ),
  title: z.string().trim().min(1).max(300),
  startAt: iso,
  endAt: iso
    .nullish()
    .describe(
      "생략 가능. 시각 일정은 시작 +1시간, 종일(allDay) 은 생략 — 서버가 다음날(배타적 종료)을 채운다. 사용자에게 묻지 말 것",
    ),
  allDay: z.boolean().default(false),
  location: z.string().max(500).optional(),
  description: z.string().max(5000).optional(),
});
export type CreateEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = createEventSchema
  .omit({ calendarId: true })
  .partial();
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const listEventsSchema = z.object({
  from: iso,
  to: iso,
  q: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListEventsInput = z.input<typeof listEventsSchema>;

export const findFreeSlotsSchema = z.object({
  from: iso,
  to: iso,
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  workStartHour: z.number().int().min(0).max(23).default(9),
  workEndHour: z.number().int().min(1).max(24).default(19),
  limit: z.number().int().min(1).max(20).default(5),
});
export type FindFreeSlotsInput = z.input<typeof findFreeSlotsSchema>;
