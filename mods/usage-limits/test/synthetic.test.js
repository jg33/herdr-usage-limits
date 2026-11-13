import { test } from "node:test";
import assert from "node:assert/strict";
import synthetic from "../providers/synthetic.js";
import { NOW, read } from "./_util.js";

const quotas = (over = {}) => JSON.stringify({
  subscription: { limit: 500, requests: 0, renewsAt: "2026-11-14T02:10:41.743Z" },
  search: { hourly: { limit: 250, requests: 0, renewsAt: "2026-11-13T22:10:41.743Z" } },
  planWeeklyLimit: { nextRegenAt: "2026-11-14T00:20:53.000Z", percentRemaining: 90.59952253495715 },
  ...over,
});

test("descriptor", () => {
  assert.deepEqual(
    { id: synthetic.id, name: synthetic.name, icon: synthetic.icon, helper: synthetic.helper, tint: synthetic.tint, kind: synthetic.kind },
    { id: "synthetic", name: "Synthetic", icon: "mods/usage-limits/icons/synthetic.svg", helper: "helpers/synthetic-usage.sh", tint: undefined, kind: undefined },
  );
});

test("quotas fixture → exactly one window: weekly 9", () => {
  const r = synthetic.parse(read("synthetic-quotas.json"), NOW);
  assert.equal(r.status, "ok");
  assert.equal(r.plan, null);
  assert.equal(r.source, "synthetic.new");
  assert.equal(r.observedAt, NOW);
  assert.deepEqual(r.windows.map((w) => [w.id, w.short, w.long, w.percent]), [
    ["weekly", "wk", "Weekly", 9],
  ]);
  assert.equal(r.windows[0].resetsAt, Math.floor(Date.parse("2026-11-14T00:20:53.000Z") / 1000));
});

test("search.hourly is deliberately not shown", () => {
  const r = synthetic.parse(read("synthetic-quotas.json"), NOW);
  assert.equal(r.windows.some((w) => w.id.includes("search") || w.short === "hr"), false);
  assert.deepEqual(r.windows.map((w) => w.id), ["weekly"]);
});

test("no usable window → error, not an empty ok", () => {
  assert.equal(synthetic.parse(quotas({ planWeeklyLimit: null }), NOW).status, "error");
  assert.equal(synthetic.parse(quotas({ planWeeklyLimit: {} }), NOW).status, "error");
  const r = synthetic.parse("{}", NOW);
  assert.equal(r.status, "error");
  assert.deepEqual(r.windows, []);
});

test("weekly only in the reply → one window", () => {
  const r = synthetic.parse(JSON.stringify({ planWeeklyLimit: { nextRegenAt: "2026-11-14T00:20:53.000Z", percentRemaining: 40 } }), NOW);
  assert.deepEqual(r.windows.map((w) => [w.id, w.percent]), [["weekly", 60]]);
});

test("percent is clamped to 0..100", () => {
  const spent = synthetic.parse(quotas({ planWeeklyLimit: { nextRegenAt: "2026-11-14T00:20:53.000Z", percentRemaining: -5 } }), NOW);
  assert.equal(spent.windows[0].percent, 100, "a negative remaining is 100% used, not 105");
  const extra = synthetic.parse(quotas({ planWeeklyLimit: { nextRegenAt: "2026-11-14T00:20:53.000Z", percentRemaining: 120 } }), NOW);
  assert.equal(extra.windows[0].percent, 0, "more remaining than 100% is 0 used, not negative");
});

test("malformed or empty input → a non-ok report, never a throw", () => {
  for (const text of ["not json", "", "42", "null", "{}"]) {
    const r = synthetic.parse(text, NOW);
    assert.equal(r.status, "error", JSON.stringify(text));
    assert.deepEqual(r.windows, []);
    assert.ok(r.message);
  }
});
