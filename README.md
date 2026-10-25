# Better Theater Mode

A Chromium extension (Chrome, Brave, Edge) that makes theater mode fill the
whole browser window, edge to edge on a black background, with the site's
header and sidebars out of the way.

## What it does

- **YouTube:** switch to theater mode (press **T** or the theater button) and
  the player fills the window. The header slides away and comes back when you
  move the mouse to the top edge or scroll down to the comments.
- **Any other site:** press **T** on a page with a video, or click the site's
  own theater button (Twitch, Rumble, PeerTube…), and the player fills the
  window. Press **T** again or **Esc** to go back.
- **Embedded videos:** YouTube, Vimeo, PBS and other players embedded in a
  page work too, including when you've clicked into the player.

The extension's popup has switches to turn it off, always open YouTube videos
in theater mode, hide the scrollbar, and turn off the non-YouTube part.

## Install

1. Open `chrome://extensions` (or `brave://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose this folder.

## Files

- `theater.js` / `theater.css` — YouTube's own theater mode, restyled.
- `generic.js` — every other site and embedded players.
- `popup.html` / `popup.js` — the settings popup.
