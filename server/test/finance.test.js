import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quote,
  schedule,
  allocations,
  money,
  MIN_DOWN_PAYMENT,
} from "../finance.js";
test("six-month example", () => {
  const q = quote(10000000, 2500000, 6, 12);
  assert.equal(q.markup, 900000);
  assert.equal(q.monthly, 1400000);
  assert.equal(q.total, 10900000);
});
test("all durations and exact rounding", () => {
  for (const n of [3, 6, 9, 12]) {
    const q = quote(10001, 1000, n, 7.5),
      rows = schedule(q, "2026-01-31");
    assert.equal(
      rows.reduce((s, r) => s + r.amount, 0),
      q.balance,
    );
    assert.equal(rows[1].due, "2026-02-28");
    assert.equal(rows[2].due, "2026-03-31");
    assert.equal(rows.length, n);
    if (n === 12) assert.equal(rows[11].due, "2026-12-31");
  }
});
test("zero markup", () => {
  const q = quote(10000, 1000, 3, 0);
  assert.equal(q.markup, 0);
  assert.equal(q.total, 10000);
});
test("minimum installment down payment is PKR 5,000", () =>
  assert.equal(MIN_DOWN_PAYMENT, 500000));
test("invalid terms rejected", () => {
  for (const args of [
    [10000, 10000, 3, 1],
    [10000, -1, 3, 1],
    [10000, 100, 4, 1],
    [10000, 100, 3, -1],
  ])
    assert.throws(() => quote(...args));
  assert.throws(() => money("bad"));
});
test("partial and advance payments allocate oldest first", () => {
  const rows = [
    { amount: 100, due: "2026-01-01" },
    { amount: 100, due: "2026-02-01" },
  ];
  assert.deepEqual(
    allocations(rows, [{ amount: 150 }]).map((r) => r.remaining),
    [0, 50],
  );
  assert.deepEqual(
    allocations(rows, [{ amount: 50 }]).map((r) => r.paid),
    [50, 0],
  );
});
test("leap year month end", () =>
  assert.equal(
    schedule(quote(10000, 1000, 3, 0), "2028-01-31")[1].due,
    "2028-02-29",
  ));
