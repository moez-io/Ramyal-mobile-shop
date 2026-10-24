export const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw Error("Enter a valid non-negative amount");
  const result = Math.round(n * 100);
  if (!Number.isSafeInteger(result) || result > 100000000000)
    throw Error("Amount is too large");
  return result;
};
export const MIN_DOWN_PAYMENT = money(5000);
export function quote(price, down, months, rate) {
  if (
    ![3, 6, 9, 12].includes(months) ||
    !Number.isSafeInteger(price) ||
    !Number.isSafeInteger(down) ||
    price <= 0 ||
    down < 0 ||
    down >= price ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 1000
  )
    throw Error("Invalid installment terms");
  const financed = price - down,
    markup = Math.round((financed * rate) / 100),
    balance = financed + markup,
    monthly = Math.floor(balance / months);
  return {
    price,
    down,
    months,
    rate,
    financed,
    markup,
    balance,
    total: price + markup,
    monthly,
    final: balance - monthly * (months - 1),
  };
}
export function schedule(q, first) {
  const date = new Date(first + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(first) ||
    !Number.isFinite(+date) ||
    date.toISOString().slice(0, 10) !== first
  )
    throw Error("Invalid first due date");
  return Array.from({ length: q.months }, (_, i) => {
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + i, 1),
    );
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(date.getUTCDate(), last));
    return {
      number: i + 1,
      due: d.toISOString().slice(0, 10),
      amount: i === q.months - 1 ? q.final : q.monthly,
    };
  });
}
export function allocations(rows, payments) {
  let left = payments.reduce((s, p) => s + p.amount, 0);
  return rows.map((r) => {
    const paid = Math.min(left, r.amount);
    left -= paid;
    return { ...r, paid, remaining: r.amount - paid };
  });
}
