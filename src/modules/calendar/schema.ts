import { z } from "zod";

const iso = z.string().datetime({ offset: true });

export const createEventSchema = z.object({
  creationKey: z.string().min(1).max(2000).optional(),
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
  isBusy: z.boolean().default(true),
  location: z.string().max(500).nullish(),
  description: z.string().max(5000).nullish(),
});
export type CreateEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = createEventSchema
  .omit({ calendarId: true, creationKey: true })
  .extend({
    allDay: createEventSchema.shape.allDay.removeDefault(),
    isBusy: createEventSchema.shape.isBusy.removeDefault(),
  })
  .partial();
export type UpdateEventInput = z.input<typeof updateEventSchema>;

export const listEventsSchema = z.object({
  from: iso,
  to: iso,
  q: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
export type ListEventsInput = z.input<typeof listEventsSchema>;

export const findFreeSlotsSchema = z
  .object({
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
    bufferMinutes: z.number().int().min(0).max(180).default(0),
    includeWeekends: z.boolean().default(false),
    preferredStartHour: z.number().int().min(0).max(23).optional(),
    preferredEndHour: z.number().int().min(1).max(24).optional(),
  })
  .refine(
    (f) =>
      Date.parse(f.to) > Date.parse(f.from) &&
      Date.parse(f.to) - Date.parse(f.from) <= 90 * 86_400_000,
    "90일 안의 올바른 기간을 지정해 주세요",
  )
  .refine(
    (f) => f.workEndHour > f.workStartHour,
    "근무 종료는 시작보다 늦어야 해요",
  );
export type FindFreeSlotsInput = z.input<typeof findFreeSlotsSchema>;
