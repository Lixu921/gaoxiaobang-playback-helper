"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "src/page.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(root, "src/bridge.js"), "utf8");
const defaults = { enabled: true, background: true, lockRate: true, rate: 1 };

function environment() {
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }
    dispatchEvent(event) {
      event.target ??= this;
      event.stopImmediatePropagation ??= () => { event.stopped = true; };
      for (const handler of this.listeners.get(event.type) ?? []) {
        handler(event);
        if (event.stopped) break;
      }
      return true;
    }
  }
  class Media extends Target {
    constructor() { super(); this.paused = false; this.ended = false; this.error = null; this._rate = 0.8; this.pauseCalls = 0; }
    pause() { if (!(this instanceof Media)) throw new TypeError("Illegal invocation"); this.paused = true; this.pauseCalls++; }
    get playbackRate() { return this._rate; }
    set playbackRate(value) { if (!(this instanceof Media)) throw new TypeError("Illegal invocation"); this._rate = Number(value); }
  }
  class Video extends Media {}
  const document = new Target();
  const window = new Target();
  document.hidden = false;
  document.focused = true;
  document.hasFocus = () => document.focused;
  document.videos = [new Video()];
  document.querySelectorAll = () => document.videos;
  let mutation;
  let now = 2000;
  const context = vm.createContext({
    document, window, HTMLMediaElement: Media, HTMLVideoElement: Video,
    performance: { now: () => now },
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} }
  });
  const run = (source) => vm.runInContext(source, context);
  const settings = (value = {}) => document.dispatchEvent({ type: "gxb-playback-helper:settings:v1", detail: JSON.stringify({ ...defaults, ...value }) });
  const hidden = () => { document.hidden = true; document.focused = false; };
  return { context, run, document, window, Video, Media, settings, hidden, mutation: () => mutation(), tick: (ms) => { now += ms; }, video: document.videos[0] };
}

test("starts disabled until extension settings arrive", () => {
  const e = environment(); e.run(pageSource); e.hidden(); e.video.pause();
  assert.equal(e.video.paused, true);
});

test("blocks background script pauses but never starts a paused video", () => {
  const e = environment(); e.run(pageSource); e.settings(); e.hidden(); e.video.pause();
  assert.equal(e.video.paused, false);
  e.video.paused = true; e.video.pause();
  assert.equal(e.video.pauseCalls, 1);
});

test("foreground pause, ended videos and media errors pass through", () => {
  for (const state of ["foreground", "ended", "error"]) {
    const e = environment(); e.run(pageSource); e.settings();
    if (state !== "foreground") e.hidden();
    if (state === "ended") e.video.ended = true;
    if (state === "error") e.video.error = { code: 3 };
    e.video.pause(); assert.equal(e.video.paused, true, state);
  }
});

test("trusted pause interactions pass through, synthetic ones do not", () => {
  for (const [isTrusted, allowed] of [[true, true], [false, false]]) {
    const e = environment(); e.run(pageSource); e.settings(); e.hidden();
    e.window.dispatchEvent({ type: "keydown", key: " ", isTrusted });
    e.video.pause(); assert.equal(e.video.paused, allowed);
  }
});

test("user intent grace period expires", () => {
  const e = environment(); e.run(pageSource); e.settings(); e.hidden();
  e.window.dispatchEvent({ type: "click", isTrusted: true }); e.tick(1201); e.video.pause();
  assert.equal(e.video.paused, false);
});

test("disabling background protection or the extension restores pauses", () => {
  for (const value of [{ background: false }, { enabled: false }]) {
    const e = environment(); e.run(pageSource); e.settings(value); e.hidden(); e.video.pause();
    assert.equal(e.video.paused, true);
  }
});

test("audio and invalid native receivers retain native behavior", () => {
  const e = environment(); e.run(pageSource); e.settings(); e.hidden();
  const audio = new e.Media(); audio.pause(); assert.equal(audio.paused, true);
  assert.throws(() => e.Media.prototype.pause.call({}), /Illegal invocation/);
});

test("speed remains selected and unlocks when disabled", () => {
  const e = environment(); e.run(pageSource); e.settings({ rate: 1.5 });
  assert.equal(e.video.playbackRate, 1.5);
  e.video.playbackRate = 0.8; assert.equal(e.video.playbackRate, 1.5);
  e.settings({ lockRate: false }); e.video.playbackRate = 0.8;
  assert.equal(e.video.playbackRate, 0.8);
  e.settings({ enabled: false }); e.video.playbackRate = 2;
  assert.equal(e.video.playbackRate, 2);
});

test("new videos receive current speed without duplicate listeners", () => {
  const e = environment(); e.run(pageSource); e.settings({ rate: 1.25 });
  const next = new e.Video(); e.document.videos.push(next); e.mutation(); e.mutation();
  assert.equal(next.playbackRate, 1.25);
  assert.equal(next.listeners.get("play").length, 1);
});

test("visibility and window blur handlers are suppressed only while protected", () => {
  const e = environment(); e.run(pageSource); e.settings(); e.hidden();
  for (const type of ["visibilitychange", "blur"]) {
    const event = { type, target: e.document }; e.window.dispatchEvent(event);
    assert.equal(event.stopped, true);
  }
  const inputBlur = { type: "blur", target: {} }; e.window.dispatchEvent(inputBlur);
  assert.equal(inputBlur.stopped, undefined);
  e.settings({ background: false });
  const event = { type: "visibilitychange", target: e.document }; e.window.dispatchEvent(event);
  assert.equal(event.stopped, undefined);
  assert.equal(e.window.listeners.has("pagehide"), false);
});

test("malformed or out-of-range page settings are ignored", () => {
  const e = environment(); e.run(pageSource); e.settings({ rate: 1.25 });
  for (const detail of ["{", "null", "x".repeat(1001), JSON.stringify({ ...defaults, rate: 100 }), JSON.stringify({ ...defaults, enabled: "false" })]) {
    e.document.dispatchEvent({ type: "gxb-playback-helper:settings:v1", detail });
  }
  e.video.playbackRate = 0.8; assert.equal(e.video.playbackRate, 1.25);
});

test("bridge handles startup ordering and storage updates", async () => {
  for (const bridgeFirst of [true, false]) {
    const e = environment(); let listener;
    e.context.chrome = { storage: { local: { get: async () => ({ settings: { ...defaults, rate: 1.75 } }) }, onChanged: { addListener: (handler) => { listener = handler; } } } };
    e.run(bridgeFirst ? bridgeSource : pageSource); await new Promise(setImmediate);
    e.run(bridgeFirst ? pageSource : bridgeSource); await new Promise(setImmediate);
    assert.equal(e.video.playbackRate, 1.75);
    listener({ settings: { newValue: { ...defaults, rate: 2 } } }, "local");
    assert.equal(e.video.playbackRate, 2);
    listener({ settings: { newValue: defaults } }, "sync");
    assert.equal(e.video.playbackRate, 2);
  }
});

test("stale initial reads do not overwrite newer storage events", async () => {
  const e = environment(); let resolveRead; let listener;
  e.context.chrome = { storage: { local: { get: () => new Promise((resolve) => { resolveRead = resolve; }) }, onChanged: { addListener: (handler) => { listener = handler; } } } };
  e.run(pageSource); e.run(bridgeSource);
  listener({ settings: { newValue: { ...defaults, rate: 2 } } }, "local");
  resolveRead({ settings: defaults }); await new Promise(setImmediate);
  assert.equal(e.video.playbackRate, 2);
});

test("bridge normalizes invalid stored settings and fails closed on read errors", async () => {
  for (const fail of [true, false]) {
    const e = environment();
    e.context.chrome = { storage: { local: { get: async () => { if (fail) throw new Error("Unavailable"); return { settings: { rate: 99, enabled: "yes" } }; } }, onChanged: { addListener() {} } } };
    e.run(pageSource); e.run(bridgeSource); await new Promise(setImmediate);
    assert.equal(e.video.playbackRate, fail ? 0.8 : 1);
  }
});

test("manifest uses minimal permissions and all declared local assets exist", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.host_permissions, undefined);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ["https://*.gaoxiaobang.com/*"]);
    assert.equal(script.run_at, "document_start");
    for (const file of script.js) assert.ok(fs.existsSync(path.join(root, file)));
  }
  for (const file of [manifest.action.default_popup, ...Object.values(manifest.icons)]) assert.ok(fs.existsSync(path.join(root, file)));
});
