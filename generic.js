// Better Theater Mode, every site except YouTube: press T on any page with a
// video, or click a site's own theater/theatre/cinema button, and the player
// fills the whole window. Do it again (or press Esc) to go back.
//
// Embedded players (a YouTube or Vimeo video inside an article) work too. This
// script also runs inside those frames and asks the page around it to stretch
// the frame, since a frame can't resize itself.
//
// Styles are set inline rather than with a stylesheet so they also reach
// players built as web components (shadow DOM), which page CSS can't touch.

const DEFAULTS = { enabled: true, otherSites: true };
let settings = { ...DEFAULTS };

const THEATER_LABEL = /theat(er|re)|cinema/i;
const EMBED_SRC = /youtube(-nocookie)?\.com\/embed|player\.vimeo\.com|player\.twitch\.tv|dailymotion\.com\/(embed|player)|streamable\.com|rumble\.com\/embed|kick\.com|facebook\.com\/plugins\/video|wistia|jwplayer|brightcove|bitchute\.com\/embed|odysee\.com\/\$\/embed|crunchyroll\.com/i;
const MESSAGE = "better-theater-mode";
const isTop = window === window.top;
const root = document.documentElement;
let active = null; // { player, video, saved: Map(element -> original style attribute), observer, timer, labelled }

const STYLES = {
  // Some sites keep space for a scrollbar even when it's hidden (Plex).
  page: { overflow: "hidden", "scrollbar-gutter": "auto" },
  player: {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    "max-width": "none",
    "max-height": "none",
    margin: "0",
    padding: "0",
    "border-radius": "0",
    transform: "none",
    "z-index": "2147483647",
    background: "#000",
  },
  // Everything between the player box and the video stretches with it.
  fill: {
    width: "100%",
    height: "100%",
    "max-width": "none",
    "max-height": "none",
    "aspect-ratio": "auto",
    padding: "0",
    // Undo offsets such as Fox Sports' sticky wrapper (fixed, top: 75px).
    inset: "0 auto auto 0",
    margin: "0",
    transform: "none",
  },
  video: {
    width: "100%",
    height: "100%",
    "max-width": "none",
    "max-height": "none",
    "object-fit": "contain",
  },
  // Ancestors must not trap position: fixed or bury it under the page.
  ancestor: {
    transform: "none",
    filter: "none",
    "backdrop-filter": "none",
    perspective: "none",
    contain: "none",
    "will-change": "auto",
    "z-index": "2147483647",
  },
};

// --- Walking the page, including inside web components ------------------

function shadowRootOf(el) {
  return chrome.dom?.openOrClosedShadowRoot?.(el) ?? el.shadowRoot;
}

// Like querySelectorAll, but also looks inside shadow roots.
function deepQueryAll(selector, scope = document) {
  const found = [...scope.querySelectorAll(selector)];
  for (const el of scope.querySelectorAll("*")) {
    const shadow = shadowRootOf(el);
    if (shadow) found.push(...deepQueryAll(selector, shadow));
  }
  return found;
}

// parentElement, stepping out of a shadow root to its host.
function parentOf(el) {
  if (el.parentElement) return el.parentElement;
  const node = el.parentNode;
  return node instanceof ShadowRoot ? node.host : null;
}

function containsDeep(ancestor, el) {
  for (; el; el = parentOf(el)) if (el === ancestor) return true;
  return false;
}

// The element an event really started on, even inside a web component.
function eventTarget(e) {
  const first = e.composedPath()[0];
  return first instanceof Element ? first : e.target;
}

// --- Finding the player -------------------------------------------------

function isTheaterButton(el) {
  const text = [
    el.getAttribute("aria-label"),
    el.getAttribute("title"),
    el.getAttribute("data-a-target"),
    el.getAttribute("data-testid"),
    el.getAttribute("data-tooltip"),
    el.getAttribute("data-title"),
    typeof el.className === "string" ? el.className : "",
    el.textContent.length < 40 ? el.textContent : "",
  ].join(" ");
  return THEATER_LABEL.test(text);
}

// Real buttons, plus plain elements whose tooltip names theater mode (Rumble's
// is a <div title="Toggle theater mode">).
function isTheaterControl(el) {
  if (el.matches("button, [role=button], a, [tabindex]")) return isTheaterButton(el);
  return THEATER_LABEL.test([el.getAttribute("title"), el.getAttribute("aria-label")].join(" "));
}

function findTheaterButton(target) {
  for (let el = target; el && el !== document.body; el = parentOf(el)) {
    if (isTheaterControl(el)) return el;
  }
  return null;
}

function theaterButtons() {
  return [...document.querySelectorAll("button, [role=button], [title], [aria-label]")].filter(isTheaterControl);
}

// After a click, read the button again: "Exit theatre mode" means the site is
// now in theater mode. null when the label doesn't say either way.
function siteTheaterOn(button) {
  if (button.hasAttribute("aria-pressed")) return button.getAttribute("aria-pressed") === "true";
  const label = [button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent].join(" ");
  if (/exit|leave|close|disable|turn off|default view/i.test(label)) return true;
  if (/enter|enable|turn on/i.test(label)) return false;
  return null;
}

function area(el) {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}

function looksLikeVideoEmbed(iframe) {
  const allow = iframe.getAttribute("allow") || "";
  return EMBED_SRC.test(iframe.src) || iframe.hasAttribute("allowfullscreen") || /fullscreen/.test(allow);
}

// Players parked on the page but hidden until you press play (NASA+) still
// take up space, so size alone isn't enough.
function isVisible(el) {
  return el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
}

// Skip tiny tracking/ad videos (MLB loads a 1x1 one before the real player)
// and ones parked off the page to test autoplay (CBS Sports puts one at
// -1000,-1000). Videos merely scrolled out of view still count.
function isCandidate(el) {
  const r = el.getBoundingClientRect();
  const onPage = r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0;
  return onPage && r.width >= 160 && r.height >= 90 && isVisible(el);
}

// The biggest visible <video>, or embedded video player frame, on the page.
function mainVideo() {
  let best = null;
  const iframes = deepQueryAll("iframe").filter(looksLikeVideoEmbed);
  for (const video of [...deepQueryAll("video"), ...iframes].filter(isCandidate)) {
    if (!best || area(video) > area(best)) best = video;
  }
  return best;
}

// The player box: the smallest element holding both the video and the theater
// button. If the button lives outside the player, fall back to the biggest
// ancestor that is still about the size of the video.
function findPlayer(video, button) {
  let player = button ? parentOf(video) : null;
  while (player && !containsDeep(player, button)) player = parentOf(player);

  const videoArea = area(video);
  if (player && player !== document.body && area(player) <= videoArea * 1.6) return player;

  player = video;
  for (let el = parentOf(video); el && el !== document.body; el = parentOf(el)) {
    if (area(el) > videoArea * 1.2) break;
    player = el;
  }
  return player === video ? parentOf(video) : player;
}

// --- Entering and leaving -----------------------------------------------

// Remember each element's whole style attribute so leaving puts it back
// exactly (restoring property by property loses shorthands like padding).
function applyStyle(el, role, saved, roles) {
  if (!saved.has(el)) saved.set(el, el.getAttribute("style"));
  for (const [property, value] of Object.entries(STYLES[role])) {
    el.style.setProperty(property, value, "important");
  }
  roles.set(el, [...(roles.get(el) || []), role]);
}

// Players often rewrite their own inline size (Rumble does on every resize),
// wiping ours. Put ours back whenever that happens.
function reapply(roles) {
  for (const [el, elRoles] of roles) {
    for (const role of elRoles) {
      for (const [property, value] of Object.entries(STYLES[role])) {
        if (el.style.getPropertyValue(property) !== value || el.style.getPropertyPriority(property) !== "important") {
          el.style.setProperty(property, value, "important");
        }
      }
    }
  }
}

// labelled: the site's button says when theater mode is on, so we can follow it.
function enter(button, labelled = false, video = mainVideo()) {
  if (!video) return;
  const player = findPlayer(video, button);
  const saved = new Map();
  const roles = new Map();

  applyStyle(root, "page", saved, roles);
  applyStyle(document.body, "page", saved, roles);
  applyStyle(player, "player", saved, roles);
  applyStyle(video, "video", saved, roles);
  for (let el = parentOf(video); el && el !== player; el = parentOf(el)) applyStyle(el, "fill", saved, roles);
  for (let el = parentOf(player); el && el !== document.body && el !== root; el = parentOf(el)) {
    applyStyle(el, "ancestor", saved, roles);
  }

  const observer = new MutationObserver(() => reapply(roles));
  for (const el of roles.keys()) observer.observe(el, { attributes: true, attributeFilter: ["style"] });

  // Leave if the site swaps the video out (e.g. navigating to another page).
  const timer = setInterval(() => {
    if (!video.isConnected || !player.isConnected) exit();
  }, 1000);

  active = { player, video, saved, observer, timer, labelled };
  window.dispatchEvent(new Event("resize"));
  // Some embedded players don't grow with their frame (PBS), so ask the
  // script inside the frame to fill it too.
  if (video.tagName === "IFRAME") video.contentWindow?.postMessage({ [MESSAGE]: "fill" }, "*");
}

function exit() {
  if (!active) return;
  if (active.video.tagName === "IFRAME") active.video.contentWindow?.postMessage({ [MESSAGE]: "unfill" }, "*");
  active.observer.disconnect();
  for (const [el, style] of active.saved) {
    if (style === null) el.removeAttribute("style");
    else el.setAttribute("style", style);
  }
  clearInterval(active.timer);
  active = null;
  window.dispatchEvent(new Event("resize"));
}

// --- Clicks and keys ----------------------------------------------------

document.addEventListener(
  "click",
  (e) => {
    if (!isTop || !settings.enabled || !settings.otherSites) return;
    const button = findTheaterButton(eventTarget(e));
    if (!button) return;
    // Let the site switch its own layout first, then follow its state.
    setTimeout(() => {
      const on = siteTheaterOn(button);
      if (on ?? !active) {
        if (!active) enter(button, on === true);
      } else {
        exit();
      }
    }, 100);
  },
  true
);

// Keyboard shortcuts (e.g. Alt+T on Twitch): check whether the site's theater
// button now says "Exit theater mode", and follow it. Only sites whose button
// label changes can be followed this way.
function syncWithPage() {
  const buttons = theaterButtons();
  if (!buttons.length) return;
  const on = buttons.some((button) => siteTheaterOn(button) === true);
  if (on && !active) enter(buttons[0], true);
  else if (!on && active?.labelled) exit();
}

function isTyping(e) {
  return !!eventTarget(e).closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
}

function isPlainT(e) {
  return e.key.toLowerCase() === "t" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat;
}

document.addEventListener(
  "keydown",
  (e) => {
    if (!isTop) return keydownInFrame(e);
    if (active && e.key === "Escape" && !document.fullscreenElement) return exit();
    if (!settings.enabled || !settings.otherSites || isTyping(e)) return;
    if (e.key.length !== 1) return;
    const plainT = isPlainT(e);
    const wasActive = !!active;
    setTimeout(() => {
      syncWithPage();
      // T toggles our theater mode on any page with a video, unless the site's
      // own theater mode just reacted to the key.
      if (plainT && !!active === wasActive) active ? exit() : enter(null);
    }, 150);
  },
  true
);

// Inside an embedded player: hand T and Esc up to the page around us.
function keydownInFrame(e) {
  if (!settings.enabled || !settings.otherSites || isTyping(e)) return;
  if (!deepQueryAll("video").length) return;
  if (isPlainT(e)) window.parent.postMessage({ [MESSAGE]: "toggle" }, "*");
  else if (e.key === "Escape" && !document.fullscreenElement) window.parent.postMessage({ [MESSAGE]: "exit" }, "*");
}

// A frame on this page asked to be stretched (or let go). Pages in between
// pass the request up, so the top page always stretches its own child frame.
window.addEventListener("message", (e) => {
  const action = e.data?.[MESSAGE];
  // The page around us stretched our frame: fill it (and pass it on down).
  if ((action === "fill" || action === "unfill") && !isTop && e.source === window.parent) {
    if (action === "fill" && !active) enter(null);
    else if (action === "unfill") exit();
    return;
  }
  if (action !== "toggle" && action !== "exit") return;
  const frame = deepQueryAll("iframe").find((f) => f.contentWindow === e.source);
  if (!frame) return;
  if (!isTop) return window.parent.postMessage({ [MESSAGE]: action }, "*");
  if (active) exit();
  else if (action === "toggle") enter(null, false, frame);
});

document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) exit();
});

chrome.storage.sync.get(DEFAULTS, (stored) => {
  settings = { ...DEFAULTS, ...stored };
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  if (!settings.enabled || !settings.otherSites) exit();
});
