// Adaptive site: the waitlist form, where a visitor came from, and the launch switch.
//
// CONFIG is the one place to edit. Before launch, leave it as it is: every button says "Join the waitlist"
// and every form posts to the waitlist.
// Launch day, with Max: set CTA_MODE to "app-store", paste the App Store link into APP_STORE_URL and the
// button words Max approves into LAUNCH_LABEL. Every [data-cta] link and every waitlist form on every page
// then becomes that App Store link, and every [data-prelaunch] line hides. Until all three are set, nothing
// changes. Then rebuild the pages with the launch copy (see website/README.md) so they read right without
// JavaScript too.
const CONFIG = {
  API_URL: "https://baseline-training-api.fly.dev/v1/waitlist",
  CTA_MODE: "waitlist",   // "waitlist" now; "app-store" from launch day
  APP_STORE_URL: null,    // launch day: the App Store listing link
  LAUNCH_LABEL: ""        // launch day: the button words Max approves
};

// Previewing on this machine only: ?api=http://127.0.0.1:8765/v1/waitlist points the form at a local service.
// It needs the page itself on localhost or 127.0.0.1 and a loopback address, so it can never act on the live site.
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  const api = new URLSearchParams(location.search).get("api");
  if (api && /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}\/v1\/waitlist$/.test(api)) CONFIG.API_URL = api;
}

const STYLES = ["powerlifting", "bodybuilding", "running", "hyrox", "crossfit", "calisthenics", "hybrid", "athletic", "other"];
// Same rule as service/waitlist.py (shape, 64-character local part, no "..", no trailing dot), on the trimmed,
// lowercased address.
const EMAIL = /^[a-z0-9_][a-z0-9._%+'-]*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/;
const SAY = {
  empty: "Enter your email address to join the waitlist.",
  bad: "That email address does not look right. Check it and try again.",
  busy: "That is more sign-ups than one connection may make right now. Try again in a few minutes.",
  down: "The waitlist could not take that just now. Try again in a minute."
};

function word(v) { v = (v || "").trim().toLowerCase(); return /^[a-z0-9_-]{1,40}$/.test(v) ? v : ""; }

// Where this visitor came from: ?src=, else ?utm_source=, else this tab's earlier landing, else the referrer
// (Instagram or TikTok), else "site". Kept in sessionStorage for this tab only; no cookies.
function source() {
  const q = new URLSearchParams(location.search);
  let s = word(q.get("src")) || word(q.get("utm_source"));
  if (!s) { try { s = word(sessionStorage.getItem("adaptive-src")); } catch (e) {} }
  if (!s) {
    try {
      const h = new URL(document.referrer).hostname;
      if (/(^|\.)instagram\.com$/.test(h)) s = "instagram";
      else if (/(^|\.)tiktok\.com$/.test(h)) s = "tiktok";
    } catch (e) {}
  }
  s = s || "site";
  try { sessionStorage.setItem("adaptive-src", s); } catch (e) {}
  return s;
}

function emailProblem(raw) {
  const a = (raw || "").trim().toLowerCase();
  if (!a) return SAY.empty;
  const local = a.split("@")[0];
  if (a.length > 254 || local.length > 64 || local.includes("..") || local.endsWith(".") || !EMAIL.test(a)) return SAY.bad;
  return "";
}

source(); // record the landing source on every page load, before any navigation

// The sticky "Join the waitlist" pill steps aside while a join block is on screen, so one button asks at a time.
(() => {
  const pill = document.querySelector(".bar .pill-cta"), blocks = document.querySelectorAll("[data-join]");
  if (!pill || !blocks.length || !("IntersectionObserver" in window)) return;
  const seen = new Set();
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { e.isIntersecting ? seen.add(e.target) : seen.delete(e.target); });
    pill.classList.toggle("away", seen.size > 0);
  });
  blocks.forEach(b => io.observe(b));
})();

const LAUNCHED = CONFIG.CTA_MODE === "app-store" && !!CONFIG.APP_STORE_URL && !!CONFIG.LAUNCH_LABEL;

if (LAUNCHED) {
  document.querySelectorAll("a[data-cta]").forEach(a => { a.href = CONFIG.APP_STORE_URL; a.textContent = CONFIG.LAUNCH_LABEL; });
  document.querySelectorAll("form[data-waitlist]").forEach(f => {
    const a = document.createElement("a"); a.className = "btn"; a.href = CONFIG.APP_STORE_URL; a.textContent = CONFIG.LAUNCH_LABEL;
    f.replaceWith(a);
  });
  document.querySelectorAll("[data-prelaunch]").forEach(el => { el.hidden = true; });
} else {
  document.querySelectorAll("form[data-waitlist]").forEach(form => {
    const email = form.elements.email, style = form.elements.style, hp = form.elements.website;
    const msg = form.querySelector("[data-msg]"), btn = form.querySelector("button[type=submit]");
    const box = form.closest("[data-join]");
    const joined = box.querySelector("[data-joined]");
    const heading = joined.querySelector("h2, h3");
    // The waitlist page's own h1 says "Join the waitlist."; once you join it says what the joined heading says.
    const pageTitle = box.hasAttribute("data-solo") ? document.querySelector("main h1") : null;
    const pageTitleText = pageTitle ? pageTitle.textContent : "";
    const showJoined = on => {
      form.hidden = on; joined.hidden = !on;
      box.querySelectorAll(".join-head, .join-close").forEach(el => { el.hidden = on; });
      document.querySelectorAll(".bar .pill-cta").forEach(el => { el.hidden = on; }); // nothing left to join
      if (pageTitle) { pageTitle.textContent = on ? heading.textContent : pageTitleText; heading.hidden = on; }
    };
    const qs = word(new URLSearchParams(location.search).get("style"));
    if (qs && STYLES.includes(qs) && !style.value) style.value = qs;
    let busy = false;
    btn.disabled = false; // the button ships disabled so nothing can post before this script is ready
    const say = (text, kind) => { msg.textContent = text || ""; msg.dataset.kind = kind || ""; };
    const markEmail = bad => bad ? email.setAttribute("aria-invalid", "true") : email.removeAttribute("aria-invalid");

    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      if (busy) return;
      const problem = emailProblem(email.value);
      if (problem) { say(problem, "error"); markEmail(true); email.focus(); return; }
      markEmail(false); say("");
      const body = { email: email.value.trim(), source: source(), website: hp.value };
      if (style.value) body.style = style.value;
      busy = true; btn.disabled = true; btn.textContent = "Joining"; form.setAttribute("aria-busy", "true");
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
      let res = null, data = null;
      try {
        res = await fetch(CONFIG.API_URL, { method: "POST", mode: "cors", credentials: "omit",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
        try { data = await res.json(); } catch (e) {}
      } catch (e) { res = null; }
      clearTimeout(timer);
      busy = false; btn.disabled = false; btn.textContent = "Join the waitlist"; form.removeAttribute("aria-busy");
      const err = data && typeof data.error === "string" ? data.error : "";
      if (res && res.ok) {
        joined.querySelector("[data-joined-email]").textContent = email.value.trim();
        showJoined(true); (pageTitle || heading).focus();
      } else if (res && res.status === 422) {
        say(err || SAY.bad, "error");
        if (!err || err === SAY.empty || err === SAY.bad) { markEmail(true); email.focus(); }
      } else if (res && res.status === 429) {
        say(err || SAY.busy, "note");
      } else {
        say(res && res.status === 503 && err ? err : SAY.down, "note");
      }
    });

    joined.querySelector("[data-again]").addEventListener("click", () => {
      form.reset(); say(""); markEmail(false);
      if (qs && STYLES.includes(qs) && !style.value) style.value = qs;
      showJoined(false); email.focus();
    });
  });
}
