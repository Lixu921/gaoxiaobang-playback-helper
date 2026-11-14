"use strict";

const DEFAULTS = { enabled: true, background: true, lockRate: true, rate: 1 };
const RATES = [0.5, 0.75, 0.8, 1, 1.25, 1.5, 1.75, 2];
const form = document.getElementById("settings");
const options = document.getElementById("options");
const status = document.getElementById("status");
const controls = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, document.getElementById(key)]));
let queue = Promise.resolve();
let revision = 0;

function updateControls() {
  options.disabled = !controls.enabled.checked;
  controls.rate.disabled = !controls.lockRate.checked;
}

function notify(text, error = false) {
  status.textContent = text;
  document.body.dataset.error = String(error);
}

form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("change", () => {
  updateControls();
  const currentRevision = ++revision;
  const settings = {
    enabled: controls.enabled.checked,
    background: controls.background.checked,
    lockRate: controls.lockRate.checked,
    rate: Number(controls.rate.value)
  };
  notify("正在保存");
  queue = queue.catch(() => {}).then(() => chrome.storage.local.set({ settings })).then(() => {
    if (revision === currentRevision) notify("已保存");
  }).catch(() => {
    if (revision === currentRevision) notify("保存失败，请重试", true);
  });
});

form.inert = true;
chrome.storage.local.get("settings").then((result) => {
  const raw = result.settings ?? {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    if (key === "rate") controls[key].value = String(RATES.includes(raw[key]) ? raw[key] : fallback);
    else controls[key].checked = typeof raw[key] === "boolean" ? raw[key] : fallback;
  }
  updateControls();
  form.inert = false;
  notify("已就绪");
}).catch(() => notify("设置读取失败，请重新打开", true));
