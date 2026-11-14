# Security Policy

Supported version: 1.x.

Do not include account names, passwords, cookies, course tokens, student IDs,
or private course content in bug reports. Report security issues privately
through GitHub private vulnerability reporting when available; otherwise
contact the repository owner before sharing details.

The extension only requests `storage`. Content scripts are restricted to
HTTPS subdomains of `gaoxiaobang.com`. No remote code, telemetry, external
requests, cookie access, progress API calls, or credential handling are used.
The page-world bridge receives validated playback preferences only, and it
does not accept commands to read or write extension storage from the page.

Page scripts can observe or forge page-world events. They are not a trusted
security boundary; this does not grant them privileged extension APIs.
