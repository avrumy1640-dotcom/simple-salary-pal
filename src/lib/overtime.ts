// FLSA + state overtime engine.
//
// Federal FLSA: OT is hours over 40 in a workweek, paid at 1.5x.
// California-style states layer DAILY rules: over 8 in a day → 1.5x; over 12 in a day → 2.0x;
// 7th consecutive workday → 1.5x first 8 hrs, 2.0x beyond. We implement the daily and
// weekly stack; 7th-day is approximated as part of daily rules + weekly threshold.
//
// Inputs are paired in/out punches grouped by employee and workday.
// Time on break (paired break_start/break_end) is subtracted from worked time.

export interface PunchInput {
  punched_at: string;   // ISO timestamp
  punch_type: "in" | "out" | "break_start" | "break_end";
}

export interface OvertimeConfig {
  weeklyOtThreshold: number;          // e.g. 40
  dailyOtThreshold: number | null;    // e.g. 8 (CA) or null (federal)
  dailyDoubleOtThreshold: number | null; // e.g. 12 (CA)
  workweekStartDow: number;           // 0=Sun..6=Sat
}

export interface DailyHours {
  workDate: string;       // YYYY-MM-DD
  workedHours: number;    // raw worked hours (in–out minus breaks)
  regularHours: number;
  overtimeHours: number;
  doubleOvertimeHours: number;
}

export interface RollupResult {
  daily: DailyHours[];
  totals: { regular: number; overtime: number; doubleOvertime: number; worked: number };
}

const MS_PER_HOUR = 3_600_000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pair in/out punches per local workday; subtract paired breaks. Unpaired in/out is ignored with notes. */
export function pairPunchesToDailyHours(punches: PunchInput[]): Map<string, number> {
  const sorted = [...punches].sort((a, b) => a.punched_at.localeCompare(b.punched_at));
  const byDay = new Map<string, number>();
  let openIn: Date | null = null;
  let openBreak: Date | null = null;

  for (const p of sorted) {
    const ts = new Date(p.punched_at);
    if (p.punch_type === "in") {
      openIn = ts;
    } else if (p.punch_type === "out" && openIn) {
      const day = dateKey(openIn);
      const hours = (ts.getTime() - openIn.getTime()) / MS_PER_HOUR;
      byDay.set(day, (byDay.get(day) ?? 0) + Math.max(0, hours));
      openIn = null;
    } else if (p.punch_type === "break_start" && openIn) {
      openBreak = ts;
    } else if (p.punch_type === "break_end" && openBreak && openIn) {
      const day = dateKey(openIn);
      const breakHours = (ts.getTime() - openBreak.getTime()) / MS_PER_HOUR;
      byDay.set(day, (byDay.get(day) ?? 0) - Math.max(0, breakHours));
      openBreak = null;
    }
  }
  // Round to 2 decimals; clamp non-negative
  for (const [k, v] of byDay) byDay.set(k, Math.max(0, Math.round(v * 100) / 100));
  return byDay;
}

function weekKey(dateStr: string, workweekStartDow: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay();
  const diff = (dow - workweekStartDow + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Apply daily + weekly OT rules to a set of daily worked hours. */
export function applyOvertimeRules(
  workedByDay: Map<string, number>,
  config: OvertimeConfig
): RollupResult {
  const days = Array.from(workedByDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  const daily: DailyHours[] = [];

  // First: daily split
  for (const [workDate, worked] of days) {
    let regular = worked, overtime = 0, doubleOvertime = 0;
    if (config.dailyDoubleOtThreshold != null && worked > config.dailyDoubleOtThreshold) {
      doubleOvertime = worked - config.dailyDoubleOtThreshold;
      regular = config.dailyDoubleOtThreshold;
    }
    if (config.dailyOtThreshold != null && regular > config.dailyOtThreshold) {
      overtime = regular - config.dailyOtThreshold;
      regular = config.dailyOtThreshold;
    }
    daily.push({ workDate, workedHours: worked, regularHours: regular, overtimeHours: overtime, doubleOvertimeHours: doubleOvertime });
  }

  // Then: weekly OT applies to "regular" hours that exceed the weekly threshold across the workweek.
  // We never reduce daily OT below what daily rules already determined.
  const weeks = new Map<string, DailyHours[]>();
  for (const d of daily) {
    const wk = weekKey(d.workDate, config.workweekStartDow);
    const arr = weeks.get(wk) ?? [];
    arr.push(d);
    weeks.set(wk, arr);
  }
  for (const arr of weeks.values()) {
    let runningRegular = 0;
    for (const d of arr) {
      const before = runningRegular;
      const after = before + d.regularHours;
      if (after > config.weeklyOtThreshold) {
        const overflow = after - Math.max(config.weeklyOtThreshold, before);
        const moveToOt = Math.min(overflow, d.regularHours);
        d.regularHours = Math.round((d.regularHours - moveToOt) * 100) / 100;
        d.overtimeHours = Math.round((d.overtimeHours + moveToOt) * 100) / 100;
      }
      runningRegular += d.regularHours;
    }
  }

  const totals = daily.reduce(
    (s, d) => ({
      regular: s.regular + d.regularHours,
      overtime: s.overtime + d.overtimeHours,
      doubleOvertime: s.doubleOvertime + d.doubleOvertimeHours,
      worked: s.worked + d.workedHours,
    }),
    { regular: 0, overtime: 0, doubleOvertime: 0, worked: 0 }
  );
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    daily,
    totals: { regular: r2(totals.regular), overtime: r2(totals.overtime), doubleOvertime: r2(totals.doubleOvertime), worked: r2(totals.worked) },
  };
}

export function rollupPunches(punches: PunchInput[], config: OvertimeConfig): RollupResult {
  return applyOvertimeRules(pairPunchesToDailyHours(punches), config);
}
