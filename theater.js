// Better Theater Mode: toggles html classes that theater.css hangs off of.

const DEFAULTS = { enabled: true, autoTheater: false, hideScrollbar: true };
let settings = { ...DEFAULTS };

const root = document.documentElement;
let watchObserver = null;
let observedFlexy = null;

function watchFlexy() {
  return document.querySelector("ytd-watch-flexy");
}

function isTheater() {
  const flexy = watchFlexy();
  return (
    !!flexy &&
    !flexy.hidden &&
    location.pathname === "/watch" &&
    flexy.hasAttribute("theater") &&
    !flexy.hasAttribute("fullscreen") &&
    !document.fullscreenElement
  );
}

function update() {
  const on = settings.enabled && isTheater();
  const changed = on !== root.classList.contains("btm-on");
  root.classList.toggle("btm-on", on);
  root.classList.toggle("btm-hide-scrollbar", settings.hideScrollbar);
  updateScrolled();
  // The player sizes its <video> on window resize; nudge it after we change the box.
  if (changed) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
}

function updateScrolled() {
  // Show the header once the video has mostly scrolled out of view.
  root.classList.toggle("btm-scrolled", window.scrollY > window.innerHeight * 0.5);
}

function observeFlexy() {
  const flexy = watchFlexy();
  if (!flexy || flexy === observedFlexy) return;
  observedFlexy = flexy;
  watchObserver?.disconnect();
  watchObserver = new MutationObserver(update);
  watchObserver.observe(flexy, {
    attributes: true,
    attributeFilter: ["theater", "fullscreen", "hidden"],
  });
}

function maybeAutoTheater() {
  if (!settings.enabled || !settings.autoTheater || location.pathname !== "/watch") return;
  let tries = 0;
  const timer = setInterval(() => {
    const flexy = watchFlexy();
    const button = document.querySelector("#movie_player .ytp-size-button");
    if (flexy && button) {
      if (!flexy.hasAttribute("theater")) button.click();
      clearInterval(timer);
    } else if (++tries > 40) {
      clearInterval(timer);
    }
  }, 250);
}

function onNavigate() {
  observeFlexy();
  update();
  maybeAutoTheater();
}

// Peek the header when the mouse touches the top edge of the window.
document.addEventListener(
  "mousemove",
  (e) => {
    if (!root.classList.contains("btm-on")) return;
    const masthead = document.getElementById("masthead-container");
    const overHeader = masthead && masthead.contains(e.target);
    root.classList.toggle("btm-peek", e.clientY < 12 || !!overHeader);
  },
  { passive: true }
);

window.addEventListener("scroll", updateScrolled, { passive: true });
document.addEventListener("fullscreenchange", update);
document.addEventListener("yt-navigate-finish", onNavigate);
document.addEventListener("yt-page-data-updated", onNavigate);

chrome.storage.sync.get(DEFAULTS, (stored) => {
  settings = { ...DEFAULTS, ...stored };
  onNavigate();
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
  update();
  if (changes.autoTheater?.newValue) maybeAutoTheater();
});
