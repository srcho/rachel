# Local browser evidence — 2026-09-05

The browser suite uses Chromium desktop and Pixel 7 projects against the real local Next.js application and Supabase stack. The Today scenario explicitly sets a 375 × 812 viewport in both projects. Each scenario creates an isolated local test user and removes that user afterward. No production data or Google account is involved.

Initial run: **10 passed in 52.2 seconds, zero retries**. The independent review subsequently added two current-conversation deletion browser cases and the regressions described below. Biome passed for the harness files; the complete TypeScript check passed after the review fixes, before the final dock loading change.

Final post-review run: **12 passed in 1.1 minutes, zero retries**, using the same command above. All desktop and mobile scenarios passed, including current-thread deletion and starting a new conversation.

## Reproduce

Start the local Supabase stack with the plan migrations applied. With port 3200 free, run these commands in separate terminals:

```sh
node tests/e2e/assistant-server.mjs
pnpm exec playwright test tests/e2e/assistant.spec.ts --retries=0
```

The server launcher reads local Supabase credentials from `pnpm supabase status -o env` without printing them, enables the existing test-login endpoint, and explicitly sets `RACHEL_E2E_MODEL_STUB=1`. The preload intercepts only the OpenAI provider boundary. Responses receives a deterministic text SSE response; other OpenAI calls are blocked. The real React UI, AI SDK approval continuation, Next.js actions/routes, tool execution, and database remain active. Cached briefing fixtures avoid unrelated generation. These are **provider-stub browser tests**, not Luna model-quality evaluations.

## Assertions

| Scenario | Browser and database evidence |
| --- | --- |
| A01/A02 task deletion approval | A persisted signed SDK approval request and its server-bound proposal reopen after reload. Double-clicking approve sends one `/api/chat` continuation, deletes the task, and creates one completed `tasks.delete` execution receipt. The finished tool result and assistant response reopen after another reload without approval controls. |
| A02 rejection | The same pending request reopens, double-clicking cancel sends one continuation, persists rejection, retains the task, and creates no deletion receipt. The settled conversation survives reload. |
| Current conversation deletion | Approve deletion of the conversation containing the approval itself. Check the old thread is absent, its single execution receipt remains done with a null thread reference, the dock clears its old messages, and a newly sent message uses a different thread ID without recreating the deleted thread. |
| A07 older conversation | Seed 205 ordered persisted messages. Reopen the newest 200 with message 204 present and message 000 absent, load the older page and observe message 000 exactly once, then reload and reopen with message 204 preserved. |
| A29/A30 Today | Select a task without a deadline for today's plan. “Keep” leaves the existing task's plan, deadline, and version unchanged. Move an unfinished plan to tomorrow while preserving its deadline; remove another task from today's plan without adding a deadline or deleting the task. Verify the refreshed empty day-close state and no document-width overflow at 375 px. |
| Settings | Change response length and preferred start hour through the form, verify both in `profiles.settings`, and confirm response length survives reload. |
| Processed capture | Open a resolved capture, follow its actual task link, return and restore it to the existing `triaged` state. Check the database after restoration. |

The signatures are generated in the isolated fixture using the installed SDK's HMAC format and the local server's derived approval secret. No approval/tool/client response is intercepted by Playwright. This specifically exercises trusted persisted assistant messages and their signed SDK continuation through the application route.

## Visual evidence

Screenshots are generated under `output/playwright/`:

- `today-mobile-desktop.png` and `today-mobile-mobile.png`: 375 px Today layout after explicit plan changes.
- `approval-pending-true-mobile.png` / `approval-true-mobile.png`: pending preview and settled execution.
- `approval-pending-false-mobile.png` / `approval-false-mobile.png`: pending preview and settled rejection.
- Equivalent `desktop` approval images and `history-{desktop,mobile}.png` show the desktop dock and persisted conversations.
- `settings-{desktop,mobile}.png` and `capture-processed-{desktop,mobile}.png` show saved settings and the processed source link.

`approval-current-thread-{desktop,mobile}.png` shows the new conversation after deleting the previous active conversation.

Approval screenshots use the viewport, because full-page capture temporarily changes mobile visual viewport dimensions and can displace a fixed bottom drawer during subsequent interaction. Screenshots wait for actual refreshed state rather than relying on absence of a loading control.

## Scope and limits

This suite verifies the deletion approval route with `tasks.delete` and `agent.deleteThread`; the other destructive tool definitions need their separate tool/domain acceptance evidence. It does not claim live Google refresh or external mutation, actual Luna language interpretation, fixed-calendar capacity calculation, or memory extraction correctness. Today deliberately uses an unconnected local calendar and shows that capacity is unknown; service tests cover busy-time subtraction and the deadline/plan distinction.

Earlier harness iterations corrected fixture shape (`priority`, `origin`, and `resolved_ref.type = card`), native-select lookup, the restore expectation (`triaged`), and screenshot timing. These were test-harness corrections. An observed reminder job dedupe error was reported to the owner; the restarted final server run no longer emits that error.


## Independent review follow-up

The review found that ordinary message bookkeeping changed the current thread version and invalidated its own deletion approval. The fix snapshots thread identity and title for deletion, rechecks that snapshot, and uses the latest database version for the final conditional delete. Rename conflicts remain protected. Post-delete streaming completion does not save messages back into the missing thread or emit a thread-completed event. A local database regression covers approval persistence, user-message resubmission, one deletion receipt, replay, and rejection after rename.

The browser follow-up caught old initial messages being cached under a new thread ID when the active conversation was deleted. Thread-specific loading state now prevents that intermediate mount. Two store tests check removal of active/inactive threads, and the added browser scenarios verify an actual new conversation after deletion.

The route also now marks a six-step stop even when its final step is the forced text summary. The previous condition required a final tool call and missed this normal limit path.
