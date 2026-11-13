// NeuralWatt: `GET https://api.neuralwatt.com/v1/quota` with $NEURALWATT_API_KEY
// (helpers/neuralwatt-usage.sh). Two windows: the API key's weekly dollar allowance
// and the daily free-energy quota. `subscription` is null on this account, so there is
// no subscription window; `balance.credits_*` (prepaid, no reset) is deliberately not
// a window either — see README. Every division is guarded: a zero or absent denominator
// drops its window, and no window at all is an error, never an empty ok.
import { makeWindow, okReport, errorReport, toEpoch } from "../lib/report.js";

const SOURCE = "neuralwatt.com";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v) => Math.max(0, Math.min(100, v));

export function parse(text, now) {
  let d;
  try {
    d = JSON.parse(String(text ?? ""));
  } catch {
    return errorReport(SOURCE, "No reply from NeuralWatt", now);
  }
  const windows = [];

  const limitUsd = num(d?.key?.allowance?.limit_usd);
  const spentUsd = num(d?.key?.allowance?.spent_usd);
  if (limitUsd != null && limitUsd > 0 && spentUsd != null) {
    windows.push(makeWindow({
      id: "key-weekly",
      short: "wk",
      long: "Key allowance · weekly",
      percent: pct((spentUsd / limitUsd) * 100),
      resetsAt: toEpoch(d.key.allowance.reset_at),
    }));
  }

  const included = num(d?.daily_free_energy?.kwh_included);
  const used = num(d?.daily_free_energy?.kwh_used);
  if (included != null && included > 0 && used != null) {
    windows.push(makeWindow({
      id: "daily-energy",
      short: "kWh",
      long: "Daily free energy",
      percent: pct((used / included) * 100),
      resetsAt: toEpoch(d.daily_free_energy.reset_at),
    }));
  }

  if (!windows.length) return errorReport(SOURCE, "No quotas in NeuralWatt's reply", now);
  return okReport(SOURCE, now, windows, d?.limits?.rate_limit_tier ?? null);
}

export default {
  id: "neuralwatt",
  name: "NeuralWatt",
  icon: "mods/usage-limits/icons/neuralwatt.svg", // svg() resolves from Herdr's home root, so the mod's folder is named
  // no tint: the bolt carries the brand orange (#D55934), so it is drawn as an image.
  helper: "helpers/neuralwatt-usage.sh",
  parse,
};
