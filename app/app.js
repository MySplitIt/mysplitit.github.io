// MySplitIt Web: the screens. Data and syncing live in data.js; money rules in core.js.
import { html, render, useState, useEffect, useMemo, useRef } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";
import * as C from "./core.js?v=20261106a";
import * as D from "./data.js?v=20261106a";
import { Icon, Logo, Tile, CategoryTile, CATEGORIES, categoryStyle, expenseStyle, PAYMENT } from "./brand.js?v=20261105d";

// ---------- Helpers ----------
const emoji = (c) => categoryStyle(c).emoji;
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const COLORS = ["#e65100", "#00838f", "#c2185b", "#5e35b1", "#2e7d32", "#3949ab", "#6d4c41", "#00897b", "#8e24aa", "#d84315"];
const color = (s) => COLORS[[...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % COLORS.length];
const Avatar = ({ name, size = 38 }) => html`<span class="avatar" style=${`background:${color(name)};width:${size}px;height:${size}px`}>${(name.trim()[0] || "?").toUpperCase()}</span>`;
const membersLabel = (g) => {
  const heads = C.totalHeads(g);
  return count(g.members.length, "member", "members") + (heads !== g.members.length ? " · " + count(heads, "person", "people") : "");
};
const describeMember = (m) => (m.isFamily ? "Family · " + C.describeCounts({ adults: m.adults, kids: m.kids }) : "");
const day = (t) => new Date(t);
const ICON = {
  groups: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>`,
  friends: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21v-1a6 6 0 0 1 12 0v1"/><path d="M16 3.1a4 4 0 0 1 0 7.8M23 21v-1a6 6 0 0 0-4-5.6"/></svg>`,
  account: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>`,
  back: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`,
  more: html`<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  theme: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
};

function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const stop = D.subscribe(() => force((n) => n + 1));
    force((n) => n + 1); // catch anything that changed before we started listening
    return stop;
  }, []);
  return D.state;
}
function useRoute() {
  const [hash, setHash] = useState(location.hash || "#/groups");
  useEffect(() => { const f = () => setHash(location.hash || "#/groups"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return hash.slice(2).split("/").map(decodeURIComponent);
}
const go = (path) => { location.hash = "#/" + path; };
function toggleTheme() {
  const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", dark ? "light" : "dark"); } catch (e) { /* not saved */ }
}

// ---------- Small building blocks ----------
/** Puts the cursor in the field marked autofocus (browsers only do this on page load). */
function useAutofocus() {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current && ref.current.querySelector("[autofocus]"); if (el) el.focus(); }, []);
  return ref;
}

function Dialog({ title, children, actions, onClose }) {
  const ref = useAutofocus();
  useEffect(() => { const f = (e) => e.key === "Escape" && onClose && onClose(); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, [onClose]);
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose && onClose()}>
    <div class="dialog" ref=${ref} role="dialog" aria-modal="true" aria-label=${title}>
      <h2>${title}</h2>
      ${children}
      ${actions && html`<div class="actions">${actions}</div>`}
    </div></div>`;
}
const Stepper = ({ label, value, min, max = 30, onChange }) => html`<div class="stepper">
  <span class="lbl">${label}</span>
  <button type="button" aria-label=${"Fewer " + label} disabled=${value <= min} onClick=${() => onChange(value - 1)}>−</button>
  <span class="val">${value}</span>
  <button type="button" aria-label=${"More " + label} disabled=${value >= max} onClick=${() => onChange(value + 1)}>+</button></div>`;
const Confirm = ({ title, message, label, onYes, onClose }) => html`<${Dialog} title=${title} onClose=${onClose}
  actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button><button class="btn danger ghost" onClick=${() => { onYes(); onClose(); }}>${label}</button>`}>
  <p class="muted" style="margin:0;white-space:pre-line">${message}</p></${Dialog}>`;

function CurrencySelect({ value, onChange }) {
  const list = useMemo(() => C.allCurrencies(), []);
  return html`<select class="input" value=${value} onChange=${(e) => onChange(e.target.value)}>
    ${list.map((c) => html`<option value=${c}>${C.currencyLabel(c)} – ${C.currencyName(c)}</option>`)}</select>`;
}

// ---------- Sign in and profile ----------
function SignIn() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [deleted] = useState(() => { try { const d = sessionStorage.getItem("mysplitit-deleted"); sessionStorage.removeItem("mysplitit-deleted"); return !!d; } catch (e) { return false; } });
  const [email, setEmail] = useState("");
  const google = async () => {
    setBusy(true); setMsg("");
    try { await D.signInWithGoogle(); } catch (e) { setMsg("Couldn't sign in. Please try again."); console.warn(e); }
    setBusy(false);
  };
  return html`<div class="auth"><div class="card">
    <img class="logo" src="../assets/icon.svg" alt="" />
    <h1>MySplitIt Web</h1>
    <p class="muted" style="margin:0">Sign in to see your groups and add expenses with friends on the MySplitIt app. Everything syncs live with your phone.</p>
    <button class="btn google" disabled=${busy} onClick=${google}>
      <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.7 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.3-8.7 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
      ${busy ? "Signing in…" : "Continue with Google"}</button>
    ${navigator.standalone === true && html`<p class="small ios-signin">After you choose your Google account, tap <b>✕</b> at the top left of Google's window to come back to MySplitIt.</p>`}
    ${D.usesEmulator && html`<div class="stack" style="text-align:left"><label class="field">Test email (local emulator)
      <input class="input" value=${email} onInput=${(e) => setEmail(e.target.value.trim())} placeholder="alice@example.com" /></label>
      <button class="btn ghost" disabled=${!C.isEmail(email)} onClick=${() => D.signInForTesting(email.toLowerCase()).catch((e) => setMsg(e.message))}>Test sign-in</button></div>`}
    ${msg && html`<p class="bad" style="margin:0">${msg}</p>`}
    ${deleted && html`<p class="good" style="margin:0">Your MySplitIt account is deleted.</p>`}
    <p class="small muted" style="margin:0">New here? Signing in creates your account. MySplitIt only reads your name and email. <a href="../privacy.html">Privacy</a></p>
    <a class="small" href="../">← Back to the MySplitIt website</a>
  </div></div>`;
}

function ProfileForm({ first, onDone }) {
  const s = D.state;
  const p = s.profile;
  const [name, setName] = useState(p ? p.name : s.user.name);
  const [adults, setAdults] = useState(p ? p.adults : 1);
  const [kids, setKids] = useState(p ? p.kids : 0);
  const [friends, setFriends] = useState(p ? p.friends : 0);
  // Typed number, used only while WhatsApp verification is off (as in version 2.2).
  const [phone, setPhone] = useState(s.myPhone || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const wa = D.whatsappOn();
  const phoneBad = phone.trim() !== "" && !C.phoneKey(phone);
  const phoneOk = wa ? s.phoneVerified : !!C.phoneKey(phone);
  const save = async () => {
    setBusy(true); setMsg("");
    const err = await D.saveProfile({ name, phone, adults, kids, friends });
    setBusy(false);
    if (err) setMsg(err); else onDone && onDone();
  };
  return html`<div class="card stack" style="max-width:560px">
    <h2>${first ? (p ? (wa ? "Verify your phone number" : "Add your phone number") : "Set up your profile") : "Your profile"}</h2>
    ${first && html`<p class="muted" style="margin:0">${p
      ? (wa ? "MySplitIt now verifies every account's phone number, so friends can find the right person. It takes one WhatsApp message."
        : "MySplitIt now needs a phone number on every account, so friends can find you by number. Add yours to carry on.")
      : `Signed in as ${s.user.email}. ${wa ? "Verify" : "Add"} your phone number and say who usually comes with you, so friends can find you and add you with your family in one tap.`}</p>`}
    <label class="field">Your name<input class="input" value=${name} maxlength="100" onInput=${(e) => setName(e.target.value)} /></label>
    ${wa ? html`<${PhoneVerification} />` : html`<label class="field">Phone number<input class="input ${phoneBad ? "error" : ""}" value=${phone} maxlength="20" inputmode="tel" autocomplete="tel" required placeholder="+1 555 010 1234" onInput=${(e) => setPhone(e.target.value)} />
      <span class="hint ${phoneBad ? "error" : ""}">${phoneBad ? "Enter a full phone number" : `${phone.trim() ? "" : "Required. "}Lets friends find you by number as well as by ${s.user.email}`}</span></label>`}
    <h3>Who usually comes with you?</h3>
    <${Stepper} label="Adults (including you)" value=${adults} min=${1} onChange=${setAdults} />
    <${Stepper} label="Kids" value=${kids} min=${0} onChange=${setKids} />
    <${Stepper} label="Friends" value=${friends} min=${0} onChange=${setFriends} />
    <p class="small muted" style="margin:0">When someone adds you to a group, you're added as one family of ${count(adults + kids + friends, "person", "people")} (friends count as adults).</p>
    ${msg && html`<p class="bad" style="margin:0">${msg}</p>`}
    <div class="row"><button class="btn primary" disabled=${busy || !name.trim() || !phoneOk} onClick=${save}>${busy ? "Saving…" : first ? "Save and continue" : "Save"}</button>
      ${!first && html`<button class="btn text" onClick=${onDone}>Cancel</button>`}
      ${first && html`<button class="btn text" onClick=${() => D.signOut()}>Sign out</button>`}</div>
    <p class="small muted" style="margin:0">Your number is only used so friends can find you. Others see your name, email and how many people come with you, never your number.</p>
  </div>`;
}

/** Proving your phone number: WhatsApp opens with a code ready to send to MySplitIt; this updates by itself. */
function PhoneVerification() {
  const s = D.state;
  const [check, setCheck] = useState(null);
  const [since, setSince] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const done = check && s.phoneVerified && s.phoneVerifiedAt !== since;
  useEffect(() => { if (done) setCheck(null); }, [done]);
  const desktop = useMemo(() => matchMedia("(pointer: fine)").matches, []);
  const qr = useMemo(() => {
    if (!check || !window.qrcode) return "";
    const q = window.qrcode(0, "M"); q.addData(check.link); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [check]);
  const start = async () => {
    setBusy(true); setProblem("");
    const r = await D.startPhoneCheck();
    setBusy(false);
    if (r.problem) { setProblem(r.problem); return; }
    setSince(s.phoneVerifiedAt); setCheck(r);
    if (!desktop) window.open(r.link, "_blank", "noopener");
  };
  return html`<div class="card stack verify">
    <h3>Phone number</h3>
    ${check ? html`
      <p class="row" style="margin:0"><span class="spinner"></span><b>Waiting for your WhatsApp message…</b></p>
      ${desktop && qr ? html`<div class="row verify-qr"><div class="qr" dangerouslySetInnerHTML=${{ __html: qr }}></div>
        <p class="small muted" style="margin:0">Scan with your phone's camera to open WhatsApp, then tap <b>Send</b>.
          Or <a href=${check.link} target="_blank" rel="noopener">open WhatsApp on this computer</a>.</p></div>`
        : html`<p class="small muted" style="margin:0">Tap <b>Send</b> in WhatsApp, then come back here.</p>`}
      <p class="small muted" style="margin:0">Or send the code <b class="code">${check.code}</b> to <b>+${check.number}</b> on WhatsApp. It works for 15 minutes.</p>
      <div class="row">${!desktop && html`<a class="btn text small" href=${check.link} target="_blank" rel="noopener">Open WhatsApp again</a>`}
        <button class="btn text small" onClick=${() => setCheck(null)}>Cancel</button></div>`
    : s.phoneVerified ? html`
      <p style="margin:0"><b>${s.myPhone}</b> <span class="good">✓ Verified</span></p>
      <p class="small muted" style="margin:0">Friends can find you by this number as well as by ${s.user.email}.</p>`
    : html`<p class="muted" style="margin:0">Required. ${desktop ? "Click the button and scan the code with your phone" : "Tap the button"}: WhatsApp opens with a short message to MySplitIt. Just tap Send, and your WhatsApp number is verified in a few seconds. No SMS, no typing.</p>`}
    ${problem && html`<p class="bad small" style="margin:0">${problem}</p>`}
    ${!check && html`<div class="row"><button class=${"btn " + (s.phoneVerified ? "ghost" : "primary")} disabled=${busy} onClick=${start}>
      ${busy ? "Starting…" : s.phoneVerified ? "Change number" : "Verify with WhatsApp"}</button></div>`}
  </div>`;
}

// ---------- Groups ----------
function GroupDialog({ initial, onClose }) {
  const s = D.state;
  const p = s.profile;
  const [name, setName] = useState(initial ? initial.name : "");
  const [category, setCategory] = useState(initial ? initial.category : "Trip");
  const [currency, setCurrency] = useState(initial ? initial.currency : (navigator.language === "en-IN" ? "INR" : "USD"));
  const [addMe, setAddMe] = useState(true);
  const [myName, setMyName] = useState(p ? p.name : s.user.name);
  const [useProfile, setUseProfile] = useState(!!p);
  const [adults, setAdults] = useState(p ? p.adults + p.friends : 1);
  const [kids, setKids] = useState(p ? p.kids : 0);
  const duplicate = name.trim() && [...s.groups.values()].some((g) => g.id !== (initial && initial.id) && C.sameGroupName(g.name, name));
  const ok = name.trim() && !duplicate && (initial || !addMe || myName.trim());
  const save = () => {
    if (initial) { D.editGroup(initial.id, { name: name.trim(), category, currency }); onClose(); return; }
    const me = addMe ? (p && useProfile
      ? { name: myName.trim(), adults: p.adults + p.friends, kids: p.kids, fromProfile: true }
      : { name: myName.trim(), adults, kids, fromProfile: false }) : null;
    const id = D.createGroup({ name: name.trim(), category, currency, me });
    onClose();
    go(`group/${id}/people/add`);
  };
  return html`<${Dialog} title=${initial ? "Edit group" : "New group"} onClose=${onClose}
    actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok} onClick=${save}>${initial ? "Save" : "Create"}</button>`}>
    <label class="field">Group name<input class="input ${duplicate ? "error" : ""}" value=${name} maxlength="100" placeholder="e.g. Florida trip" onInput=${(e) => setName(e.target.value)} autofocus />
      ${duplicate && html`<span class="hint error">You already have a group with this name. Pick a different name.</span>`}</label>
    <div class="field">Type<div class="cat-grid" role="radiogroup">${CATEGORIES.map((c) => html`<button type="button" role="radio" class="cat" aria-checked=${category === c.name}
      style=${`--c:${c.color}`} onClick=${() => setCategory(c.name)}><${Tile} icon=${c.icon} color=${c.color} size=${36} /><span>${c.name}</span></button>`)}</div></div>
    <label class="field">Default currency<${CurrencySelect} value=${currency} onChange=${setCurrency} /><span class="hint">Each expense can still use its own currency.</span></label>
    ${!initial && html`<div class="card stack" style="background:var(--surface-2)">
      <label class="check"><input type="checkbox" checked=${addMe} onChange=${(e) => setAddMe(e.target.checked)} /> Add me to this group</label>
      ${addMe && html`<label class="field">Your name in this group<input class="input" value=${myName} onInput=${(e) => setMyName(e.target.value)} /></label>
        ${p && html`<label class="check"><input type="checkbox" checked=${useProfile} onChange=${(e) => setUseProfile(e.target.checked)} />
          Bring my family from my profile <span class="muted">(${C.describeCounts({ adults: p.adults + p.friends, kids: p.kids })})</span></label>`}
        ${(!p || !useProfile) && html`<${Stepper} label="Adults (including you)" value=${adults} min=${1} onChange=${setAdults} /><${Stepper} label="Kids" value=${kids} min=${0} onChange=${setKids} />`}`}
    </div>`}
  </${Dialog}>`;
}

// ---------- Add to home screen ----------
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const SHARE_ICON = html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

/** The two taps for this iPhone browser. iPhone browsers have no install button; it's always Share. */
function iosSteps() {
  const ua = navigator.userAgent;
  const then = html`, then <b>Add to Home Screen</b>.`;
  if (/CriOS/.test(ua)) return html`In Chrome, tap ${SHARE_ICON} <b>Share</b> at the right of the address bar (or <b>•••</b> → <b>Share</b>)${then}`;
  if (/EdgiOS/.test(ua)) return html`In Edge, tap <b>•••</b> → ${SHARE_ICON} <b>Share</b>${then}`;
  if (/FxiOS/.test(ua)) return html`In Firefox, tap <b>☰</b> → ${SHARE_ICON} <b>Share</b>${then}`;
  return html`In Safari, tap ${SHARE_ICON} <b>Share</b> (on newer iPhones it's under <b>•••</b>)${then}`;
}

/**
 * Offers to put MySplitIt on the home screen. Chrome (Android, computers) has a real install
 * prompt; Safari on iPhone has none, so it shows the two taps instead. Hidden once installed,
 * or for two weeks after "Not now" (unless [always], used on the Account page).
 */
function InstallBanner({ always = false }) {
  const [prompt, setPrompt] = useState(window.__installPrompt || null);
  const [later, setLater] = useState(() => { try { return Date.now() < Number(localStorage.getItem("installLater") || 0); } catch (e) { return false; } });
  const [done, setDone] = useState(false);
  useEffect(() => {
    const ready = () => setPrompt(window.__installPrompt);
    const installed = () => { window.__installPrompt = null; setPrompt(null); setDone(true); };
    window.addEventListener("installready", ready);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("installready", ready); window.removeEventListener("appinstalled", installed); };
  }, []);
  if (done || isStandalone() || (later && !always)) return null;
  const ios = isIOS();
  if (!prompt && !ios) return null;
  const notNow = () => { try { localStorage.setItem("installLater", String(Date.now() + 14 * 86400000)); } catch (e) { /* fine */ } setLater(true); };
  const install = async () => {
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    window.__installPrompt = null; setPrompt(null);
    if (choice && choice.outcome === "accepted") setDone(true);
  };
  return html`<div class="install card row">
    <${Logo} size=${44} />
    <div class="grow"><b>Add MySplitIt to your home screen</b>
      <div class="small muted">${ios
        ? html`${iosSteps()} It opens like an app, with the MySplitIt icon.`
        : "Open it like an app, straight from your home screen, with the MySplitIt icon."}</div></div>
    <div class="row">${!always && html`<button class="btn text small" onClick=${notNow}>Not now</button>`}
      ${!ios && html`<button class="btn primary small" onClick=${install}>Install</button>`}</div>
  </div>`;
}

function GroupsPage() {
  const s = useStore();
  const [creating, setCreating] = useState(false);
  const groups = [...s.groups.values()].sort((a, b) => b.createdAt - a.createdAt);
  return html`<div>
    <div class="topbar"><h1>Groups</h1><span class="right"></span>
      <button class="btn primary" onClick=${() => setCreating(true)}>+ New group</button></div>
    <${InstallBanner} />
    ${groups.length > 0 && html`<${Summary} groups=${groups} />`}
    ${!s.profileLoaded && s.status !== "offline" && !groups.length ? html`<p class="muted">Loading your groups…</p>` : !groups.length ? html`<div class="empty card">
      <${Logo} size=${88} /><h2>No groups yet</h2>
      <div class="row" style="justify-content:center;gap:8px">${CATEGORIES.slice(0, 5).map((c) => html`<${Tile} icon=${c.icon} color=${c.color} size=${36} />`)}</div><p>Create a group, or ask a friend on the app to add you with ${s.user.email}.</p>
      <button class="btn primary" onClick=${() => setCreating(true)}>Create a group</button></div>`
    : html`<div class="cards">${groups.map((g) => {
      const left = C.unsettled(g);
      return html`<button class="card group-card" onClick=${() => go("group/" + g.id)}>
        <${CategoryTile} category=${g.category} size=${54} />
        <span class="grow"><b class="ellipsis" style="display:block;font-size:1.05rem">${g.name}</b>
          <span class="small muted">${membersLabel(g)} · ${count(g.expenses.length, "expense", "expenses")}</span>
          ${g.expenses.length > 0 && html`<span class=${"pill " + (left.size ? "warn" : "ok")}>${left.size ? C.formatTotals(left, g.currency) + " to settle" : "All settled up"}</span>`}</span>
        <span class="amount">${C.formatTotals(C.totals(g), g.currency)}<br /><span class="small muted" style="font-weight:400">spent</span></span>
      </button>`;
    })}</div>`}
    ${creating && html`<${GroupDialog} onClose=${() => setCreating(false)} />`}
  </div>`;
}

/** Brand header on the groups page: what you're owed and what you owe across all groups. */
function Summary({ groups }) {
  const s = useStore();
  const o = C.friendsOverview(groups, s.user.email);
  const owed = new Map(), owe = new Map();
  for (const f of o.friends) for (const [c, v] of f.totals) {
    if (v > 0) owed.set(c, (owed.get(c) || 0) + v); else if (v < 0) owe.set(c, (owe.get(c) || 0) - v);
  }
  const main = groups[0].currency;
  const lines = (m) => (m.size ? [...m].sort(([a], [b]) => (b === main) - (a === main)) : [[main, 0]])
    .map(([c, v]) => html`<b class=${m.size > 1 ? "sm" : ""}>${C.formatMoney(v, c)}</b>`);
  const first = ((s.profile && s.profile.name) || s.user.name || "").trim().split(/\s+/)[0];
  const shared = groups.filter((g) => g.access.length > 1).length;
  return html`<div class="hero">
    <${Logo} size=${170} tile=${false} cls="hero-mark" />
    <div class="hero-title">${first ? `Hi, ${first}` : "Your groups"}</div>
    <div class="hero-cols"><div><span class="lbl owed">You're owed</span>${lines(owed)}</div>
      <div><span class="lbl owe">You owe</span>${lines(owe)}</div></div>
    <div class="hero-foot">${count(groups.length, "group", "groups")}${shared ? ` · ${shared} shared` : ""} · ${count(o.friends.length, "friend", "friends")}</div>
  </div>`;
}

function GroupPage({ id, tab, sub }) {
  const s = useStore();
  const g = s.groups.get(id);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(sub === "add" ? "add" : null);
  useEffect(() => { if (sub === "add") { setDialog("add"); history.replaceState(null, "", `#/group/${id}/people`); } }, [sub]);
  if (!g) return html`<div class="empty"><p>${s.status === "syncing" ? "Loading group…" : "This group isn't available. It may have been deleted, or you no longer have access."}</p><a href="#/groups">Back to groups</a></div>`;
  const me = C.meIn(g, s.user.email);
  const owner = D.isOwner(g);
  const t = tab || "expenses";
  return html`<div>
    <div class="topbar">
      <a class="icon-btn" href="#/groups" aria-label="Back">${ICON.back}</a>
      <${CategoryTile} category=${g.category} size=${44} />
      <div class="grow"><h1 class="ellipsis">${g.name}</h1>
        <div class="small muted">${membersLabel(g)} · shared with ${g.access.length}</div></div>
      <button class="btn ghost small" onClick=${() => setDialog("share")}>Share</button>
      <div style="position:relative"><button class="icon-btn" aria-label="More" onClick=${() => setMenu(!menu)}>${ICON.more}</button>
        ${menu && html`<div class="card" style="position:absolute;right:0;top:44px;z-index:10;display:grid;padding:6px;min-width:190px;box-shadow:var(--shadow)">
          <button class="btn text" style="justify-content:flex-start" onClick=${() => { setMenu(false); setDialog("edit"); }}>Edit group</button>
          <button class="btn text" style="justify-content:flex-start" onClick=${() => { setMenu(false); setDialog("share"); }}>Shared with…</button>
          <button class="btn text danger" style="justify-content:flex-start" onClick=${() => { setMenu(false); setDialog("delete"); }}>${owner ? "Delete for everyone" : "Leave group"}</button>
        </div>`}</div>
    </div>
    ${!me && html`<${WhoAmI} g=${g} />`}
    <nav class="tabs">
      ${[["expenses", "Expenses"], ["balances", "Balances"], ["people", "People"]].map(([k, l]) => html`<a href=${`#/group/${id}/${k}`} class=${t === k ? "active" : ""}>${l}</a>`)}
    </nav>
    ${t === "expenses" && html`<${ExpensesTab} g=${g} />`}
    ${t === "balances" && html`<${BalancesTab} g=${g} />`}
    ${t === "people" && html`<${PeopleTab} g=${g} onAdd=${() => setDialog("add")} />`}
    <div class="fab">${t === "people"
      ? html`<button class="btn primary" onClick=${() => setDialog("add")}>+ Add people</button>`
      : html`<button class="btn primary" disabled=${!g.members.length} onClick=${() => go(`group/${id}/expense/new`)}>+ Add expense</button>`}</div>
    ${dialog === "edit" && html`<${GroupDialog} initial=${g} onClose=${() => setDialog(null)} />`}
    ${dialog === "share" && html`<${ShareDialog} g=${g} onClose=${() => setDialog(null)} />`}
    ${dialog === "add" && html`<${AddPeople} g=${g} onClose=${() => setDialog(null)} />`}
    ${dialog === "delete" && html`<${Confirm} title=${owner ? `Delete "${g.name}" for everyone?` : `Leave "${g.name}"?`}
      message=${owner ? "The group and all its expenses will be removed from every phone and browser it's shared with. This can't be undone."
        : "The group will be removed for you. It stays with everyone else, and they can invite you again."}
      label=${owner ? "Delete for everyone" : "Leave"} onYes=${() => { owner ? D.deleteForEveryone(id) : D.leave(id); go("groups"); }} onClose=${() => setDialog(null)} />`}
  </div>`;
}

function WhoAmI({ g }) {
  const s = D.state;
  const [picking, setPicking] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const free = g.members.filter((m) => !m.email);
  return html`<div class="banner"><b>Which one is you?</b>
    <p class="small" style="margin:4px 0 8px">Link yourself so you're picked as the payer by default and the Friends tab knows your share.</p>
    <div class="row wrap"><button class="btn text small" onClick=${() => setHidden(true)}>Later</button>
      ${free.length > 0 && html`<button class="btn ghost small" onClick=${() => setPicking(true)}>I'm in the list</button>`}
      <button class="btn primary small" onClick=${() => D.addProfileToGroup(g.id, s.profile || { name: s.user.name, email: s.user.email, adults: 1, kids: 0, friends: 0 })}>Add me</button></div>
    ${picking && html`<${Dialog} title="Which one is you?" onClose=${() => setPicking(false)} actions=${html`<button class="btn text" onClick=${() => setPicking(false)}>Cancel</button>`}>
      <div class="list">${free.map((m) => html`<div class="item clickable" onClick=${() => { D.linkMe(g.id, m.id); setPicking(false); }}>
        <${Avatar} name=${m.name} /><div class="grow"><b>${m.name}</b><div class="small muted">${describeMember(m)}</div></div></div>`)}</div></${Dialog}>`}
  </div>`;
}

function ExpensesTab({ g }) {
  const items = [...g.expenses.map((e) => ({ t: e.createdAt, e })), ...g.payments.map((p) => ({ t: p.createdAt, p }))].sort((a, b) => b.t - a.t);
  if (!g.members.length) return html`<div class="empty card"><div class="big">👥</div><p>Add people first, then add expenses.</p></div>`;
  if (!items.length) return html`<div class="empty card"><div class="big">🧾</div><h2>No expenses yet</h2><p>Add the first expense, like a hotel, dinner or tickets.</p></div>`;
  const name = (id) => (g.members.find((m) => m.id === id) || { name: "Someone" }).name;
  return html`<div>
    <div class="total-card" style=${`--c:${categoryStyle(g.category).color}`}><${Icon} name=${categoryStyle(g.category).icon} size=${150} cls="total-mark" />
      <span class="small">Total spent</span><b>${C.formatTotals(C.totals(g), g.currency)}</b><span class="small">${count(g.expenses.length, "expense", "expenses")} · ${membersLabel(g)} · click one to edit</span></div>
    <div class="list">${items.map(({ e, p }) => {
      const d = day(e ? e.createdAt : p.createdAt);
      const date = d.toLocaleString(undefined, { day: "numeric", month: "short" });
      if (p) return html`<div class="item payment"><${Tile} icon=${PAYMENT.icon} color=${PAYMENT.color} size=${44} /><div class="grow"><b>${name(p.from)} paid ${name(p.to)}</b><div class="small muted">${date} · Settle-up payment</div></div>
        <span class="amount">${C.formatMoney(p.amount, p.currency)}</span></div>`;
      const look = expenseStyle(e.name + " " + (e.description || ""));
      const all = e.splitAmong.length === g.members.length;
      return html`<div class="item clickable" onClick=${() => go(`group/${g.id}/expense/${e.id}`)}><${Tile} icon=${look.icon} color=${look.color} size=${44} />
        <div class="grow"><b>${e.name}</b><div class="small muted">${name(e.paidBy)} paid · split among ${all ? "everyone" : e.splitAmong.length + " of " + g.members.length}${C.isPerFamily(e, g) ? " · per family" : ""}</div>
          ${e.mode === "AGE" && html`<div class="small" style="color:var(--brand-strong)">${C.formatMoney(e.adultPrice, e.currency)} per adult · ${C.formatMoney(e.kidPrice, e.currency)} per kid${C.ageSubtotal(e) !== e.amount ? ` · ${e.amount > C.ageSubtotal(e) ? "+" : "−"}${C.formatMoney(Math.abs(e.amount - C.ageSubtotal(e)), e.currency)} ${e.amount > C.ageSubtotal(e) ? "tax" : "discount"}` : ""}</div>`}
          ${e.description && html`<div class="small muted">${e.description}</div>`}</div>
        <span class="amount">${C.formatMoney(e.amount, e.currency)}<span class="small muted when">${date}</span></span></div>`;
    })}</div></div>`;
}

function BalancesTab({ g }) {
  const [settle, setSettle] = useState(null);
  const curs = C.currenciesUsed(g);
  const name = (id) => (g.members.find((m) => m.id === id) || { name: "Someone" }).name;
  if (!curs.length) return html`<div class="empty card"><div class="big">⚖️</div><p>Balances appear once there are expenses.</p></div>`;
  return html`<div class="stack">
    ${curs.map((cur) => {
      const net = C.balances(g, cur);
      const t = C.settleUp(net, cur);
      return html`<div class="stack"><h3>${curs.length > 1 ? C.currencyLabel(cur) : "Who's up, who's down"}</h3>
        <div class="list">${g.members.map((m) => { const v = net.get(m.id) || 0; return html`<div class="item"><${Avatar} name=${m.name} />
          <div class="grow"><b>${m.name}</b></div><span class="amount ${v > 0 ? "good" : v < 0 ? "bad" : "muted"}">${v === 0 ? "settled" : (v > 0 ? "gets back " : "owes ") + C.formatMoney(Math.abs(v), cur)}</span></div>`; })}</div>
        ${t.length > 0 && html`<h3>Suggested payments</h3><div class="list">${t.map((x) => html`<div class="item"><span class="pair"><${Avatar} name=${name(x.from)} size=${34} /><span class="muted">→</span><${Avatar} name=${name(x.to)} size=${34} /></span>
          <div class="grow"><span class="small muted">${name(x.from)} pays ${name(x.to)}</span><b style="display:block">${C.formatMoney(x.amount, cur)}</b></div><button class="btn ghost small" onClick=${() => setSettle(x)}>Mark paid</button></div>`)}</div>`}
      </div>`;
    })}
    ${g.members.length >= 2 && html`<button class="btn ghost" style="justify-self:start" onClick=${() => setSettle({})}>Record a payment</button>`}
    ${settle && html`<${SettleDialog} g=${g} prefill=${settle} onClose=${() => setSettle(null)} />`}
  </div>`;
}

function SettleDialog({ g, prefill, onClose }) {
  const [from, setFrom] = useState(prefill.from || g.members[0].id);
  const [to, setTo] = useState(prefill.to || g.members[1].id);
  const [amount, setAmount] = useState(prefill.amount ? C.toInput(prefill.amount) : "");
  const [cur, setCur] = useState(prefill.currency || g.currency);
  const cents = C.parseMoney(amount);
  const ok = from !== to && cents > 0;
  const pick = (v, set) => html`<select class="input" value=${v} onChange=${(e) => set(e.target.value)}>${g.members.map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select>`;
  return html`<${Dialog} title="Record a payment" onClose=${onClose}
    actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok} onClick=${() => { D.addPayment(g.id, { from, to, amount: cents, currency: cur }); onClose(); }}>Save</button>`}>
    <label class="field">Who paid${pick(from, setFrom)}</label><label class="field">Paid to${pick(to, setTo)}</label>
    <div class="row"><label class="field grow">Amount<input class="input" inputmode="decimal" value=${amount} onInput=${(e) => setAmount(e.target.value)} /></label>
      <label class="field grow">Currency<${CurrencySelect} value=${cur} onChange=${setCur} /></label></div>
    ${from === to && html`<span class="hint error">Pick two different people</span>`}
  </${Dialog}>`;
}

function PeopleTab({ g, onAdd }) {
  const s = D.state;
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  if (!g.members.length) return html`<div class="empty card"><div class="big">👥</div><h2>No people yet</h2><p>Add everyone who's part of this group.</p><button class="btn primary" onClick=${onAdd}>Add people</button></div>`;
  return html`<div><div class="list">${g.members.map((m) => html`<div class="item"><${Avatar} name=${m.name} />
    <div class="grow"><b>${m.name}${m.email === s.user.email ? " (you)" : ""}</b>
      ${m.isFamily && html`<div class="small muted">${describeMember(m)}</div>`}
      ${m.email && html`<div class="small muted">${m.email}${g.access.includes(m.email) ? "" : " · not invited"}${m.custom ? " · size set by hand" : ""}</div>`}</div>
    <button class="btn text small" onClick=${() => setEditing(m)}>Edit</button>
    <button class="btn text small danger" onClick=${() => setRemoving(m)}>Remove</button></div>`)}</div>
    ${editing && html`<${MemberDialog} g=${g} member=${editing} onClose=${() => setEditing(null)} />`}
    ${removing && (C.isInvolved(g, removing.id)
      ? html`<${Dialog} title=${`Can't remove ${removing.name}`} onClose=${() => setRemoving(null)} actions=${html`<button class="btn primary" onClick=${() => setRemoving(null)}>OK</button>`}>
          <p class="muted" style="margin:0">${removing.name} is part of some expenses or payments. Edit or delete those first.</p></${Dialog}>`
      : html`<${Confirm} title=${`Remove ${removing.name}?`} message="They'll be removed from this group." label="Remove"
          onYes=${() => D.removeMember(g.id, removing.id)} onClose=${() => setRemoving(null)} />`)}
  </div>`;
}

function MemberDialog({ g, member, onClose }) {
  const [name, setName] = useState(member ? member.name : "");
  const [email, setEmail] = useState(member ? member.email : "");
  const [family, setFamily] = useState(member ? member.isFamily : false);
  const [adults, setAdults] = useState(member && member.isFamily ? member.adults : 2);
  const [kids, setKids] = useState(member ? member.kids : 0);
  const taken = g.members.filter((m) => !member || m.id !== member.id);
  const clean = email.trim().toLowerCase();
  const nameClash = name.trim() && taken.some((m) => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  const mailErr = clean && (!C.isEmail(clean) ? "Enter a full email address" : taken.some((m) => m.email === clean) ? "Already linked to someone else" : "");
  const ok = name.trim() && !nameClash && !mailErr;
  const save = () => {
    const custom = member && member.email && clean === member.email ? true : (member ? member.custom : false);
    D.saveMember(g.id, { ...(member || {}), name: name.trim(), email: clean, isFamily: family, adults: family ? adults : 1, kids: family ? kids : 0, friends: 0, custom });
    onClose();
  };
  return html`<${Dialog} title=${member ? "Edit " + member.name : "Add a person"} onClose=${onClose}
    actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!ok} onClick=${save}>${member ? "Save" : "Add"}</button>`}>
    <label class="field">${family ? "Family name" : "Name"}<input class="input ${nameClash ? "error" : ""}" value=${name} maxlength="100" onInput=${(e) => setName(e.target.value)} autofocus />
      ${nameClash && html`<span class="hint error">Someone with this name is already in the group</span>`}</label>
    <label class="field">Gmail (optional)<input class="input ${mailErr ? "error" : ""}" type="email" value=${email} onInput=${(e) => setEmail(e.target.value)} />
      <span class="hint ${mailErr ? "error" : ""}">${mailErr || "Links this person to their Google account and gives them access"}</span></label>
    <label class="check"><input type="checkbox" checked=${family} onChange=${(e) => setFamily(e.target.checked)} /> This is a family</label>
    ${family && html`<${Stepper} label="Adults" value=${adults} min=${1} onChange=${setAdults} /><${Stepper} label="Kids" value=${kids} min=${0} onChange=${setKids} />`}
    ${member && member.email && html`<p class="small muted" style="margin:0">Saving here sets ${member.name}'s size by hand for this group, instead of following their profile.</p>`}
  </${Dialog}>`;
}

function AddPeople({ g, onClose }) {
  const s = D.state;
  const [mode, setMode] = useState("choose");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [added, setAdded] = useState([]);
  const linked = new Set(g.members.map((m) => m.email));
  const joined = g.access.filter((a) => !linked.has(a));
  const search = async (text) => { const v = text ?? q; if (!v.trim()) return; setBusy(true); setRes(null); setRes(await D.findUser(v)); setBusy(false); };
  if (mode === "manual") return html`<${MemberDialog} g=${g} onClose=${onClose} />`;
  if (mode === "choose") return html`<${Dialog} title="Add people" onClose=${onClose} actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button>`}>
    <button class="choice" onClick=${() => setMode("manual")}><b>✍️ Create manually</b><span class="small muted">Type a name. Works for anyone, even without MySplitIt.</span></button>
    <button class="choice" onClick=${() => setMode("find")}><b>🔍 Add a MySplitIt user</b><span class="small muted">Find them by email or phone number. Their family comes along.</span></button>
  </${Dialog}>`;
  const p = res && res.profile;
  const existing = p && g.members.find((m) => m.email === p.email);
  return html`<${Dialog} title="Add a MySplitIt user" onClose=${onClose} actions=${html`<button class="btn primary" onClick=${onClose}>Done</button>`}>
    ${joined.length > 0 && html`<div class="stack"><span class="small muted">Joined this group · click to add</span>
      ${joined.map((j) => html`<button class="btn ghost small" onClick=${() => { setQ(j); search(j); }}>${j}</button>`)}</div>`}
    <div class="row"><input class="input grow" placeholder="friend@gmail.com or phone number" value=${q} onInput=${(e) => { setQ(e.target.value); setRes(null); }}
      onKeyDown=${(e) => e.key === "Enter" && search()} /><button class="btn primary" disabled=${busy || !q.trim()} onClick=${() => search()}>${busy ? "…" : "Search"}</button></div>
    ${res && res.problem && html`<p class="bad" style="margin:0">${res.problem}</p>`}
    ${p && html`<div class="card stack" style="background:var(--brand-soft)"><div class="row"><${Avatar} name=${p.name} /><div><b>${p.name}</b><div class="small">${p.email}</div></div></div>
      <span class="small">Comes with: ${[count(p.adults, "adult", "adults"), p.kids && count(p.kids, "kid", "kids"), p.friends && count(p.friends, "friend", "friends")].filter(Boolean).join(" · ")}${p.friends ? " (friends count as adults)" : ""}</span>
      ${res.byPhone && html`<span class="small muted">Phone numbers aren't verified. Check this is the right person.</span>`}
      ${existing ? html`<span style="color:var(--brand-strong)">Already in this group as ${existing.name}</span>`
        : html`<button class="btn primary" style="justify-self:end" onClick=${() => { D.addProfileToGroup(g.id, p); setAdded([...added, p.name]); setRes(null); setQ(""); }}>Add</button>`}</div>`}
    ${res && res.none && html`<div class="card stack">${res.email
      ? html`<span>No MySplitIt account uses ${res.email} yet.</span><span class="small muted">You can still add them; they'll see the group once they sign in with this email.</span>
        <button class="btn ghost" style="justify-self:end" onClick=${() => {
          const taken = new Set(g.members.map((m) => m.name.trim().toLowerCase()));
          let n = C.nameFromEmail(res.email); if (taken.has(n.toLowerCase())) n += ` (${res.email.split("@")[0]})`;
          D.saveMember(g.id, { name: n, email: res.email, isFamily: false, adults: 1, kids: 0 }); setAdded([...added, n]); setRes(null); setQ("");
          location.href = `mailto:${encodeURIComponent(res.email)}?subject=${encodeURIComponent(`Join "${g.name}" on MySplitIt`)}&body=${encodeURIComponent(`Hi! I've added you to "${g.name}" on MySplitIt. Sign in with Google using ${res.email} at ${location.origin}${location.pathname} or in the MySplitIt app, and the group will show up.`)}`;
        }}>Add and invite by email</button>`
      : html`<span>No MySplitIt account has this number.</span><span class="small muted">Ask for their Gmail address instead.</span>`}</div>`}
    ${added.length > 0 && html`<p class="small" style="margin:0;color:var(--brand-strong)">Added: ${added.join(", ")}</p>`}
  </${Dialog}>`;
}

function ShareDialog({ g, onClose }) {
  const s = D.state;
  const [email, setEmail] = useState("");
  const clean = email.trim().toLowerCase();
  const owner = D.isOwner(g);
  const already = g.access.includes(clean);
  const ok = C.isEmail(clean) && !already && g.access.length < C.MAX_ACCESS;
  return html`<${Dialog} title="Shared with" onClose=${onClose} actions=${html`<button class="btn primary" onClick=${onClose}>Done</button>`}>
    <div class="list">${g.access.map((a) => html`<div class="item"><div class="grow"><span>${a}</span>
      <div class="small" style="color:var(--brand-strong)">${[a === s.user.email && "you", a === g.ownerEmail && "owner"].filter(Boolean).join(" · ")}</div></div>
      ${owner && a !== g.ownerEmail && html`<button class="btn text small danger" onClick=${() => D.removeAccess(g.id, a)}>Remove</button>`}</div>`)}</div>
    <label class="field">Invite by Gmail address<div class="row"><input class="input grow" type="email" placeholder="friend@gmail.com" value=${email} onInput=${(e) => setEmail(e.target.value)}
      onKeyDown=${(e) => { if (e.key === "Enter" && ok) { D.invite(g.id, clean); setEmail(""); } }} />
      <button class="btn primary" disabled=${!ok} onClick=${() => { D.invite(g.id, clean); setEmail(""); }}>Invite</button></div>
      <span class="hint">${already ? "Already has access" : "Use the Google account they'll sign in with"}</span></label>
  </${Dialog}>`;
}

// ---------- Expense editor ----------
function ExpensePage({ gid, eid }) {
  const s = useStore();
  const g = s.groups.get(gid);
  if (!g) return html`<p class="muted">Loading…</p>`;
  return html`<${ExpenseForm} g=${g} existing=${eid !== "new" ? g.expenses.find((e) => e.id === eid) : null} key=${eid} />`;
}

function ExpenseForm({ g, existing }) {
  const s = D.state;
  const ids = g.members.map((m) => m.id);
  const sub = existing && existing.mode === "AGE" ? C.ageSubtotal(existing) : 0;
  const [name, setName] = useState(existing ? existing.name : "");
  const [mode, setMode] = useState(existing ? existing.mode : "EQUAL");
  const [amountText, setAmountText] = useState(existing && existing.mode === "EQUAL" ? C.toInput(existing.amount) : "");
  const [adultText, setAdultText] = useState(existing && existing.mode === "AGE" ? C.toInput(existing.adultPrice) : "");
  const [kidText, setKidText] = useState(existing && existing.mode === "AGE" ? C.toInput(existing.kidPrice) : "");
  const [paidText, setPaidText] = useState(existing && existing.mode === "AGE" && existing.amount !== sub ? C.toInput(existing.amount) : "");
  const [cur, setCur] = useState(existing ? existing.currency : g.currency);
  const [desc, setDesc] = useState(existing ? existing.description : "");
  const lastPayer = [...g.expenses].sort((a, b) => b.createdAt - a.createdAt)[0];
  const [paidBy, setPaidBy] = useState(existing ? existing.paidBy : C.meIn(g, s.user.email) || (lastPayer && ids.includes(lastPayer.paidBy) ? lastPayer.paidBy : ids[0]));
  const [all, setAll] = useState(!existing || existing.splitAmong.length === ids.length);
  const [chosen, setChosen] = useState(existing ? existing.splitAmong : ids);
  const [counts, setCounts] = useState(existing ? existing.counts : {});
  const anyFamilies = g.members.some((m) => m.adults + m.kids > 1);
  const [perFamily, setPerFamily] = useState(existing ? C.isPerFamily(existing, g) : false);
  const familyMode = mode === "EQUAL" && perFamily;
  const [editCounts, setEditCounts] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const people = all ? ids : chosen.filter((x) => ids.includes(x));
  const countsFor = (id) => counts[id] || (() => { const m = g.members.find((x) => x.id === id); return { adults: m.adults, kids: m.kids }; })();
  const snap = Object.fromEntries(people.map((id) => [id, familyMode ? { adults: 1, kids: 0 } : countsFor(id)]));
  const adultPrice = C.parseMoney(adultText);
  const kidPrice = C.parseMoney(kidText);
  const ticketTotal = people.reduce((sum, id) => sum + snap[id].adults * (adultPrice || 0) + snap[id].kids * (kidPrice || 0), 0);
  const paid = paidText.trim() ? C.parseMoney(paidText) : null;
  const amount = mode === "EQUAL" ? C.parseMoney(amountText) : (paid ?? ticketTotal);
  const draft = { id: existing && existing.id, name: name.trim(), description: desc.trim(), amount: amount || 0, currency: cur, paidBy, splitAmong: people, createdAt: existing ? existing.createdAt : 0,
    mode, counts: snap, adultPrice: mode === "AGE" ? adultPrice || 0 : 0, kidPrice: mode === "AGE" ? kidPrice || 0 : 0 };
  const shares = amount > 0 && people.length ? C.expenseShares(draft) : new Map();
  const base = mode === "AGE" ? new Map(C.ageBaseShares(draft)) : new Map();
  const errors = { name: !name.trim(), amount: !(amount > 0) || (mode === "AGE" && (adultPrice == null || kidPrice == null)), people: !people.length };
  const back = () => go(`group/${g.id}/expenses`);
  const save = () => { if (Object.values(errors).some(Boolean)) { setShowErr(true); return; } D.saveExpense(g.id, draft); back(); };
  const totalHeads = people.reduce((sum, id) => sum + snap[id].adults + snap[id].kids, 0);
  const extra = mode === "AGE" && paid != null && ticketTotal > 0 ? paid - ticketTotal : 0;
  const ref = useAutofocus();
  return html`<div class="stack" style="max-width:720px" ref=${ref}>
    <div class="topbar"><button class="icon-btn" aria-label="Back" onClick=${back}>${ICON.back}</button><h1 class="grow">${existing ? "Edit expense" : "Add expense"}</h1>
      ${existing && html`<button class="btn text danger" onClick=${() => setConfirmDel(true)}>Delete</button>`}
      <button class="btn primary" onClick=${save}>Save</button></div>
    <div class="card stack">
      <label class="field">Expense name<input class="input ${showErr && errors.name ? "error" : ""}" value=${name} maxlength="100" placeholder="e.g. Dinner" onInput=${(e) => setName(e.target.value)} autofocus /></label>
      <div class="seg"><button type="button" aria-pressed=${mode === "EQUAL"} onClick=${() => setMode("EQUAL")}>One total amount</button><button type="button" aria-pressed=${mode === "AGE"} onClick=${() => setMode("AGE")}>Adult & kid prices</button></div>
      <div class="row wrap">
        <label class="field" style="min-width:160px">Currency<${CurrencySelect} value=${cur} onChange=${setCur} /></label>
        ${mode === "EQUAL" ? html`<label class="field grow">Amount<input class="input ${showErr && errors.amount ? "error" : ""}" inputmode="decimal" value=${amountText} placeholder="0" onInput=${(e) => setAmountText(e.target.value)} /></label>`
          : html`<label class="field grow">Per adult<input class="input" inputmode="decimal" value=${adultText} onInput=${(e) => setAdultText(e.target.value)} /></label>
                 <label class="field grow">Per kid<input class="input" inputmode="decimal" value=${kidText} onInput=${(e) => setKidText(e.target.value)} /></label>`}
      </div>
      ${mode === "EQUAL" && anyFamilies && html`<label class="check per-family"><input type="checkbox" checked=${perFamily}
          onChange=${(e) => { setPerFamily(e.target.checked); if (!e.target.checked) setCounts({}); }} />
        <span><b>Split per family</b><span class="hint" style="display:block">${perFamily
          ? "Each family or person pays one equal share, however many people it has. Good for a villa, a room or a car."
          : "Off: split per head, so a family of 4 pays 4 shares."}</span></span></label>`}
      ${mode === "AGE" && html`<label class="field">Total paid, with tax (optional)<input class="input" inputmode="decimal" value=${paidText} onInput=${(e) => setPaidText(e.target.value)} />
        <span class="hint">${extra > 0 ? `Includes ${C.formatMoney(extra, cur)} tax & charges (${Math.round(extra * 100 / ticketTotal)}%), shared by ticket cost`
          : extra < 0 ? `${C.formatMoney(-extra, cur)} discount, shared by ticket cost` : ticketTotal > 0 ? `Tickets come to ${C.formatMoney(ticketTotal, cur)}. If the bill was more (tax, charges), enter it here` : "If the bill included tax or charges, enter the full amount here"}</span></label>`}
      <label class="field">Description (optional)<textarea class="input" rows="2" maxlength="1000" onInput=${(e) => setDesc(e.target.value)}>${desc}</textarea></label>
      <label class="field">Paid by<select class="input" value=${paidBy} onChange=${(e) => setPaidBy(e.target.value)}>${g.members.map((m) => html`<option value=${m.id}>${m.name}</option>`)}</select></label>
    </div>
    <div class="card stack">
      <h3>${familyMode ? "Split equally (per family) between" : "Who's included"}</h3>
      <div class="seg"><button type="button" aria-pressed=${all} onClick=${() => setAll(true)}>Everyone (${membersLabel(g)})</button>
        <button type="button" aria-pressed=${!all} onClick=${() => { setAll(false); if (all) setChosen(ids); }}>Only some</button></div>
      <div class="list">${!all && html`<label class="item select-all"><input type="checkbox" checked=${people.length === ids.length}
          indeterminate=${people.length > 0 && people.length < ids.length} style="width:18px;height:18px;accent-color:var(--brand)"
          onChange=${() => setChosen(people.length === ids.length ? [] : ids)} />
        <b class="grow">Select all</b><span class="small muted">${people.length} of ${ids.length}</span></label>`}
      ${g.members.map((m) => {
        const inc = people.includes(m.id);
        const c = countsFor(m.id);
        const b = base.get(m.id); const sh = shares.get(m.id);
        return html`<div class="item"><input type="checkbox" checked=${inc} disabled=${all} style="width:18px;height:18px;accent-color:var(--brand)"
            onChange=${(e) => setChosen(e.target.checked ? [...people, m.id] : people.filter((x) => x !== m.id))} />
          <${Avatar} name=${m.name} size=${32} />
          <div class="grow"><b>${m.name}</b>
            ${inc && b != null && sh != null && sh !== b && html`<div class="small muted">${C.formatMoney(b, cur)} ${sh > b ? "+" : "−"} ${C.formatMoney(Math.abs(sh - b), cur)} ${sh > b ? "tax" : "discount"}</div>`}
            ${inc && familyMode && html`<div class="small muted">${m.adults + m.kids > 1 ? "1 share for the family" : "1 share"}</div>`}
            ${inc && !familyMode && html`<button class="chip" onClick=${() => setEditCounts(m)}>${C.describeCounts(c)} ✎</button>`}</div>
          <span class="amount">${inc ? (sh != null ? C.formatMoney(sh, cur) : "—") : html`<span class="small muted">not included</span>`}</span></div>`;
      })}</div>
      ${showErr && errors.people && html`<span class="hint error">Select at least one person</span>`}
      ${amount > 0 && people.length > 0 && html`<p class="small" style="margin:0;color:var(--brand-strong)">${familyMode
        ? `${amount % people.length === 0 ? "" : "About "}${C.formatMoney(Math.floor(amount / people.length), cur)} each · ${count(people.length, "share", "shares")} (each family counts once) · paid by ${(g.members.find((m) => m.id === paidBy) || {}).name}`
        : mode === "EQUAL"
        ? `${amount % totalHeads === 0 ? "" : "About "}${C.formatMoney(Math.floor(amount / totalHeads), cur)} per person · ${count(totalHeads, "person", "people")} · paid by ${(g.members.find((m) => m.id === paidBy) || {}).name}`
        : `Tickets ${C.formatMoney(ticketTotal, cur)}${extra ? ` ${extra > 0 ? "+" : "−"} ${C.formatMoney(Math.abs(extra), cur)} ${extra > 0 ? "tax" : "discount"} = ${C.formatMoney(amount, cur)} paid` : ""}`}</p>`}
    </div>
    ${showErr && (errors.name || errors.amount) && html`<p class="bad" style="margin:0">Fill in the name and amount.</p>`}
    ${editCounts && html`<${CountsDialog} m=${editCounts} c=${countsFor(editCounts.id)} onSave=${(c) => { setCounts({ ...counts, [editCounts.id]: c }); setEditCounts(null); }} onClose=${() => setEditCounts(null)} />`}
    ${confirmDel && html`<${Confirm} title="Delete this expense?" message=${`"${existing.name}" will be removed for everyone in the group.`} label="Delete"
      onYes=${() => { D.deleteExpense(g.id, existing.id); back(); }} onClose=${() => setConfirmDel(false)} />`}
  </div>`;
}

function CountsDialog({ m, c, onSave, onClose }) {
  const [a, setA] = useState(c.adults);
  const [k, setK] = useState(c.kids);
  return html`<${Dialog} title=${"Who from " + m.name + "?"} onClose=${onClose}
    actions=${html`<button class="btn text" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${a + k === 0} onClick=${() => onSave({ adults: a, kids: k })}>Save</button>`}>
    <p class="muted" style="margin:0">How many of them are part of this expense?</p>
    <${Stepper} label="Adults" value=${a} min=${0} onChange=${setA} /><${Stepper} label="Kids" value=${k} min=${0} onChange=${setK} /></${Dialog}>`;
}

// ---------- Friends ----------
function FriendsPage() {
  const s = useStore();
  const o = C.friendsOverview([...s.groups.values()], s.user.email);
  return html`<div class="stack"><div class="topbar"><h1>Friends</h1></div>
    ${o.groupsWithoutYou.length > 0 && html`<div class="banner"><b>Which one is you?</b><p class="small" style="margin:4px 0">Open these groups and pick yourself, so their amounts show here:</p>
      ${o.groupsWithoutYou.map((g) => html`<a class="btn text small" href=${"#/group/" + g.id}>${emoji(g.category)} ${g.name}</a>`)}</div>`}
    ${!o.friends.length ? html`<div class="empty card"><div class="big">🤝</div><h2>No friends yet</h2><p>People you share groups with show up here.</p></div>`
      : html`<div class="list">${o.friends.map((f) => html`<div class="item clickable" onClick=${() => go("friend/" + encodeURIComponent(f.key))}>
        <${Avatar} name=${f.name} /><div class="grow"><b>${f.name}</b><div class="small muted ellipsis">${[...new Set(f.lines.map((l) => l.groupName))].join(", ")}</div></div>
        <div style="text-align:right">${f.totals.size === 0 ? html`<span class="small muted">settled up</span>` : [...f.totals].map(([c, v]) =>
          html`<div class="amount ${v > 0 ? "good" : "bad"}">${v > 0 ? "owes you " : "you owe "}${C.formatMoney(Math.abs(v), c)}</div>`)}</div></div>`)}</div>`}
  </div>`;
}

function FriendPage({ fkey: k }) {
  const s = useStore();
  const [settle, setSettle] = useState(null);
  const f = C.friendsOverview([...s.groups.values()], s.user.email).friends.find((x) => x.key === k);
  if (!f) return html`<div class="empty"><p>Nothing here.</p><a href="#/friends">Back to friends</a></div>`;
  return html`<div class="stack" style="max-width:720px">
    <div class="topbar"><a class="icon-btn" href="#/friends" aria-label="Back">${ICON.back}</a><h1 class="grow">${f.name}</h1></div>
    <div class="card center stack"><div style="justify-self:center"><${Avatar} name=${f.name} size=${64} /></div>
      ${f.email && html`<span class="small muted">${f.email}</span>`}
      ${f.totals.size === 0 ? html`<h2>You're settled up</h2>` : [...f.totals].map(([c, v]) => html`<h2 class=${v > 0 ? "good" : "bad"}>${v > 0 ? `${f.name} owes you ${C.formatMoney(v, c)}` : `You owe ${f.name} ${C.formatMoney(-v, c)}`}</h2>`)}
      <span class="small muted">Across ${count(f.lines.length, "group", "groups")}, using each group's suggested payments.</span></div>
    <h3>By group</h3>
    <div class="list">${f.lines.map((l) => {
      const g = s.groups.get(l.groupId); if (!g) return null;
      const first = [...l.amounts].find(([, v]) => v !== 0);
      const me = C.meIn(g, s.user.email);
      return html`<div class="item"><${CategoryTile} category=${g.category} size=${40} />
        <div class="grow clickable" style="cursor:pointer" onClick=${() => go("group/" + g.id)}><b>${g.name}</b>
          ${l.amounts.size === 0 || !first ? html`<div class="small muted">settled up</div>` : [...l.amounts].filter(([, v]) => v).map(([c, v]) => html`<div class="small ${v > 0 ? "good" : "bad"}">${v > 0 ? "owes you " : "you owe "}${C.formatMoney(Math.abs(v), c)}</div>`)}</div>
        ${first && me && html`<button class="btn ghost small" onClick=${() => setSettle({ g, t: first[1] > 0 ? { from: l.memberId, to: me, amount: first[1], currency: first[0] } : { from: me, to: l.memberId, amount: -first[1], currency: first[0] } })}>Settle</button>`}</div>`;
    })}</div>
    ${settle && html`<${SettleDialog} g=${settle.g} prefill=${settle.t} onClose=${() => setSettle(null)} />`}
  </div>`;
}

// ---------- Account ----------
function AccountPage() {
  const s = useStore();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = s.profile;
  return html`<div class="stack" style="max-width:640px"><div class="topbar"><h1>Account</h1></div>
    <div class="card row"><${Avatar} name=${(p && p.name) || s.user.name} size=${48} /><div class="grow"><b>${(p && p.name) || s.user.name}</b><div class="small muted">${s.user.email}</div></div></div>
    ${editing ? html`<${ProfileForm} onDone=${() => setEditing(false)} />` : html`<div class="card stack"><h3>Your profile</h3>
      ${p ? html`<span>You come with: ${[count(p.adults, "adult", "adults"), p.kids && count(p.kids, "kid", "kids"), p.friends && count(p.friends, "friend", "friends")].filter(Boolean).join(" · ")}</span>
        <span class="small muted">${s.myPhone ? `Findable by email and ${s.myPhone}` : "Add your phone number to finish your profile"}</span>` : html`<span class="muted">Not set up yet.</span>`}
      <button class="btn ghost" style="justify-self:start" onClick=${() => setEditing(true)}>${p ? "Edit profile" : "Set up profile"}</button></div>`}
    <${InstallBanner} always=${true} />
    <div class="card stack"><h3>App</h3>
      <span class="small muted">Get the Android app for offline use on your phone, app lock and more.</span>
      <div class="row wrap"><a class="btn ghost" href="../#download">Download the Android app</a><button class="btn ghost" onClick=${toggleTheme}>Switch light / dark</button></div></div>
    <div class="row wrap"><button class="btn ghost" onClick=${() => D.signOut()}>Sign out</button>
      <button class="btn text danger" onClick=${() => setConfirmDelete(true)}>Delete account</button></div>
    ${confirmDelete && html`<${DeleteAccountDialog} onClose=${() => setConfirmDelete(false)} />`}
  </div>`;
}

/** Explains what goes, asks Google to confirm it's you, then deletes the account. */
function DeleteAccountDialog({ onClose }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const shared = [...s.groups.values()];
  const own = shared.filter((g) => g.owner === s.user.uid).length;
  const others = shared.length - own;
  const go = async () => {
    setBusy(true); setMsg("");
    const m = await D.deleteAccount();
    if (m) { setMsg(m); setBusy(false); return; }
    try { sessionStorage.setItem("mysplitit-deleted", "1"); } catch (e) { /* just reload */ }
    location.replace(location.pathname + location.search);
  };
  return html`<${Dialog} title="Delete your account?" onClose=${busy ? null : onClose} actions=${html`
      <button class="btn text" disabled=${busy} onClick=${onClose}>Cancel</button>
      <button class="btn primary danger-fill" disabled=${busy} onClick=${go}>${busy ? "Deleting…" : "Delete account"}</button>`}>
    <p style="margin:0">This permanently deletes:</p>
    <ul style="margin:0;padding-left:20px">
      <li>your profile and phone number</li>
      ${own > 0 && html`<li>${own === 1 ? "the 1 shared group you created, for everyone in it" : `the ${own} shared groups you created, for everyone in them`}</li>`}
      ${others > 0 && html`<li>you from ${others} group${others === 1 ? "" : "s"} others shared with you (your name stays in their past expenses)</li>`}
      <li>your MySplitIt sign-in</li>
    </ul>
    <p class="small muted" style="margin:0">Groups that are only on your Android phone stay there. This can't be undone. Google may ask you to confirm your account first.</p>
    ${msg && html`<p class="bad" style="margin:0">${msg}</p>`}
  <//>`;
}

// ---------- Shell ----------
function App() {
  const s = useStore();
  const route = useRoute();
  if (!s.authReady) return html`<div class="boot"><img src="../assets/icon.svg" alt="" width="56" height="56" /><p>Loading MySplitIt…</p></div>`;
  if (!s.user) return html`<${SignIn} />`;
  if (D.needsProfile()) return html`<div class="auth"><${ProfileForm} first=${true} /></div>`;
  const [page, a, b, c] = route;
  const section = page === "friends" || page === "friend" ? "friends" : page === "account" ? "account" : "groups";
  let body;
  if (page === "group" && b === "expense") body = html`<${ExpensePage} gid=${a} eid=${c} />`;
  else if (page === "group") body = html`<${GroupPage} id=${a} tab=${b} sub=${c} />`;
  else if (page === "friends") body = html`<${FriendsPage} />`;
  else if (page === "friend") body = html`<${FriendPage} fkey=${a} />`;
  else if (page === "account") body = html`<${AccountPage} />`;
  else body = html`<${GroupsPage} />`;
  const nav = [["groups", "Groups"], ["friends", "Friends"], ["account", "Account"]];
  return html`<div class="shell">
    <aside class="side"><a class="brand" href="../"><${Logo} size=${34} />MySplitIt</a>
      <nav class="nav">${nav.map(([k, l]) => html`<a href=${"#/" + k} class=${section === k ? "active" : ""}>${ICON[k]}${l}</a>`)}</nav>
      <div class="foot"><span class=${"status " + s.status}>${{ synced: "● Synced", syncing: "Syncing…", offline: "Offline · will sync later" }[s.status] || ""}</span>
        <span class="ellipsis">${s.user.email}</span><button class="btn text small" style="justify-self:start;padding:0" onClick=${toggleTheme}>${ICON.theme} Theme</button></div></aside>
    <main class="main">
      <a class="mobile-brand" href="#/groups"><${Logo} size=${32} /><span>MySplitIt</span></a>
      ${s.error && html`<div class="banner error row"><span class="grow small">${s.error}</span><button class="btn text small" onClick=${() => D.setError(null)}>OK</button></div>`}
      ${body}</main>
    <nav class="bottom-nav">${nav.map(([k, l]) => html`<a href=${"#/" + k} class=${section === k ? "active" : ""}>${ICON[k]}${l}</a>`)}</nav>
  </div>`;
}

render(html`<${App} />`, document.getElementById("root"));
