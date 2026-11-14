(() => {
  "use strict";

  const SETTINGS_EVENT = "gxb-playback-helper:settings:v1";
  const READY_EVENT = "gxb-playback-helper:ready:v1";
  const RATES = [0.5, 0.75, 0.8, 1, 1.25, 1.5, 1.75, 2];
  const media = HTMLMediaElement.prototype;
  const nativePause = media.pause;
  const rateProperty = Object.getOwnPropertyDescriptor(media, "playbackRate");
  let settings = { enabled: false, background: true, lockRate: true, rate: 1 };
  let userIntentUntil = -1;
  const tracked = new WeakSet();

  function videos() {
    return [...document.querySelectorAll("video")];
  }

  function isBackground() {
    return document.hidden || !document.hasFocus();
  }

  function isProtected(video) {
    return settings.enabled && settings.background && video instanceof HTMLVideoElement
      && !video.paused && !video.ended && !video.error;
  }

  // Preserve native receiver checks when passing calls through to the browser.
  media.pause = function (...args) {
    if (isProtected(this) && isBackground() && performance.now() > userIntentUntil) return;
    return Reflect.apply(nativePause, this, args);
  };

  if (rateProperty?.configurable && rateProperty.get && rateProperty.set) {
    Object.defineProperty(media, "playbackRate", {
      ...rateProperty,
      set(value) {
        const locked = settings.enabled && settings.lockRate && this instanceof HTMLVideoElement;
        return Reflect.apply(rateProperty.set, this, [locked ? settings.rate : value]);
      }
    });
  }

  function enforceRate(video) {
    if (!settings.enabled || !settings.lockRate) return;
    if (video.playbackRate !== settings.rate) {
      try {
        video.playbackRate = settings.rate;
      } catch {
        // Unsupported media implementations remain usable without a speed lock.
      }
    }
  }

  function trackVideos() {
    for (const video of videos()) {
      if (!tracked.has(video)) {
        tracked.add(video);
        for (const type of ["loadedmetadata", "play", "ratechange"]) {
          video.addEventListener(type, () => enforceRate(video));
        }
      }
      enforceRate(video);
    }
  }

  function preserveUserIntent(event) {
    if (!event.isTrusted) return;
    if (event.type === "keydown" && ![" ", "k", "K", "MediaPlayPause", "MediaPause"].includes(event.key)) return;
    userIntentUntil = performance.now() + 1200;
  }

  for (const type of ["pointerdown", "click", "keydown"]) {
    window.addEventListener(type, preserveUserIntent, true);
  }

  // Leave input-element blur, pagehide, unload, and navigation events alone.
  function preservePlayback(event) {
    if (event.target !== window && event.target !== document) return;
    if (!isBackground() || performance.now() <= userIntentUntil) return;
    if (videos().some(isProtected)) event.stopImmediatePropagation();
  }

  window.addEventListener("blur", preservePlayback, true);
  window.addEventListener("visibilitychange", preservePlayback, true);

  document.addEventListener(SETTINGS_EVENT, (event) => {
    if (typeof event.detail !== "string" || event.detail.length > 1000) return;
    try {
      const next = JSON.parse(event.detail);
      if (!next || typeof next !== "object" || !RATES.includes(next.rate)) return;
      if (![next.enabled, next.background, next.lockRate].every((value) => typeof value === "boolean")) return;
      settings = { enabled: next.enabled, background: next.background, lockRate: next.lockRate, rate: next.rate };
      trackVideos();
    } catch {
      // Page-world messages never grant access to extension APIs.
    }
  });

  new MutationObserver(trackVideos).observe(document, { childList: true, subtree: true });
  trackVideos();
  document.dispatchEvent(new Event(READY_EVENT));
})();
