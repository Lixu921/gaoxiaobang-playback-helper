# Contributing

Use Node.js 22 or newer. No dependency installation is required.

1. Run `npm run check` and `npm test`.
2. Load the project directory as an unpacked Chromium extension.
3. Test manual pause, background playback, speed lock, disabled mode, navigation,
   dynamically inserted videos, and iframe playback on an authorized account.
4. Run `npm run package` and inspect the ZIP file list.

Use Conventional Commits, for example `fix: preserve user-initiated pauses`.
Keep permissions minimal. Do not add progress spoofing, quiz automation,
credential handling, remote code, or private course content.
