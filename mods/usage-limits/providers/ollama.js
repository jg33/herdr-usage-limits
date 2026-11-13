// Ollama: `GET https://ollama.com/api/balance` with $OLLAMA_API_KEY (helpers/ollama-usage.sh).
// The reply holds a rolling allowance plus a purchased balance; both count as money left,
// and `purchased` has been seen as an object and may be a plain number.
import { makeWindow, okReport, errorReport, unavailableReport, toEpoch } from "../lib/report.js";

const SOURCE = "ollama.com";
const NO_ALLOWANCE = "No allowance in Ollama's reply";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v) => Math.max(0, Math.min(100, v));

export function parse(text, now) {
  let d;
  try {
    d = JSON.parse(String(text ?? ""));
  } catch {
    return errorReport(SOURCE, "No reply from Ollama", now);
  }
  if (d === null || typeof d !== "object" || Array.isArray(d)) return errorReport(SOURCE, "No reply from Ollama", now);
  const included = d?.included;
  const purchased = d?.purchased;
  const allowance = num(included?.allowance_usd);
  const balance = num(included?.balance_usd);
  // `purchased` may be a scalar or {balance_usd}; absent or unusable counts as 0, never as missing.
  const left =
    typeof purchased === "number" && Number.isFinite(purchased) ? purchased : num(purchased?.balance_usd) ?? 0;
  if (allowance == null || balance == null) return unavailableReport(SOURCE, NO_ALLOWANCE, now);
  if (allowance <= 0) return unavailableReport(SOURCE, NO_ALLOWANCE, now);
  const percent = pct(((allowance - (balance + left)) / allowance) * 100);
  return okReport(SOURCE, now, [
    makeWindow({ id: "balance", short: "bal", long: "Balance", percent, resetsAt: toEpoch(included?.period?.until) }),
  ]);
}

export default {
  id: "ollama",
  name: "Ollama",
  icon: "mods/usage-limits/icons/ollama.svg", // svg() resolves from Herdr's home root, so the mod's folder is named
  tint: true, // a one-color glyph: drawn in the text color, as Herdr does for its own
  helper: "helpers/ollama-usage.sh",
  parse,
};
