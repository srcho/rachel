"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { saveAssistantPreferencesAction } from "./assistant-actions";
import type { AssistantPreferences as Preferences } from "./assistant-schema";

const field =
  "w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50";

export function AssistantPreferences({
  preferences,
  timezone,
}: {
  preferences: Preferences;
  timezone: string;
}) {
  const [state, action, pending] = useActionState(
    saveAssistantPreferencesAction,
    {},
  );
  const scheduling = preferences.scheduling ?? {};
  return (
    <form action={action} className="space-y-3">
      <p className="text-xs text-muted-foreground">
        대화로 바꾼 선호도 여기서 확인할 수 있어요. 저장한 설정은 앞으로의
        응답과 새 시간 추천에 적용돼요.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span>먼저 챙겨주는 정도</span>
          <select
            name="initiative"
            defaultValue={preferences.initiative ?? "important"}
            className={field}
          >
            <option value="on_request">요청할 때만</option>
            <option value="important">중요한 누락·충돌만</option>
            <option value="active">관련 제안도 함께</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>답변 길이</span>
          <select
            name="responseLength"
            defaultValue={preferences.responseLength ?? "adaptive"}
            className={field}
          >
            <option value="brief">짧게</option>
            <option value="adaptive">내용에 맞게</option>
            <option value="detailed">자세하게</option>
          </select>
        </label>
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm">시간 배치와 시간대</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>시간대</span>
            <input
              name="timezone"
              defaultValue={timezone}
              className={field}
              list="assistant-timezones"
              required
            />
            <datalist id="assistant-timezones">
              <option value="Asia/Seoul" />
              <option value="Asia/Tokyo" />
              <option value="America/New_York" />
              <option value="America/Los_Angeles" />
              <option value="Europe/London" />
            </datalist>
            <span className="text-xs text-muted-foreground">
              ‘오늘’과 상대 날짜를 판단하는 기준이에요.
            </span>
          </label>
          <NumberField
            name="defaultDurationMinutes"
            label="길이를 말하지 않은 일정 (분)"
            value={scheduling.defaultDurationMinutes ?? 60}
            min={5}
            max={480}
          />
          <NumberField
            name="bufferMinutes"
            label="일정 사이 여유 (분)"
            value={scheduling.bufferMinutes ?? 0}
            min={0}
            max={120}
          />
          <NumberField
            name="workStartHour"
            label="근무 시작 (시)"
            value={scheduling.workStartHour ?? 9}
            min={0}
            max={23}
          />
          <NumberField
            name="workEndHour"
            label="근무 종료 (시)"
            value={scheduling.workEndHour ?? 19}
            min={1}
            max={24}
          />
          <NumberField
            name="preferredStartHour"
            label="시간 추천 시작 (시, 선택)"
            value={scheduling.preferredStartHour ?? ""}
            min={0}
            max={23}
            optional
          />
          <NumberField
            name="preferredEndHour"
            label="시간 추천 종료 (시, 선택)"
            value={scheduling.preferredEndHour ?? ""}
            min={1}
            max={24}
            optional
          />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              name="includeWeekends"
              type="checkbox"
              defaultChecked={scheduling.includeWeekends ?? false}
            />
            주말에도 시간을 추천해 주세요
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            추천 시간을 비우면 근무 시간 전체를 사용해요. 이번 요청에서 지정한
            시간과 길이가 저장된 선호보다 우선해요. 기존 일정과 마감은 유지돼요.
          </p>
        </div>
      </details>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.saved && (
        <output className="block text-sm text-muted-foreground">
          선호를 저장했어요.
        </output>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "저장 중…" : "선호 저장"}
      </Button>
    </form>
  );
}

function NumberField({
  name,
  label,
  value,
  min,
  max,
  optional,
}: {
  name: string;
  label: string;
  value: number | "";
  min: number;
  max: number;
  optional?: boolean;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span>{label}</span>
      <input
        name={name}
        type="number"
        step={1}
        min={min}
        max={max}
        defaultValue={value}
        required={!optional}
        className={field}
      />
    </label>
  );
}
