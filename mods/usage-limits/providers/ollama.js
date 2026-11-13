// Ollama: `GET https://ollama.com/api/balance` with $OLLAMA_API_KEY (helpers/ollama-usage.sh).
// Two live shapes: A — credits ({included:{balance_usd, allowance_usd, period}} → one Balance window),
// B — plan limits ({included:{session:{remaining_percent, resets_at}, weekly:{…}}} → Session + Weekly
// windows where percent used = 100 − remaining). `purchased` may be an object or a plain number.
import { makeWindow, okReport, errorReport, unavailableReport, toEpoch } from "../lib/report.js";

const SOURCE = "ollama.com";
const NO_ALLOWANCE = "No allowance in Ollama's reply";
const NO_REPLY = "No reply from Ollama";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v) => Math.max(0, Math.min(100, v));

export function parse(text, now) {
  let d;
  try {
    d = JSON.parse(String(text ?? ""));
  } catch {
    return errorReport(SOURCE, NO_REPLY, now);
  }
  if (d === null || typeof d !== "object" || Array.isArray(d)) return errorReport(SOURCE, NO_REPLY, now);
  const included = d?.included;
  if (included === null || typeof included !== "object" || Array.isArray(included)) return errorReport(SOURCE, NO_REPLY, now);
  const purchased = d?.purchased;
  // `purchased` may be a scalar or {balance_usd}; absent or unusable counts as 0, never as missing.
  const left =
    typeof purchased === "number" && Number.isFinite(purchased) ? purchased : num(purchased?.balance_usd) ?? 0;

  const windows = [];
  const shapeB = "session" in included || "weekly" in included;
  if (shapeB) {
    // `remaining_percent` is what is left, so used = 100 − remaining, clamped after the complement.
    for (const [key, id, short, long] of [
      ["session", "session", "sess", "Session"],
      ["weekly", "weekly", "wk", "Weekly"],
    ]) {
      if (!(key in included)) continue;
      const remaining = num(included[key]?.remaining_percent);
      if (remaining == null) continue; // missing/non-numeric → omit the window, never NaN or a fabricated 0%
      windows.push(makeWindow({ id, short, long, percent: pct(100 - remaining), resetsAt: toEpoch(included[key]?.resets_at) }));
    }
  }
  const allowance = num(included?.allowance_usd);
  const balance = num(included?.balance_usd);
  if (allowance != null && allowance > 0 && balance != null) {
    // Both shapes: keep the plan windows and append Balance too — purchased money is real,
    // so hiding it would understate what's left; a bad allowance just omits this one window.
    const percent = pct(((allowance - (balance + left)) / allowance) * 100);
    windows.push(makeWindow({ id: "balance", short: "bal", long: "Balance", percent, resetsAt: toEpoch(included?.period?.until) }));
  }
  if (!windows.length) return unavailableReport(SOURCE, NO_ALLOWANCE, now);
  return okReport(SOURCE, now, windows);
}

export default {
  id: "ollama",
  name: "Ollama",
  icon: "mods/usage-limits/icons/ollama.svg", // svg() resolves from Herdr's home root, so the mod's folder is named
  tint: true, // a one-color glyph: drawn in the text color, as Herdr does for its own
  helper: "helpers/ollama-usage.sh",
  parse,
};
