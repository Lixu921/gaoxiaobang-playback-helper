"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { zip } = require("./zip.cjs");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const files = ["manifest.json", "README.md", "LICENSE"];
for (const folder of ["src", "popup", "assets"]) {
  for (const file of fs.readdirSync(path.join(root, folder)).sort()) files.push(`${folder}/${file}`);
}
const entries = files.map((file) => [file, fs.readFileSync(path.join(root, file))]);
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
const target = path.join(root, "dist", `gaoxiaobang-playback-helper-v${manifest.version}.zip`);
fs.writeFileSync(target, zip(entries));
console.log(`Packaged ${files.length} files: ${target}`);
