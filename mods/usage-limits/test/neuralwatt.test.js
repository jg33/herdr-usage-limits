import { test } from "node:test";
import assert from "node:assert/strict";
import neuralwatt from "../providers/neuralwatt.js";
import { NOW, read } from "./_util.js";

const quota = (over = {}) => JSON.stringify({
  balance: { credits_remaining_usd: 0.0, total_credits_usd: 41.0, credits_used_usd: 41.0, accounting_method: "energy" },
  limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
  subscription: null,
  daily_free_energy: { kwh_included: 0.1, kwh_used: 0.1, kwh_remaining: 0.0, reset_at: "2026-11-14T00:00:00Z" },
  key: { name: "M2 Studio", allowance: { limit_usd: 20.0, period: "weekly", spent_usd: 4.144047, remaining_usd: 15.855953, blocked: false, reset_at: "2026-11-16T00:00:00Z" } },
  ...over,
});

test("descriptor", () => {
  assert.deepEqual(
    { id: neuralwatt.id, name: neuralwatt.name, icon: neuralwatt.icon, helper: neuralwatt.helper, tint: neuralwatt.tint, kind: neuralwatt.kind },
    { id: "neuralwatt", name: "NeuralWatt", icon: "mods/usage-limits/icons/neuralwatt.svg", helper: "helpers/neuralwatt-usage.sh", tint: undefined, kind: undefined },
  );
});

test("quota fixture → key allowance 21, daily energy 100, plan standard", () => {
  const r = neuralwatt.parse(read("neuralwatt-quota.json"), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.plan, "standard");
  assert.equal(r.source, "neuralwatt.com");
  assert.equal(r.observedAt, NOW);
  assert.deepEqual(r.windows.map((w) => [w.id, w.short, w.long, w.percent]), [
    ["key-weekly", "wk", "Key allowance · weekly", 21],
    ["daily-energy", "kWh", "Daily free energy", 100],
  ]);
  assert.equal(r.windows[0].resetsAt, Math.floor(Date.parse("2026-11-16T00:00:00Z") / 1000));
  assert.equal(r.windows[1].resetsAt, Math.floor(Date.parse("2026-11-14T00:00:00Z") / 1000));
});

test("subscription is null and prepaid credits are not a window", () => {
  const r = neuralwatt.parse(read("neuralwatt-quota.json"), NOW);
  assert.deepEqual(r.windows.map((w) => w.id), ["key-weekly", "daily-energy"], "no subscription, no balance window");
});

test("zero kwh_included → the daily-energy window is omitted", () => {
  const r = neuralwatt.parse(quota({ daily_free_energy: { kwh_included: 0, kwh_used: 0, kwh_remaining: 0, reset_at: "2026-11-14T00:00:00Z" } }), NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.windows.map((w) => w.id), ["key-weekly"]);
});

test("zero limit_usd → the key-weekly window is omitted", () => {
  const r = neuralwatt.parse(quota({ key: { name: "M2 Studio", allowance: { limit_usd: 0, spent_usd: 0, reset_at: "2026-11-16T00:00:00Z" } } }), NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.windows.map((w) => w.id), ["daily-energy"]);
});

test("no usable window → error, not an empty ok", () => {
  const r = neuralwatt.parse(quota({
    limits: { overage_limit_usd: null, rate_limit_tier: "standard" },
    daily_free_energy: { kwh_included: 0, kwh_used: 0, reset_at: "2026-11-14T00:00:00Z" },
    key: { name: "M2 Studio", allowance: { limit_usd: 0, spent_usd: 0, reset_at: "2026-11-16T00:00:00Z" } },
  }), NOW);
  assert.equal(r.status, "error");
  assert.deepEqual(r.windows, []);
  assert.ok(r.message);
});

test("percent is clamped to 0..100", () => {
  const over = neuralwatt.parse(quota({ key: { name: "x", allowance: { limit_usd: 20, spent_usd: 30, reset_at: "2026-11-16T00:00:00Z" } } }), NOW);
  assert.equal(over.windows.find((w) => w.id === "key-weekly").percent, 100);
  const under = neuralwatt.parse(quota({ key: { name: "x", allowance: { limit_usd: 20, spent_usd: -5, reset_at: "2026-11-16T00:00:00Z" } } }), NOW);
  assert.equal(under.windows.find((w) => w.id === "key-weekly").percent, 0);
  const daily = neuralwatt.parse(quota({ daily_free_energy: { kwh_included: 0.1, kwh_used: 1, reset_at: "2026-11-14T00:00:00Z" } }), NOW);
  assert.equal(daily.windows.find((w) => w.id === "daily-energy").percent, 100);
});

test("a missing rate_limit_tier → plan null, windows unaffected", () => {
  const r = neuralwatt.parse(quota({ limits: { overage_limit_usd: null, rate_limit_tier: null } }), NOW);
  assert.equal(r.plan, null);
  assert.equal(r.status, "ok");
});

test("malformed or empty input → a non-ok report, never a throw", () => {
  for (const text of ["not json", "", "42", "null", "{}"]) {
    const r = neuralwatt.parse(text, NOW);
    assert.equal(r.status, "error", JSON.stringify(text));
    assert.deepEqual(r.windows, []);
    assert.ok(r.message);
  }
});
