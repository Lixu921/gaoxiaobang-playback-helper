(() => {
  "use strict";

  const DEFAULTS = { enabled: true, background: true, lockRate: true, rate: 1 };
  const RATES = [0.5, 0.75, 0.8, 1, 1.25, 1.5, 1.75, 2];
  let revision = 0;
  let cached;

  function normalize(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULTS.enabled,
      background: typeof input.background === "boolean" ? input.background : DEFAULTS.background,
      lockRate: typeof input.lockRate === "boolean" ? input.lockRate : DEFAULTS.lockRate,
      rate: RATES.includes(input.rate) ? input.rate : DEFAULTS.rate
    };
  }

  function publish() {
    if (!cached) return;
    document.dispatchEvent(new CustomEvent("gxb-playback-helper:settings:v1", {
      detail: JSON.stringify(cached)
    }));
  }

  document.addEventListener("gxb-playback-helper:ready:v1", publish);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    revision += 1;
    cached = normalize(changes.settings.newValue);
    publish();
  });

  const initialRevision = revision;
  chrome.storage.local.get("settings").then((result) => {
    if (revision !== initialRevision) return;
    cached = normalize(result.settings);
    publish();
  }).catch(() => {
    // Fail closed if storage is unavailable; page.js starts disabled.
  });
})();
