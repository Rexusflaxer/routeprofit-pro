import assert from "node:assert/strict";

function cents(quantityMillis, unitPriceCents) {
  return Math.round((quantityMillis * unitPriceCents) / 1000);
}

function vatCents(netCents, rateBps) {
  return Math.round((netCents * rateBps) / 10_000);
}

function resolveRate(rates, execution) {
  const eligible = rates.filter(rate => {
    if (rate.status && rate.status !== "active") return false;
    if (rate.company_id !== execution.selling_company_id) return false;
    if (rate.service_type !== execution.service_type) return false;
    if (rate.valid_from && rate.valid_from > execution.execution_date) return false;
    if (rate.valid_until && rate.valid_until < execution.execution_date) return false;
    if (rate.object_id && rate.object_id !== execution.object_id) return false;
    if (rate.collective_id && rate.collective_id !== execution.collective_id) return false;
    return true;
  });
  if (eligible.length === 0) return { status: "blocked", reason: "rate_gap" };
  if (eligible.length > 1) return { status: "blocked", reason: "rate_overlap" };
  return { status: "ready", rate: eligible[0] };
}

function sanitize(value, blocked = [
  "gps",
  "latitude",
  "longitude",
  "employee",
  "personnel",
  "internal",
  "alarm",
  "secret",
  "file_url",
  "file_uri",
  "metadata",
  "exif",
]) {
  if (Array.isArray(value)) return value.map(item => sanitize(item, blocked));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !blocked.some(item => normalized === item || normalized.startsWith(`${item}_`));
    })
    .map(([key, item]) => [key, sanitize(item, blocked)]));
}

function createAllocator(start = 0) {
  let value = start;
  const reservations = new Map();
  return async key => {
    if (reservations.has(key)) return reservations.get(key);
    value += 1;
    const number = `2026-${String(value).padStart(6, "0")}`;
    reservations.set(key, number);
    return number;
  };
}

function applySignhostStatus(current, incoming) {
  if (current === "signed") return "signed";
  if (incoming === "signed") return "signed";
  return incoming;
}

const mixedVatLines = [
  { quantity_millis: 2_500, unit_price_cents: 3_995, vat_rate_bps: 2_100 },
  { quantity_millis: 1_000, unit_price_cents: 1_250, vat_rate_bps: 900 },
  { quantity_millis: 3_000, unit_price_cents: 333, vat_rate_bps: 0 },
];
const calculated = mixedVatLines.map(line => {
  const net = cents(line.quantity_millis, line.unit_price_cents);
  return { ...line, net, vat: vatCents(net, line.vat_rate_bps) };
});
assert.deepEqual(calculated.map(line => line.net), [9_988, 1_250, 999]);
assert.deepEqual(calculated.map(line => line.vat), [2_097, 113, 0]);
assert.equal(calculated.reduce((sum, line) => sum + line.net + line.vat, 0), 14_447);

const execution = {
  execution_date: "2026-07-29",
  selling_company_id: "company-a",
  object_id: "object-a",
  collective_id: null,
  service_type: "mobile_surveillance",
};
const baseRate = {
  id: "rate-a",
  company_id: "company-a",
  object_id: "object-a",
  service_type: "mobile_surveillance",
  valid_from: "2026-01-01",
  valid_until: "2026-12-31",
  status: "active",
};
assert.equal(resolveRate([baseRate], execution).status, "ready");
assert.equal(resolveRate([], execution).reason, "rate_gap");
assert.equal(resolveRate([baseRate, { ...baseRate, id: "rate-b" }], execution).reason, "rate_overlap");
assert.equal(resolveRate([{ ...baseRate, company_id: "company-b" }], execution).reason, "rate_gap");

const sanitized = sanitize({
  title: "Goedgekeurd rapport",
  gps: { latitude: 52, longitude: 5 },
  internal_note: "Niet publiceren",
  employee_id: "person-1",
  attachments: [{ name: "rapport.pdf", file_url: "https://raw.example" }],
});
assert.deepEqual(sanitized, {
  title: "Goedgekeurd rapport",
  attachments: [{ name: "rapport.pdf" }],
});

const allocate = createAllocator(700);
const keys = Array.from({ length: 100 }, (_, index) => `issue-${index}`);
const numbers = await Promise.all(keys.map(key => allocate(key)));
assert.equal(new Set(numbers).size, 100);
assert.equal(numbers[0], "2026-000701");
assert.equal(numbers.at(-1), "2026-000800");
assert.equal(await allocate("issue-42"), numbers[42]);

assert.equal(applySignhostStatus("in_progress", "signed"), "signed");
assert.equal(applySignhostStatus("signed", "in_progress"), "signed");
assert.equal(applySignhostStatus("signed", "rejected"), "signed");

console.log("Klantplatform domeinverificatie: OK");
