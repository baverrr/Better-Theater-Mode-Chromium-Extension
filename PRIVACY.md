# Privacy policy

Last updated: 2026-11-01

Better Theater Mode runs only in your browser. It collects no personal data, makes no network
requests and sends nothing anywhere.

## What it reads

- **The pages you open.** On YouTube and, unless you turn off "Other sites", on every other page,
  its content scripts look at the page's layout to find the video player and its theater button,
  and change that player's styles. They don't read or keep what you watch, type or browse.
- **Your keystrokes, only for T and Esc.** The scripts listen for those two keys to toggle theater
  mode. Other keys are ignored and nothing is recorded.

## What it stores

The four switches in the popup (Enabled, Always open videos in theater, Hide scrollbar, Other
sites) are saved with `chrome.storage.sync`. If you have browser sync turned on, your browser
copies them to your other devices through your browser vendor's sync service, under that vendor's
privacy policy. Nothing else is stored.

## What it sends

Nothing leaves your browser. The extension has no analytics, telemetry, crash reporting, ads or
update checks of its own. Between a page and a video player embedded in it, the scripts pass short
`postMessage` signals (toggle, exit, fill, unfill) so the frame can be resized; those stay inside
the tab.

## Permissions

The only permission it asks for is `storage`, for the settings above. It runs on all sites so the
**T** key works wherever there's a video.

## Third parties

There are none. GitHub hosts this repository; its own privacy statement covers what GitHub collects
when you visit or clone it.

## Changes and contact

Changes to this policy are made in this file, with the date at the top updated. Questions: open an
issue at https://github.com/baverrr/Better-Theater-Mode-Chromium-Extension/issues
