/**
 * Hours and labour cost from time punches — the second-biggest number in a restaurant,
 * and until Feature 14 T1 nobody could even type the wage it multiplies.
 *
 * Pure over `TimePunch` and `Employee`. The interesting part is not the multiply; it is
 * what to do about a punch nobody closed, which is why nothing here returns a bare
 * number.
 */

export type LaborPunch = {
  id: string;
  employeeId: string;
  timeIn: number;
  timeOut: number | null;
};

export type LaborEmployee = {
  id: string;
  name: string;
  /** Cents per hour. `0` means explicitly unpaid; `null`/absent means nobody has said. */
  payRate: number | null;
};

export type LaborWindow = {
  since?: number;
  until?: number;
  /** "Now", for counting a punch that is still open. Callers pass it so this stays pure. */
  now: number;
  /**
   * How long an open punch can run before it is treated as abandoned rather than worked.
   * A closing shift nobody clocked out of is 60 unpaid-looking hours by Monday; billing
   * them is worse than refusing to.
   */
  unclosedCutoffMs?: number;
};

export const DEFAULT_UNCLOSED_CUTOFF_MS = 16 * 60 * 60 * 1000;

export type OpenPunch = {
  punchId: string;
  employeeId: string;
  employeeName: string;
  timeIn: number;
  hoursOpen: number;
};

export type HoursSummary = {
  /** Hours actually counted: closed punches clamped to the window, plus open ones still running. */
  hours: number;
  /** Open punches inside the cutoff, counted up to `now`. */
  inProgress: OpenPunch[];
  /**
   * Open longer than the cutoff. **Not counted** — the operator has to say what happened,
   * the same way Feature 10 names unpriced ingredients instead of costing them at zero.
   */
  unclosedPunches: OpenPunch[];
};

export type LaborSummary = HoursSummary & {
  /** Cost of the hours whose rate is known. Unpaid staff are known, and cost nothing. */
  costCents: number;
  /** Hours worked by people whose rate nobody has set — real hours, unknown cost. */
  hoursWithUnknownRate: number;
  /** Who those people are, so the gap is fixable rather than merely flagged. */
  unknownRateEmployees: string[];
};

const HOUR_MS = 60 * 60 * 1000;

/** Overlap of [start, end) with the window, in hours. Zero when they do not overlap. */
function overlapHours(start: number, end: number, window: LaborWindow): number {
  const from = Math.max(start, window.since ?? -Infinity);
  const to = Math.min(end, window.until ?? Infinity);
  return to > from ? (to - from) / HOUR_MS : 0;
}

/**
 * Hours in the window, and an explicit account of every punch that is still open.
 *
 * Punches are clamped to the window rather than counted whole, so a shift spanning
 * midnight splits across the two days instead of being double-counted or dropped.
 */
export function hoursWorked(
  punches: LaborPunch[],
  employees: LaborEmployee[],
  window: LaborWindow,
): HoursSummary {
  const cutoff = window.unclosedCutoffMs ?? DEFAULT_UNCLOSED_CUTOFF_MS;
  const nameOf = (employeeId: string) =>
    employees.find(e => e.id === employeeId)?.name ?? employeeId;

  let hours = 0;
  const inProgress: OpenPunch[] = [];
  const unclosedPunches: OpenPunch[] = [];

  for (const punch of punches) {
    if (punch.timeOut != null) {
      hours += overlapHours(punch.timeIn, punch.timeOut, window);
      continue;
    }

    const open: OpenPunch = {
      punchId: punch.id,
      employeeId: punch.employeeId,
      employeeName: nameOf(punch.employeeId),
      timeIn: punch.timeIn,
      hoursOpen: Math.max(0, (window.now - punch.timeIn) / HOUR_MS),
    };

    if (window.now - punch.timeIn > cutoff) {
      unclosedPunches.push(open);
      continue;
    }

    inProgress.push(open);
    hours += overlapHours(punch.timeIn, window.now, window);
  }

  return { hours, inProgress, unclosedPunches };
}

/**
 * What those hours cost.
 *
 * Named `laborCost` rather than `laborCostCents` because it returns a record: a bare
 * number could not say that some of the hours belong to someone whose wage nobody set.
 * Those hours are real and are reported as hours; they are simply not priced, and the
 * people are named so the gap can be closed.
 */
export function laborCost(
  punches: LaborPunch[],
  employees: LaborEmployee[],
  window: LaborWindow,
): LaborSummary {
  const summary = hoursWorked(punches, employees, window);
  const cutoff = window.unclosedCutoffMs ?? DEFAULT_UNCLOSED_CUTOFF_MS;
  const abandoned = new Set(summary.unclosedPunches.map(p => p.punchId));

  let costCents = 0;
  let hoursWithUnknownRate = 0;
  const unknownRateEmployees: string[] = [];

  for (const punch of punches) {
    if (abandoned.has(punch.id)) continue;
    const end = punch.timeOut ?? window.now;
    if (punch.timeOut == null && window.now - punch.timeIn > cutoff) continue;

    const punchHours = overlapHours(punch.timeIn, end, window);
    if (punchHours === 0) continue;

    const employee = employees.find(e => e.id === punch.employeeId);
    // A punch whose employee is gone is unknown, not free — same rule as everywhere else.
    if (!employee || employee.payRate == null) {
      hoursWithUnknownRate += punchHours;
      const name = employee?.name ?? punch.employeeId;
      if (!unknownRateEmployees.includes(name)) unknownRateEmployees.push(name);
      continue;
    }

    costCents += punchHours * employee.payRate;
  }

  return { ...summary, costCents: Math.round(costCents), hoursWithUnknownRate, unknownRateEmployees };
}

/**
 * Labour as a share of revenue, or null when it cannot be stated — no revenue to divide
 * by, or hours whose cost nobody knows. A labour percentage with a guessed numerator is
 * the same lie as a margin with a guessed cost.
 */
export function laborPct(summary: LaborSummary, revenueCents: number): number | null {
  if (revenueCents <= 0 || summary.hoursWithUnknownRate > 0) return null;
  return (summary.costCents / revenueCents) * 100;
}

export type ScheduleShift = {
  employeeId: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

export type EmployeeWeek = {
  employeeId: string;
  employeeName: string;
  scheduledHours: number;
  actualHours: number;
  /** Actual minus scheduled: positive means more was paid than was rostered. */
  varianceHours: number;
  /** Null when nobody has set this person's rate — hours are still reported. */
  scheduledCostCents: number | null;
  actualCostCents: number | null;
  /** Open punches for this person that were not counted, so the row is not read as final. */
  unclosedPunches: OpenPunch[];
};

/**
 * Rostered against paid, per employee, for one week.
 *
 * "You rostered 38 hours and paid 44" is the most actionable labour number a small
 * operator gets. Everyone who appears in *either* list gets a row: a shift nobody turned
 * up for is the whole point, so it shows as variance rather than being omitted, and a
 * punch nobody rostered shows the other way.
 */
export function scheduledVsActual(
  shifts: ScheduleShift[],
  punches: LaborPunch[],
  employees: LaborEmployee[],
  window: LaborWindow,
): EmployeeWeek[] {
  const employeeIds: string[] = [];
  for (const id of [...shifts.map(s => s.employeeId), ...punches.map(p => p.employeeId)]) {
    if (!employeeIds.includes(id)) employeeIds.push(id);
  }

  return employeeIds
    .map(employeeId => {
      const employee = employees.find(e => e.id === employeeId);
      const rate = employee?.payRate ?? null;

      const scheduledHours = shifts
        .filter(s => s.employeeId === employeeId)
        .reduce((total, s) => total + Math.max(0, s.endMinutes - s.startMinutes) / 60, 0);

      const actual = laborCost(punches.filter(p => p.employeeId === employeeId), employees, window);

      return {
        employeeId,
        employeeName: employee?.name ?? employeeId,
        scheduledHours,
        actualHours: actual.hours,
        varianceHours: actual.hours - scheduledHours,
        scheduledCostCents: rate == null ? null : Math.round(scheduledHours * rate),
        actualCostCents: rate == null ? null : actual.costCents,
        unclosedPunches: actual.unclosedPunches,
      };
    })
    // Biggest overrun first: the row that cost money nobody planned to spend.
    .sort((a, b) => b.varianceHours - a.varianceHours);
}
