// What the person chose to see on the bar and in the panel.
// Limits are opt-out lists, so anything new shows by itself. Session numbers are opt-in.
// Prefs: { hidden: [providerId], hiddenWindows: ["<providerId>:<windowId>"], showResetTime: bool,
//          showBars: bool, sessionOnBar: ["context"|"calls"|"compactions"] }
//          panelHidden: [providerId|"session"], folded: [providerId], spendOnBar: { [providerId]: bool },
//          enabled: [providerId] (the opt-in providers only: listed = on)
// panelHidden: left out of the hover panel (hidden/hiddenWindows only ever mean "hidden from the bar").
// folded: the provider's panel section shows its header only.
// spendOnBar: explicit per-provider choice for spend on the bar; absent means the provider's default.
// showResetTime: every window shows its time to reset, not only amber and red ones.
// showBars: each limit has its bar when there's room; off, the bar shows numbers only.

// Off until the user enables them: no bar row, no panel group, no fetch.
export const OPT_IN_PROVIDERS = new Set(["ollama", "synthetic", "neuralwatt"]);

const normalize = (p) => ({
  hidden: [...(p?.hidden ?? [])],
  hiddenWindows: [...(p?.hiddenWindows ?? [])],
  showResetTime: p?.showResetTime === true,
  showBars: p?.showBars !== false,
  sessionOnBar: [...(p?.sessionOnBar ?? [])],
  panelHidden: [...(p?.panelHidden ?? [])],
  folded: [...(p?.folded ?? [])],
  spendOnBar: { ...(p?.spendOnBar ?? {}) },
  enabled: [...(p?.enabled ?? [])],
});

// Saved choices win once they exist; until then the layout's props preset them.
export function effectivePrefs(saved, props) {
  return normalize(saved ?? props);
}

export const isEnabled = (prefs, providerId) => !OPT_IN_PROVIDERS.has(providerId) || (prefs.enabled ?? []).includes(providerId);

export function toggleEnabled(prefs, providerId) {
  const n = normalize(prefs);
  return { ...n, enabled: flip(n.enabled, providerId) };
}

export function isShown(prefs, providerId, windowId) {
  if (!isEnabled(prefs, providerId)) return false;
  if (prefs.hidden.includes(providerId)) return false;
  return windowId == null || !prefs.hiddenWindows.includes(`${providerId}:${windowId}`);
}

const flip = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function toggleProvider(prefs, providerId) {
  return { ...normalize(prefs), hidden: flip(prefs.hidden, providerId) };
}

export function toggleWindow(prefs, providerId, windowId) {
  return { ...normalize(prefs), hiddenWindows: flip(prefs.hiddenWindows, `${providerId}:${windowId}`) };
}

export function toggleShowResetTime(prefs) {
  return { ...normalize(prefs), showResetTime: !prefs.showResetTime };
}

export function toggleShowBars(prefs) {
  return { ...normalize(prefs), showBars: !prefs.showBars };
}

export const isOnBar = (prefs, row) => prefs.sessionOnBar.includes(row);

export function toggleOnBar(prefs, row) {
  return { ...normalize(prefs), sessionOnBar: flip(prefs.sessionOnBar, row) };
}

export const inPanel = (prefs, id) => isEnabled(prefs, id) && !(prefs.panelHidden ?? []).includes(id);

export function togglePanel(prefs, id) {
  const n = normalize(prefs);
  return { ...n, panelHidden: flip(n.panelHidden, id) };
}

export const isFolded = (prefs, providerId) => (prefs.folded ?? []).includes(providerId);

export function toggleFolded(prefs, providerId) {
  const n = normalize(prefs);
  return { ...n, folded: flip(n.folded, providerId) };
}

export function spendOnBar(prefs, providerId, byDefault) {
  const v = prefs.spendOnBar?.[providerId];
  return typeof v === "boolean" ? v : byDefault;
}

export function toggleSpendOnBar(prefs, providerId, current) {
  const n = normalize(prefs);
  return { ...n, spendOnBar: { ...n.spendOnBar, [providerId]: !current } };
}
