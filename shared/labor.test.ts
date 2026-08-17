import { test } from "node:test";
import assert from "node:assert/strict";
import { hoursWorked, laborCost, laborPct, type LaborEmployee, type LaborPunch } from "./labor";

const HOUR = 60 * 60 * 1000;
const day = (d: number, h = 0) => new Date(2026, 2, d, h).getTime();

const staff: LaborEmployee[] = [
  { id: "e_ana", name: "Ana", payRate: 2200 },
  { id: "e_bo", name: "Bo", payRate: 0 },
  { id: "e_cy", name: "Cy", payRate: null },
];

test("a closed shift is hours times wage", () => {
  const punches: LaborPunch[] = [{ id: "p1", employeeId: "e_ana", timeIn: day(2, 9), timeOut: day(2, 17) }];
  const summary = laborCost(punches, staff, { now: day(3) });

  assert.equal(summary.hours, 8);
  assert.equal(summary.costCents, 17600, "8 hours at $22.00");
  assert.deepEqual(summary.inProgress, []);
  assert.deepEqual(summary.unclosedPunches, []);
});

test("a punch open for 40 hours is not billed, and is handed back to be fixed", () => {
  // The plan's check. Someone closed up on Friday and forgot to clock out; by Monday the
  // naive now - timeIn is 60 unpaid-looking hours.
  const now = day(4, 1);
  const punches: LaborPunch[] = [{ id: "p_open", employeeId: "e_ana", timeIn: now - 40 * HOUR, timeOut: null }];
  const summary = laborCost(punches, staff, { now });

  assert.equal(summary.hours, 0, "40 hours must not land in the total");
  assert.equal(summary.costCents, 0);
  assert.equal(summary.unclosedPunches.length, 1);
  assert.equal(summary.unclosedPunches[0].employeeName, "Ana", "named, so it can be corrected");
  assert.ok(Math.abs(summary.unclosedPunches[0].hoursOpen - 40) < 0.001);
  assert.deepEqual(summary.inProgress, []);
});

test("someone still on shift counts up to now, and says they are still on it", () => {
  const now = day(2, 15);
  const punches: LaborPunch[] = [{ id: "p_now", employeeId: "e_ana", timeIn: day(2, 9), timeOut: null }];
  const summary = laborCost(punches, staff, { now });

  assert.equal(summary.hours, 6);
  assert.equal(summary.costCents, 13200);
  assert.equal(summary.inProgress.length, 1);
  assert.equal(summary.inProgress[0].punchId, "p_now");
  assert.deepEqual(summary.unclosedPunches, []);
});

test("a shift crossing midnight splits across the two days rather than double-counting", () => {
  // 22:00 to 02:00: four hours, two on each side of midnight.
  const punches: LaborPunch[] = [{ id: "p_night", employeeId: "e_ana", timeIn: day(2, 22), timeOut: day(3, 2) }];
  const now = day(4);

  const whole = hoursWorked(punches, staff, { now });
  const first = hoursWorked(punches, staff, { now, since: day(2), until: day(3) });
  const second = hoursWorked(punches, staff, { now, since: day(3), until: day(4) });

  assert.equal(whole.hours, 4);
  assert.equal(first.hours, 2);
  assert.equal(second.hours, 2);
  assert.equal(first.hours + second.hours, whole.hours, "split, not duplicated and not dropped");
});

test("a punch entirely outside the window contributes nothing", () => {
  const punches: LaborPunch[] = [{ id: "p_old", employeeId: "e_ana", timeIn: day(1, 9), timeOut: day(1, 17) }];
  const summary = laborCost(punches, staff, { now: day(4), since: day(2), until: day(3) });
  assert.equal(summary.hours, 0);
  assert.equal(summary.costCents, 0);
});

test("unpaid staff are known and cost nothing; an unset wage is unknown and is named", () => {
  const punches: LaborPunch[] = [
    { id: "p_bo", employeeId: "e_bo", timeIn: day(2, 9), timeOut: day(2, 13) },
    { id: "p_cy", employeeId: "e_cy", timeIn: day(2, 9), timeOut: day(2, 12) },
  ];
  const summary = laborCost(punches, staff, { now: day(3) });

  assert.equal(summary.hours, 7, "both people worked, whatever they are paid");
  assert.equal(summary.costCents, 0, "the unpaid four hours cost nothing, deliberately");
  assert.equal(summary.hoursWithUnknownRate, 3, "and the three unpriced hours are not folded in");
  assert.deepEqual(summary.unknownRateEmployees, ["Cy"]);
});

test("a punch for an employee who no longer exists is unknown, not free", () => {
  const punches: LaborPunch[] = [{ id: "p_ghost", employeeId: "e_gone", timeIn: day(2, 9), timeOut: day(2, 11) }];
  const summary = laborCost(punches, staff, { now: day(3) });
  assert.equal(summary.hoursWithUnknownRate, 2);
  assert.deepEqual(summary.unknownRateEmployees, ["e_gone"]);
});

test("labour percentage refuses to be stated on unknown cost or no revenue", () => {
  const known = laborCost([{ id: "p1", employeeId: "e_ana", timeIn: day(2, 9), timeOut: day(2, 17) }], staff, { now: day(3) });
  assert.equal(laborPct(known, 88000), 20, "17600 of 88000");
  assert.equal(laborPct(known, 0), null);

  const partly = laborCost([{ id: "p_cy", employeeId: "e_cy", timeIn: day(2, 9), timeOut: day(2, 12) }], staff, { now: day(3) });
  assert.equal(laborPct(partly, 88000), null, "some hours are unpriced, so the ratio would be a lie");
});
