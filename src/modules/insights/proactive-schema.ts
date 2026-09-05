import { z } from "zod";
export const suggestionKinds = [
  "time_conflict",
  "capacity_risk",
  "meeting_followup",
  "waiting_followup",
  "changed_evidence",
  "preference",
] as const;
export const suggestionKindSchema = z.enum(suggestionKinds);
export type SuggestionKind = z.infer<typeof suggestionKindSchema>;
export const suggestionResponseSchema = z.object({
  id: z.string().uuid(),
  action: z.enum([
    "dismiss",
    "snooze",
    "disable_kind",
    "accept_preference",
    "reject_preference",
  ]),
  expectedVersion: z.string().datetime({ offset: true }),
  userQuote: z.string().trim().min(1).max(300).optional(),
  until: z.string().datetime({ offset: true }).optional(),
});
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
