/* biome-ignore-all lint/suspicious/noArrayIndexKey: 눈금·칸은 인덱스가 곧 정체성(데이터 행이 아니다) */
import { Frame } from "./Card";
import {
  AXIS,
  FAINT,
  GRID,
  INK,
  LADDER,
  MUTED,
  PAPER,
  rnd,
  unitFor,
} from "./tokens";

/** 5칸마다 장부 가로선 — 데이터가 성겨도 눈금이 화면을 잡아 준다 */
const Ledger = ({
  base,
  step,
  maxRungs,
}: {
  base: number;
  step: number;
  maxRungs: number;
}) => (
  <>
    {Array.from({ length: Math.floor(maxRungs / 5) }, (_, g) => {
      const y = base - (g + 1) * 5 * step + step / 2;
      return (
        <line
          key={g}
          x1={30}
          y1={y}
          x2={370}
          y2={y}
          stroke={GRID}
          strokeWidth={0.5}
          strokeDasharray="1 3"
        />
      );
    })}
  </>
);

/** 칸 간격: 가장 높은 사다리가 ≈180px. 칸은 셀 수 있어야 하고(≥5.4) 너무 성기면 안 된다(≤9) */
const stepFor = (maxRungs: number) =>
  Math.max(5.4, Math.min(9, 180 / Math.max(1, maxRungs)));

/* ═══ F6 · Paired Rungs — 분류별 2계열(옅음=was, 진함=now). 한 칸 = 1단위 ═══ */
export function PairedRungs({
  data,
  label,
  unitName,
}: {
  data: Array<{ name: string; was: number; now: number }>;
  label: string;
  unitName: string;
}) {
  const n = Math.max(1, data.length);
  const maxV = Math.max(1, ...data.map((d) => Math.max(d.was, d.now)));
  const unit = unitFor(maxV, 38);
  const rungs = (v: number) => Math.round(v / unit);
  const maxRungs = Math.max(1, Math.ceil(maxV / unit));
  const step = stepFor(maxRungs);
  const H = Math.round(Math.min(320, Math.max(150, maxRungs * step + 96)));
  const base = H - 62;
  const slot = Math.min(66, 340 / n);
  const HW = Math.min(10, slot / 6.5);
  const x0 = (i: number) => 30 + slot / 2 + i * slot;
  const half = Math.min(13, slot / 5);
  return (
    <Frame label={label} height={H}>
      <Ledger base={base} step={step} maxRungs={maxRungs} />
      {data.map((d, i) => {
        const xa = x0(i) - half;
        const xb = x0(i) + half;
        const was = rungs(d.was);
        const now = rungs(d.now);
        return (
          <g key={d.name}>
            {Array.from({ length: was }, (_, k) => {
              const y = base - k * step;
              const w = HW - 1.2 + rnd(k + 1, i + 2) * 2.4;
              return (
                <line
                  key={`w${k}`}
                  x1={xa - w}
                  y1={y}
                  x2={xa + w}
                  y2={y}
                  stroke={LADDER[4]}
                  strokeWidth={1}
                  opacity={0.5 + rnd(k + 2, i + 3) * 0.4}
                />
              );
            })}
            {Array.from({ length: now }, (_, k) => {
              const y = base - k * step;
              const w = HW - 1.2 + rnd(k + 1, i + 7) * 2.4;
              return (
                <line
                  key={`n${k}`}
                  x1={xb - w}
                  y1={y}
                  x2={xb + w}
                  y2={y}
                  stroke={INK}
                  strokeWidth={1}
                  opacity={0.6 + rnd(k + 2, i + 8) * 0.4}
                />
              );
            })}
            {d.now > 0 && (
              <text
                x={xb}
                y={base - Math.max(0, now - 1) * step - 9}
                fontSize={10.5}
                fontWeight={800}
                fill={INK}
                textAnchor="middle"
              >
                {d.now}
              </text>
            )}
            {d.was > 0 && (
              <text
                x={xa}
                y={base - Math.max(0, was - 1) * step - 9}
                fontSize={8.5}
                fontWeight={700}
                fill={LADDER[4]}
                textAnchor="middle"
              >
                {d.was}
              </text>
            )}
            <text
              x={x0(i)}
              y={base + 18}
              fontSize={AXIS.fontSize}
              fontWeight={700}
              fill={MUTED}
              textAnchor="middle"
              letterSpacing={AXIS.spacing}
            >
              {d.name}
            </text>
          </g>
        );
      })}
      <line
        x1={30}
        y1={base + 4}
        x2={370}
        y2={base + 4}
        stroke={GRID}
        strokeWidth={0.8}
      />
    </Frame>
  );
}

/* ═══ F2 · Hairline Line — 시계열 ≤30점. 바닥 캘린더 발스트로크 + 발스트로크 선 + 점. 최고 2점 강조 ═══ */
export function HairlineLine({
  data,
  label,
  format,
  emphasize = "max",
}: {
  data: Array<{ name: string; value: number | null; hollow?: boolean }>;
  label: string;
  format: (v: number) => string;
  emphasize?: "max" | "last";
}) {
  const N = Math.max(1, data.length);
  const values = data.map((d) => d.value ?? 0);
  const maxV = Math.max(0.000001, ...values);
  const x = (d: number) => 30 + (d * 340) / Math.max(1, N - 1);
  const H = 240;
  const base = H - 58;
  const map = (v: number) => base - (v / maxV) * 130;
  const present = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.value !== null);
  // 선은 값이 있는(빈 점이 아닌) 지점끼리만 잇는다
  const solid = present.filter(({ d }) => !d.hollow);
  const path = solid
    .map(({ d, i }, j) => `${j === 0 ? "M" : "L"}${x(i)} ${map(d.value ?? 0)}`)
    .join(" ");
  const top = new Set<number>();
  if (emphasize === "max") {
    for (const { i } of [...solid].sort(
      (a, b) => (b.d.value ?? 0) - (a.d.value ?? 0),
    )) {
      if ([...top].every((t) => Math.abs(t - i) >= 2)) top.add(i);
      if (top.size === 2) break;
    }
  } else {
    const lastSolid = solid.at(-1);
    if (lastSolid) top.add(lastSolid.i);
  }
  const labelEvery = N <= 6 ? 1 : N <= 14 ? 2 : Math.ceil(N / 6);
  return (
    <Frame label={label} height={H}>
      {data.map((_, i) => (
        <line
          key={`f${i}`}
          x1={x(i)}
          y1={base}
          x2={x(i)}
          y2={base - 7}
          stroke={FAINT}
          strokeWidth={0.6}
        />
      ))}
      <line
        x1={24}
        y1={base}
        x2={376}
        y2={base}
        stroke={GRID}
        strokeWidth={0.8}
      />
      {solid.length > 1 && (
        <path d={path} fill="none" stroke={INK} strokeWidth={1} />
      )}
      {present.map(({ d, i }) => {
        const big = top.has(i);
        return (
          <g key={`p${i}`}>
            <circle
              cx={x(i)}
              cy={map(d.value ?? 0)}
              r={big ? 4.2 : 2.1}
              fill={d.hollow ? PAPER : INK}
              stroke={INK}
              strokeWidth={d.hollow ? 1 : 0}
            />
            {big && (
              <text
                x={x(i)}
                y={map(d.value ?? 0) - 11}
                fontSize={9.5}
                fontWeight={800}
                fill={INK}
                textAnchor="middle"
                style={{ paintOrder: "stroke", stroke: PAPER, strokeWidth: 3 }}
              >
                {format(d.value ?? 0)}
              </text>
            )}
          </g>
        );
      })}
      {data.map((d, i) =>
        i % labelEvery === 0 || i === N - 1 ? (
          <text
            key={`l${i}`}
            x={x(i)}
            y={base + 18}
            fontSize={AXIS.fontSize}
            fontWeight={600}
            fill={MUTED}
            textAnchor="middle"
            letterSpacing=".1em"
          >
            {d.name}
          </text>
        ) : null,
      )}
    </Frame>
  );
}

/* ═══ F10 · Dot Heat — 요일×시간. 점 면적 = 양(√), 빈 칸은 아주 작은 점(침묵도 보이게), 최고 칸 점선 링 ═══ */
export function DotHeat({
  grid,
  hours,
  label,
  unitName,
}: {
  /** grid[dow(0=월)][hour] */
  grid: number[][];
  hours: number[];
  label: string;
  unitName: string;
}) {
  const DAY = ["월", "화", "수", "목", "금", "토", "일"];
  const cols = hours.length;
  const x0 = (j: number) => 64 + j * (300 / Math.max(1, cols - 1));
  const y0 = (i: number) => 44 + i * 30;
  const H = 300;
  let max = 0;
  let mi = 0;
  let mj = 0;
  hours.forEach((h, j) => {
    for (let i = 0; i < 7; i++) {
      const t = grid[i]?.[h] ?? 0;
      if (t > max) {
        max = t;
        mi = i;
        mj = j;
      }
    }
  });
  const r = (t: number) => 1.2 + Math.sqrt(t / Math.max(0.001, max)) * 9;
  return (
    <Frame label={label} height={H}>
      {DAY.map((d, i) => (
        <text
          key={d}
          x={50}
          y={y0(i) + 3}
          fontSize={AXIS.fontSize}
          fontWeight={700}
          fill={LADDER[2]}
          textAnchor="end"
          letterSpacing={AXIS.spacing}
        >
          {d}
        </text>
      ))}
      {hours.map((h, j) =>
        DAY.map((_, i) => {
          const t = grid[i]?.[h] ?? 0;
          const cx = x0(j);
          const cy = y0(i);
          if (!t)
            return (
              <circle
                key={`${i}-${j}`}
                cx={cx}
                cy={cy}
                r={0.8}
                fill={LADDER[6]}
              />
            );
          const hero = i === mi && j === mj;
          return (
            <g key={`${i}-${j}`}>
              <circle
                cx={cx}
                cy={cy}
                r={r(t)}
                fill={
                  t > max * 0.66 ? INK : t > max * 0.33 ? LADDER[2] : LADDER[4]
                }
              />
              {hero && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r(t) + 3.4}
                  fill="none"
                  stroke={INK}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}
            </g>
          );
        }),
      )}
      {hours.map((h, j) =>
        j % 2 === 0 ? (
          <text
            key={`h${h}`}
            x={x0(j)}
            y={y0(6) + 24}
            fontSize={7}
            fontWeight={600}
            fill={FAINT}
            textAnchor="middle"
          >
            {`${h}시`}
          </text>
        ) : null,
      )}
    </Frame>
  );
}

/* ═══ F7 · Stacked Rungs — 한 사다리를 구간별 회색으로. 구간 사이 한 칸 숨 ═══ */
export function StackedRungs({
  data,
  segments,
  label,
  unitName,
}: {
  data: Array<{ name: string; values: number[] }>;
  segments: string[];
  label: string;
  unitName: string;
}) {
  const n = Math.max(1, data.length);
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const maxT = Math.max(1, ...totals);
  const unit = unitFor(maxT, 36);
  const maxRungs = Math.max(1, Math.ceil(maxT / unit) + segments.length);
  const step = stepFor(maxRungs);
  const H = Math.round(Math.min(320, Math.max(150, maxRungs * step + 96)));
  const base = H - 58;
  const slot = Math.min(76, 340 / n);
  const HW = Math.min(13, slot / 5);
  const x0 = (i: number) => 30 + slot / 2 + i * slot;
  const SHADE = [INK, LADDER[3], LADDER[5]];
  return (
    <Frame label={label} height={H}>
      <Ledger base={base} step={step} maxRungs={maxRungs} />
      {data.map((d, i) => {
        const x = x0(i);
        let k0 = 0;
        const parts = d.values.map((v, si) => {
          const rungs = Math.round(v / unit);
          const start = k0;
          k0 += rungs;
          return { si, rungs, start };
        });
        return (
          <g key={d.name}>
            {parts.map(({ si, rungs, start }) =>
              Array.from({ length: rungs }, (_, k) => {
                const y = base - (start + k + si) * step;
                const w = HW - 1.4 + rnd(k + 1, i * 3 + si + 2) * 2.8;
                return (
                  <line
                    key={`${si}-${k}`}
                    x1={x - w}
                    y1={y}
                    x2={x + w}
                    y2={y}
                    stroke={SHADE[si] ?? LADDER[5]}
                    strokeWidth={1}
                    opacity={0.6 + rnd(k + 2, i + si + 4) * 0.4}
                  />
                );
              }),
            )}
            {totals[i] ? (
              <text
                x={x}
                y={base - (k0 + segments.length) * step - 6}
                fontSize={10}
                fontWeight={800}
                fill={INK}
                textAnchor="middle"
              >
                {Math.round((totals[i] ?? 0) * 10) / 10}
              </text>
            ) : null}
            <text
              x={x}
              y={base + 18}
              fontSize={AXIS.fontSize}
              fontWeight={700}
              fill={MUTED}
              textAnchor="middle"
              letterSpacing={AXIS.spacing}
            >
              {d.name}
            </text>
          </g>
        );
      })}
      <line
        x1={30}
        y1={base + 4}
        x2={370}
        y2={base + 4}
        stroke={GRID}
        strokeWidth={0.8}
      />
    </Frame>
  );
}

/* ═══ F11 · Tick Gauge — 210° 다이얼, 1 tick = 1%. 채워진 tick = 달성 ═══ */
export function TickGauge({
  percent,
  label,
  center,
  caption,
  note,
}: {
  percent: number;
  label: string;
  center: string;
  caption: string;
  note: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const cx = 200;
  const cy = 168;
  const R0 = 96;
  const A0 = -195;
  const SW = 210;
  const H = 270;
  const pol = (r: number, deg: number) =>
    [
      cx + r * Math.cos((deg * Math.PI) / 180),
      cy + r * Math.sin((deg * Math.PI) / 180),
    ] as const;
  const aT = A0 + (p / 100) * SW;
  const [ex, ey] = pol(R0 + 20, aT);
  return (
    <Frame label={label} height={H}>
      {Array.from({ length: 100 }, (_, k) => {
        const a = A0 + (k / 100) * SW;
        const inked = k < p;
        const len = inked ? 13 + rnd(k + 1, 3) * 6 : 5 + rnd(k + 1, 7) * 2.5;
        const [x1, y1] = pol(R0, a);
        const [x2, y2] = pol(R0 + len, a);
        return (
          <line
            key={k}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={inked ? INK : FAINT}
            strokeWidth={inked ? 1 : 0.6}
          />
        );
      })}
      {[25, 50, 75, 100].map((m) => {
        const a = A0 + (m / 100) * SW;
        const [dx, dy] = pol(R0 - 7, a);
        const [tx, ty] = pol(R0 - 19, a);
        return (
          <g key={m}>
            <circle cx={dx} cy={dy} r={1} fill={LADDER[4]} />
            <text
              x={tx}
              y={ty + 3}
              fontSize={7}
              fontWeight={600}
              fill={FAINT}
              textAnchor="middle"
            >
              {m}
            </text>
          </g>
        );
      })}
      {p > 0 && <circle cx={ex} cy={ey} r={2.4} fill={INK} />}
      <text
        x={cx}
        y={cy - 4}
        fontSize={34}
        fontWeight={800}
        fill={INK}
        textAnchor="middle"
      >
        {center}
      </text>
      <text
        x={cx}
        y={cy + 16}
        fontSize={8}
        fontWeight={600}
        fill={MUTED}
        textAnchor="middle"
        letterSpacing=".1em"
      >
        {caption}
      </text>
    </Frame>
  );
}

/* ═══ F5 · Tick Rows — 가로 줄 = 한 항목의 대기열, 1 tick = 1단위. 5개마다 점 ═══ */
export function TickRows({
  data,
  label,
  unitName,
  format,
}: {
  data: Array<{ name: string; value: number }>;
  label: string;
  unitName: string;
  format?: (v: number) => string;
}) {
  const rows = data.slice(0, 6);
  const maxV = Math.max(1, ...rows.map((r) => r.value));
  const unit = unitFor(maxV, 34);
  const ticks = (v: number) => Math.round(v / unit);
  const X0 = 104;
  const PX = Math.min(6.9, 250 / Math.max(1, ticks(maxV)));
  const rowH = Math.min(44, 250 / Math.max(1, rows.length));
  const H = Math.round(Math.min(320, 40 + rows.length * rowH + 30));
  const y0 = (i: number) => 32 + i * rowH;
  return (
    <Frame label={label} height={H}>
      {rows.map((row, i) => {
        const y = y0(i);
        const t = ticks(row.value);
        return (
          <g key={row.name}>
            <text
              x={94}
              y={y + 3}
              fontSize={8}
              fontWeight={700}
              fill={LADDER[2]}
              textAnchor="end"
              letterSpacing={AXIS.spacing}
            >
              {row.name.length > 10 ? `${row.name.slice(0, 9)}…` : row.name}
            </text>
            <line
              x1={X0}
              y1={y + 9}
              x2={X0 + 34 * PX}
              y2={y + 9}
              stroke={GRID}
              strokeWidth={0.6}
            />
            {Array.from({ length: t }, (_, k) => {
              const x = X0 + k * PX + PX / 2;
              const h = 9 + rnd(k + 1, i + 2) * 6;
              return (
                <g key={k}>
                  <line
                    x1={x}
                    y1={y + 9}
                    x2={x}
                    y2={y + 9 - h}
                    stroke={INK}
                    strokeWidth={0.9}
                    opacity={0.55 + rnd(k + 3, i + 5) * 0.45}
                  />
                  {k % 5 === 4 && (
                    <circle cx={x} cy={y + 13} r={0.8} fill={FAINT} />
                  )}
                </g>
              );
            })}
            <text
              x={X0 + t * PX + 10}
              y={y + 4}
              fontSize={11}
              fontWeight={800}
              fill={INK}
            >
              {format ? format(row.value) : row.value}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}
