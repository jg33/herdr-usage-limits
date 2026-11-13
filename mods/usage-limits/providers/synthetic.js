// Synthetic: `GET https://api.synthetic.new/v2/quotas` with $SYNTHETIC_API_KEY
// (helpers/synthetic-usage.sh). One window: the weekly plan quota.
// `search.hourly` is deliberately not shown: a 250/hour search cap is noise here.
import { makeWindow, okReport, errorReport, toEpoch } from "../lib/report.js";

const SOURCE = "synthetic.new";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v) => Math.max(0, Math.min(100, v));

export function parse(text, now) {
  let d;
  try {
    d = JSON.parse(String(text ?? ""));
  } catch {
    return errorReport(SOURCE, "No reply from Synthetic", now);
  }
  const windows = [];

  const weekly = num(d?.planWeeklyLimit?.percentRemaining);
  if (weekly != null) {
    windows.push(makeWindow({
      id: "weekly",
      short: "wk",
      long: "Weekly",
      percent: pct(100 - weekly),
      resetsAt: toEpoch(d.planWeeklyLimit.nextRegenAt),
    }));
  }

  if (!windows.length) return errorReport(SOURCE, "No quotas in Synthetic's reply", now);
  return okReport(SOURCE, now, windows);
}

export default {
  id: "synthetic",
  name: "Synthetic",
  icon: "mods/usage-limits/icons/synthetic.svg", // svg() resolves from Herdr's home root, so the mod's folder is named
  // no tint: the glyph carries the brand indigo (#6366F1), so it is drawn as an image.
  helper: "helpers/synthetic-usage.sh",
  parse,
};
