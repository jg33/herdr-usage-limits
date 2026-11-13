import { test } from "node:test";
import assert from "node:assert/strict";
import ollama from "../providers/ollama.js";
import { NOW, read } from "./_util.js";

test("descriptor", () => {
  assert.deepEqual(
    { id: ollama.id, name: ollama.name, icon: ollama.icon, helper: ollama.helper, tint: ollama.tint, kind: ollama.kind },
    { id: "ollama", name: "Ollama", icon: "mods/usage-limits/icons/ollama.svg", helper: "helpers/ollama-usage.sh", tint: true, kind: undefined }, // tint stays: the llama mark is monochrome
  );
});

test("balance fixture → one window, 100% used of a 60 allowance", () => {
  const r = ollama.parse(read("ollama-balance.json"), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.plan, null);
  assert.equal(r.source, "ollama.com");
  assert.equal(r.observedAt, NOW);
  assert.equal(r.windows.length, 1);
  const w = r.windows[0];
  assert.deepEqual([w.id, w.short, w.long, w.percent], ["balance", "bal", "Balance", 100]);
  assert.equal(w.resetsAt, Math.floor(Date.parse("2026-11-16T16:48:11Z") / 1000));
});

test("included plus part-spent balances give the used share", () => {
  const text = JSON.stringify({
    included: { balance_usd: 30, allowance_usd: 60, period: { until: "2026-11-16T16:48:11Z" } },
    purchased: { balance_usd: 15 },
  });
  assert.equal(ollama.parse(text, NOW).windows[0].percent, 25);
});

test("purchased as a plain number counts too", () => {
  const text = JSON.stringify({
    included: { balance_usd: 30, allowance_usd: 60, period: { until: "2026-11-16T16:48:11Z" } },
    purchased: 15,
  });
  assert.equal(ollama.parse(text, NOW).windows[0].percent, 25);
});

test("allowance 0 or negative → unavailable, not a divide by zero", () => {
  for (const allowance of [0, -60]) {
    const r = ollama.parse(JSON.stringify({ included: { balance_usd: 0, allowance_usd: allowance, period: {} }, purchased: { balance_usd: 0 } }), NOW);
    assert.equal(r.status, "unavailable", `allowance ${allowance}`);
    assert.deepEqual(r.windows, []);
    assert.equal(r.message, "No allowance in Ollama's reply");
  }
});

test("a missing included number → unavailable, never a fabricated 0%", () => {
  const noBalance = JSON.stringify({ included: { allowance_usd: 60, period: {} }, purchased: { balance_usd: 0 } });
  const noAllowance = JSON.stringify({ included: { balance_usd: 0, period: {} }, purchased: { balance_usd: 0 } });
  for (const text of [noBalance, noAllowance]) {
    assert.equal(ollama.parse(text, NOW).status, "unavailable");
  }
});

test("no purchased key at all → the same percent as with purchased: 0", () => {
  const included = { balance_usd: 30, allowance_usd: 60, period: { until: "2026-11-16T16:48:11Z" } };
  const zero = ollama.parse(JSON.stringify({ included, purchased: 0 }), NOW);
  assert.equal(zero.status, "ok");
  assert.equal(zero.windows[0].percent, 50);
  for (const d of [{ included }, { included, purchased: {} }]) {
    const r = ollama.parse(JSON.stringify(d), NOW);
    assert.equal(r.status, "ok", JSON.stringify(d));
    assert.equal(r.windows[0].percent, zero.windows[0].percent);
  }
});

test("percent is clamped to 0..100", () => {
  const over = JSON.stringify({ included: { balance_usd: 70, allowance_usd: 60, period: {} }, purchased: { balance_usd: 0 } });
  assert.equal(ollama.parse(over, NOW).windows[0].percent, 0, "more left than the allowance: 0, not negative");
  const under = JSON.stringify({ included: { balance_usd: -10, allowance_usd: 60, period: {} }, purchased: { balance_usd: 0 } });
  assert.equal(ollama.parse(under, NOW).windows[0].percent, 100, "more than the allowance spent: 100, not above");
});

test("missing period.until → a window with no reset, still ok", () => {
  const text = JSON.stringify({ included: { balance_usd: 30, allowance_usd: 60 }, purchased: { balance_usd: 0 } });
  assert.equal(ollama.parse(text, NOW).windows[0].resetsAt, null);
});

test("malformed or empty input → a non-ok report, never a throw", () => {
  for (const text of ["not json", "", "42", "null"]) {
    const r = ollama.parse(text, NOW);
    assert.equal(r.status, "error", JSON.stringify(text));
    assert.deepEqual(r.windows, []);
    assert.ok(r.message);
  }
});
