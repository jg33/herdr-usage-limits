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

// Shape B: plan limits — `remaining_percent` is what is *left*, so used = 100 − remaining.
test("plan fixture → two windows, session 43% and weekly 90% used", () => {
  const r = ollama.parse(read("ollama-balance-plan.json"), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.source, "ollama.com");
  assert.equal(r.windows.length, 2);
  const [session, weekly] = r.windows;
  assert.deepEqual([session.id, session.short, session.long], ["session", "sess", "Session"]);
  assert.equal(session.percent, 43); // 100 − 56.54 = 43.46, rounded once in makeWindow
  assert.equal(session.resetsAt, Math.floor(Date.parse("2026-11-14T01:00:00Z") / 1000));
  assert.deepEqual([weekly.id, weekly.short, weekly.long], ["weekly", "wk", "Weekly"]);
  assert.equal(weekly.percent, 90); // 100 − 10.34 = 89.66
  assert.equal(weekly.resetsAt, Math.floor(Date.parse("2026-11-16T00:00:00Z") / 1000));
});

test("plan remaining_percent outside 0..100 → clamped, no escaped percentage", () => {
  for (const [rem, want] of [[150, 0], [-10, 100]]) {
    const text = JSON.stringify({ included: { session: { remaining_percent: rem, resets_at: null } }, purchased: { balance_usd: 0 } });
    const r = ollama.parse(text, NOW);
    assert.equal(r.status, "ok");
    assert.equal(r.windows.length, 1);
    assert.equal(r.windows[0].percent, want, `remaining ${rem}`);
    assert.ok(r.windows[0].percent >= 0 && r.windows[0].percent <= 100);
  }
});

test("plan session present, weekly missing → one window, no crash", () => {
  const text = JSON.stringify({ included: { session: { remaining_percent: 56.54, resets_at: "2026-11-14T01:00:00Z" } }, purchased: { balance_usd: 0 } });
  const r = ollama.parse(text, NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.windows.length, 1);
  assert.deepEqual([r.windows[0].id, r.windows[0].percent], ["session", 43]);
});

test("plan numbers missing/non-numeric → the window is omitted, not NaN or 0", () => {
  const text = JSON.stringify({
    included: { session: { remaining_percent: "56.54" }, weekly: { resets_at: "2026-11-16T00:00:00Z" } },
    purchased: { balance_usd: 0 },
  });
  const r = ollama.parse(text, NOW);
  assert.equal(r.status, "unavailable"); // both windows unusable, nothing else to show
  assert.deepEqual(r.windows, []);
});

test("both shapes present → plan windows plus the balance window", () => {
  const text = JSON.stringify({
    included: {
      session: { remaining_percent: 56.54, resets_at: "2026-11-14T01:00:00Z" },
      weekly: { remaining_percent: 10.34, resets_at: "2026-11-16T00:00:00Z" },
      balance_usd: 30,
      allowance_usd: 60,
      period: { until: "2026-11-16T16:48:11Z" },
    },
    purchased: { balance_usd: 0 },
  });
  const r = ollama.parse(text, NOW);
  assert.equal(r.status, "ok");
  assert.deepEqual(r.windows.map((w) => w.id), ["session", "weekly", "balance"]);
  assert.deepEqual(r.windows.map((w) => w.percent), [43, 90, 50]);
  // unusable allowance in a both-shapes reply → plan windows survive, balance is omitted
  const noAllowance = ollama.parse(JSON.stringify({
    included: { session: { remaining_percent: 56.54, resets_at: null }, balance_usd: 30 },
    purchased: { balance_usd: 0 },
  }), NOW);
  assert.deepEqual(noAllowance.windows.map((w) => w.id), ["session"]);
});

test("unrecognised or empty payloads → error/unavailable, total and non-throwing", () => {
  const cases = ["{}", "null", "not json"];
  for (const text of cases) {
    const r = ollama.parse(text, NOW);
    assert.equal(r.status, "error", JSON.stringify(text));
    assert.deepEqual(r.windows, []);
    assert.ok(r.message);
  }
  const bare = ollama.parse(JSON.stringify({ included: {} }), NOW);
  assert.equal(bare.status, "unavailable"); // recognised shape, no usable numbers
  assert.deepEqual(bare.windows, []);
  assert.ok(bare.message);
});
