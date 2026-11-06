// MySplitIt web: sign-in, live sync and saving, using the same Firebase project and data
// layout as the Android app. Access is enforced by the Firestore security rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut,
  connectAuthEmulator, signInWithCredential, getRedirectResult, deleteUser, reauthenticateWithPopup, reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator,
  collection, doc, query, where, onSnapshot, writeBatch, getDocFromServer, arrayUnion, arrayRemove, terminate, clearIndexedDbPersistence,
  serverTimestamp, getDocsFromServer, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as C from "./core.js?v=20261106a";

const firebaseConfig = {
  apiKey: "AIzaSyCwvtv268fZG-_kj4aaHgMa732_AckKoKw",
  authDomain: "splitit-4575e.firebaseapp.com",
  projectId: "splitit-4575e",
  storageBucket: "splitit-4575e.firebasestorage.app",
  messagingSenderId: "44716189007",
  appId: "1:44716189007:web:9ee8ad25fa99726184113a",
};

// Local testing only: http://localhost:…/app/?emulator talks to the Firebase emulator.
const local = ["localhost", "127.0.0.1"].includes(location.hostname);
export const usesEmulator = local && new URLSearchParams(location.search).has("emulator");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
let db;
try {
  // Keeps a full copy in the browser so the app works offline, like on the phone.
  db = initializeFirestore(app, { localCache: usesEmulator ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
}
if (usesEmulator) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

// ---------- A tiny observable state ----------
export const state = {
  user: null, authReady: false, profile: null, profileLoaded: false, myPhone: "", phoneLoaded: false,
  phoneVerified: false, phoneVerifiedAt: 0, whatsapp: "", savedPhone: "", configLoaded: false,
  groups: new Map(), status: "signed-out", error: null, ready: false,
};
const subs = new Set();
let queued = false;
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function changed() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; subs.forEach((f) => f()); });
}
export function setError(msg) { state.error = msg; changed(); }

const groupRef = (id) => doc(db, "groups", id);
const sub = (gid, part, id) => doc(db, "groups", gid, part, id);
const retryDelay = (n) => Math.min(2000 * 2 ** Math.min(n, 4), 30000);
function fail(e) {
  console.warn("MySplitIt sync problem", e);
  if (e && e.code === "unavailable") return;
  setError(e && e.code === "permission-denied"
    ? "A change couldn't be saved. If someone removed you from this group, it will disappear shortly."
    : "Something went wrong: " + ((e && e.message) || "unknown error"));
}
const commit = (b) => b.commit().catch(fail);

// ---------- Signing in ----------
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      throw e;
    }
  }
}
getRedirectResult(auth).catch(() => {});

/** Emulator only: signs in as a made-up Google account (the real Firebase rejects this). */
const testToken = (email) => JSON.stringify({ sub: "test-" + email, email, email_verified: true, name: email.split("@")[0] });
export async function signInForTesting(email) {
  if (!usesEmulator) throw new Error("Not available");
  await signInWithCredential(auth, GoogleAuthProvider.credential(testToken(email)));
}

// ---------- Deleting your account ----------
/**
 * Deletes your MySplitIt account: the shared groups you created (for everyone in them), you from
 * other people's groups (your name stays in their history, without your email), your profile,
 * phone number and lookups, and finally your sign-in. Returns a message if something went
 * wrong, or null when done (the page then reloads, signed out).
 */
export async function deleteAccount() {
  const fu = auth.currentUser, u = state.user;
  if (!fu || !u) return "Sign in first.";
  // Google wants a fresh sign-in before an account is deleted. Ask first, so nothing is deleted
  // if you cancel (and so the Google window opens straight from your click).
  if (!(Date.now() - Date.parse(fu.metadata.lastSignInTime || 0) < 4 * 60000)) {
    const m = await reauth(fu);
    if (m) return m;
  }
  stopWatching();
  const commitAll = async (ops) => {
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach((op) => op(b));
      await b.commit();
    }
  };
  try {
    const priv = await getDocFromServer(doc(db, "private", u.uid));
    const phone = priv.exists() ? priv.data().phone || "" : "";
    const groups = await getDocsFromServer(query(collection(db, "groups"), where("access", "array-contains", u.email)));
    for (const g of groups.docs) {
      if (g.data().owner === u.uid) {
        const refs = [];
        for (const part of ["members", "expenses", "payments"]) {
          (await getDocsFromServer(collection(g.ref, part))).docs.forEach((d) => refs.push(d.ref));
        }
        await commitAll(refs.map((r) => (b) => b.delete(r)));
        await deleteDoc(g.ref);
      } else {
        // Two steps, in order: unlink yourself while you still have access, then leave.
        const mine = await getDocsFromServer(query(collection(g.ref, "members"), where("email", "==", u.email)));
        await commitAll(mine.docs.map((d) => (b) => b.update(d.ref, { email: "" })));
        await commitAll([(b) => b.update(g.ref, { access: arrayRemove(u.email) })]);
      }
    }
    const pk = C.phoneKey(phone);
    for (const k of ["e:" + u.email, ...(pk ? ["p:" + pk] : [])]) {
      const d = await getDocFromServer(doc(db, "lookup", k));
      if (d.exists() && d.data().uid === u.uid) await deleteDoc(d.ref);
    }
    for (const c of ["private", "phoneChecks", "profiles"]) await deleteDoc(doc(db, c, u.uid));
  } catch (e) {
    console.warn("MySplitIt: could not delete account data", e);
    if (state.user === u) startWatching(u);
    return "Couldn't delete everything. Check your internet connection and try again.";
  }
  try {
    try {
      await deleteUser(fu);
    } catch (e) {
      if (e.code !== "auth/requires-recent-login") throw e;
      if (await reauth(fu)) return "Your data is deleted. To finish, sign in again and click Delete account once more.";
      await deleteUser(fu);
    }
  } catch (e) {
    console.warn("MySplitIt: could not delete sign-in", e);
    return "Your data is deleted, but the sign-in couldn't be removed. Try Delete account again.";
  }
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* cleared on next start */ }
  return null;
}

/** Asks Google to confirm it's you again, with the same account. Returns a message if not. */
async function reauth(fu) {
  try {
    if (usesEmulator) {
      await reauthenticateWithCredential(fu, GoogleAuthProvider.credential(testToken(fu.email)));
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account", login_hint: fu.email });
      await reauthenticateWithPopup(fu, provider);
    }
    return null;
  } catch (e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return "Cancelled. Nothing was deleted.";
    if (e.code === "auth/user-mismatch") return `Choose the same Google account (${fu.email}) to confirm. Nothing was deleted.`;
    if (e.code === "auth/popup-blocked") return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    return "Couldn't confirm your account. Nothing was deleted.";
  }
}

export async function signOut() {
  stopWatching();
  await fbSignOut(auth);
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* cache is cleared on next start */ }
  location.reload();
}

onAuthStateChanged(auth, (u) => {
  state.authReady = true;
  const email = u && u.email ? u.email.trim().toLowerCase() : null;
  const next = u && email ? { uid: u.uid, email, name: u.displayName || email, photo: u.photoURL || "" } : null;
  if (JSON.stringify(next) === JSON.stringify(state.user) && state.ready) { changed(); return; }
  stopWatching();
  state.user = next;
  if (next) startWatching(next); else { state.status = "signed-out"; state.groups = new Map(); }
  state.ready = true;
  changed();
});

// ---------- Receiving changes ----------
let listeners = [];
let groupsListener = null;
const watches = new Map();
let offline = false;

function startWatching(u) {
  state.status = "syncing";
  listeners.push(onSnapshot(doc(db, "profiles", u.uid), { includeMetadataChanges: true }, (s) => {
    const old = state.profile;
    state.profile = s.exists() ? profileFrom(u.uid, s.data()) : null;
    if (s.exists() || !s.metadata.fromCache) state.profileLoaded = true;
    if (state.profile && JSON.stringify(old) !== JSON.stringify(state.profile)) applyMyFamily();
    changed();
  }, () => {}));
  listeners.push(onSnapshot(doc(db, "private", u.uid), { includeMetadataChanges: true }, (s) => {
    const d = s.exists() ? s.data() : {};
    state.phoneVerified = d.verified === true;
    state.phoneVerifiedAt = Number(d.verifiedAt) || 0;
    state.savedPhone = d.phone || "";
    setMyPhone();
    if (s.exists() || !s.metadata.fromCache) state.phoneLoaded = true;
    changed();
  }, () => {}));
  // MySplitIt's WhatsApp number. Not readable or not there: WhatsApp verification is off and
  // people type their number instead.
  listeners.push(onSnapshot(doc(db, "config", "public"), { includeMetadataChanges: true }, (s) => {
    state.whatsapp = String((s.exists() && s.data().whatsapp) || "").replace(/\D/g, "");
    if (s.exists() || !s.metadata.fromCache) state.configLoaded = true;
    setMyPhone();
    changed();
  }, () => { state.whatsapp = ""; state.configLoaded = true; setMyPhone(); changed(); }));
  listenToGroups(u, 0);
}

function listenToGroups(u, attempt) {
  groupsListener = onSnapshot(query(collection(db, "groups"), where("access", "array-contains", u.email)), { includeMetadataChanges: true }, (snap) => {
    const ids = new Set(snap.docs.map((d) => d.id));
    for (const d of snap.docs) {
      let w = watches.get(d.id);
      if (!w) { w = new Watch(d.id); watches.set(d.id, w); w.start(); }
      w.doc = d.data();
      w.pending[0] = d.metadata.hasPendingWrites;
      w.publish();
    }
    offline = snap.metadata.fromCache;
    if (!offline) {
      // Only trust "missing" when the server says so: deleted, or you were removed.
      for (const id of [...watches.keys()]) if (!ids.has(id)) { watches.get(id).stop(); watches.delete(id); state.groups.delete(id); }
    }
    updateStatus();
  }, (err) => {
    console.warn("Group list stopped; listening again", err);
    groupsListener = null;
    setTimeout(() => { if (state.user && state.user.uid === u.uid && !groupsListener) listenToGroups(u, attempt + 1); }, retryDelay(attempt));
  });
}

function stopWatching() {
  listeners.forEach((f) => f()); listeners = [];
  if (groupsListener) groupsListener(); groupsListener = null;
  watches.forEach((w) => w.stop()); watches.clear();
  state.groups = new Map(); state.profile = null; state.profileLoaded = false; state.myPhone = ""; state.phoneLoaded = false;
  state.phoneVerified = false; state.phoneVerifiedAt = 0; state.savedPhone = ""; state.whatsapp = ""; state.configLoaded = false;
}

function updateStatus() {
  state.status = !state.user ? "signed-out" : offline ? "offline"
    : [...watches.values()].some((w) => w.pending.some(Boolean)) ? "syncing" : "synced";
  changed();
}

class Watch {
  constructor(id) {
    this.id = id; this.doc = null; this.parts = ["members", "expenses", "payments"];
    this.data = [null, null, null]; this.unsubs = [null, null, null]; this.attempts = [0, 0, 0];
    this.pending = [false, false, false, false]; this.stopped = false; this.lastRepair = 0;
  }
  start() { this.parts.forEach((_, i) => this.listen(i)); }
  listen(i) {
    if (this.stopped) return;
    this.unsubs[i] = onSnapshot(collection(db, "groups", this.id, this.parts[i]), { includeMetadataChanges: true }, (s) => {
      this.attempts[i] = 0;
      this.data[i] = s.docs;
      this.pending[i + 1] = s.metadata.hasPendingWrites;
      this.publish();
    }, (err) => {
      // A group you just created can be refused for a moment until the server has saved it.
      console.warn(`Listening to ${this.id}/${this.parts[i]} stopped; trying again`, err);
      this.unsubs[i] = null;
      this.pending[i + 1] = false;
      setTimeout(() => { if (!this.stopped && !this.unsubs[i]) this.listen(i); }, retryDelay(this.attempts[i]++));
      updateStatus();
    });
  }
  stop() { this.stopped = true; this.unsubs.forEach((f) => f && f()); }
  publish() {
    if (!this.doc || this.data.some((d) => !d)) return;
    const pairs = (docs) => docs.map((d) => [d.id, d.data()]);
    const g = C.groupFromDocs(this.id, this.doc, pairs(this.data[0]), pairs(this.data[1]), pairs(this.data[2]));
    state.groups.set(this.id, g);
    this.repairAccess(g);
    applyMyFamily(g);
    updateStatus();
  }
  repairAccess(g) {
    if (this.pending.some(Boolean)) return;
    const missing = [...new Set(g.members.map((m) => m.email).filter((e) => e && !g.access.includes(e)))];
    const now = Date.now();
    if (!missing.length || g.access.length + missing.length > C.MAX_ACCESS || now - this.lastRepair < 30000) return;
    this.lastRepair = now;
    const b = writeBatch(db);
    b.update(groupRef(g.id), { access: arrayUnion(...missing) });
    commit(b);
  }
}

// ---------- Your profile and family size ----------
function profileFrom(uid, d) {
  const n = (k, min) => Math.min(30, Math.max(min, Math.trunc(Number(d[k]) || min)));
  const email = String(d.email || "").toLowerCase();
  return { uid, name: String(d.name || "").trim().slice(0, 100) || email.split("@")[0], email, adults: n("adults", 1), kids: n("kids", 0), friends: n("friends", 0) };
}
export const profileHeads = (p) => p.adults + p.kids + p.friends;

/** Your entry in each group follows your profile (unless its size was set by hand). */
function applyMyFamily(only) {
  const p = state.profile;
  const u = state.user;
  if (!p || !u) return;
  for (const g of only ? [only] : state.groups.values()) {
    const m = g.members.find((x) => x.email === u.email);
    if (!m || m.custom) continue;
    const family = profileHeads(p) > 1;
    const adults = family ? p.adults + p.friends : 1;
    const kids = family ? p.kids : 0;
    if (m.isFamily !== family || m.adults !== adults || m.kids !== kids || m.friends) {
      saveMember(g.id, { ...m, isFamily: family, adults, kids, friends: 0 });
    }
  }
}

/**
 * Signed in but without a profile or a verified phone number. Both are required, so the app
 * asks for them before anything else (people who signed up before verification too).
 */
export const whatsappOn = () => !!state.whatsapp;
/** Your phone number: proved on WhatsApp when that's on, otherwise the one you typed. */
function setMyPhone() { state.myPhone = whatsappOn() && !state.phoneVerified ? "" : state.savedPhone; }

export function needsProfile() {
  if (!state.user || !state.profileLoaded || !state.phoneLoaded || !state.configLoaded) return false;
  return !state.profile || (whatsappOn() ? !state.phoneVerified : !C.phoneKey(state.savedPhone || ""));
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I
export function newCode() {
  const r = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(r, (b) => CODE_CHARS[b % 32]).join("");
}
export const whatsappLink = (number, code) =>
  `https://wa.me/${number}?text=${encodeURIComponent("MySplitIt verification code: " + code)}`;

/**
 * Starts proving your phone number: saves a one-time code for your account and returns the
 * WhatsApp link that sends it to MySplitIt. The verification server does the rest, and
 * state.phoneVerified turns true a few seconds after the message is sent.
 */
export async function startPhoneCheck() {
  const u = state.user;
  if (!u) return { problem: "Sign in first." };
  if (!state.whatsapp) return { problem: "Phone verification isn't available right now. Try again later." };
  const code = newCode();
  try {
    const b = writeBatch(db);
    b.set(doc(db, "phoneChecks", u.uid), { code, createdAt: serverTimestamp() });
    await b.commit();
    return { code, number: state.whatsapp, link: whatsappLink(state.whatsapp, code) };
  } catch (e) {
    console.warn(e);
    return { problem: "Couldn't start. Check your internet connection and try again." };
  }
}

/**
 * Saves your profile and makes you findable by your email and phone number. With WhatsApp
 * verification on, the number must already be proved (phone is ignored); otherwise phone is
 * the number you typed.
 */
export async function saveProfile({ name, phone = "", adults, kids, friends }) {
  const u = state.user;
  if (!u) return "Sign in first.";
  if (!name.trim()) return "Enter your name.";
  let typed = null;
  if (whatsappOn()) {
    if (!state.phoneVerified) return "Verify your phone number first.";
  } else {
    typed = C.phoneKey(phone);
    if (!typed) return phone.trim() ? "Enter a full phone number." : "Enter your phone number.";
  }
  try {
    if (typed) {
      const oldPhone = C.phoneKey(state.savedPhone || "");
      if (typed !== oldPhone) {
        const d = await getDocFromServer(doc(db, "lookup", "p:" + typed));
        if (d.exists() && d.data().uid !== u.uid) return "That number is already used by another MySplitIt account.";
        if (!d.exists()) await writeBatch(db).set(doc(db, "lookup", "p:" + typed), { uid: u.uid }).commit();
      }
      if (oldPhone && oldPhone !== typed) {
        try { const b = writeBatch(db); b.delete(doc(db, "lookup", "p:" + oldPhone)); await b.commit(); } catch (e) { /* not ours any more */ }
      }
    }
    const e = await getDocFromServer(doc(db, "lookup", "e:" + u.email));
    const b = writeBatch(db);
    if (!e.exists()) b.set(doc(db, "lookup", "e:" + u.email), { uid: u.uid });
    if (typed) b.set(doc(db, "private", u.uid), { phone: phone.trim().slice(0, 20) });
    b.set(doc(db, "profiles", u.uid), {
      name: name.trim().slice(0, 100), email: u.email, adults: clampInt(adults, 1, 30), kids: clampInt(kids, 0, 30),
      friends: clampInt(friends, 0, 30), updatedAt: Date.now(),
    });
    await b.commit();
    return null;
  } catch (err) {
    console.warn(err);
    return "Couldn't save. Check your internet connection and try again.";
  }
}
const clampInt = (x, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(Number(x) || 0)));

/** Finds a MySplitIt user by exact email or phone number. */
export async function findUser(text) {
  const q = text.trim();
  const email = C.isEmail(q.toLowerCase()) ? q.toLowerCase() : null;
  const phone = email ? null : C.phoneKey(q);
  if (!email && !phone) return { problem: "Enter a full email address or phone number." };
  try {
    const l = await getDocFromServer(doc(db, "lookup", email ? "e:" + email : "p:" + phone));
    if (!l.exists()) return { none: true, email, phone };
    const p = await getDocFromServer(doc(db, "profiles", l.data().uid));
    if (!p.exists()) return { none: true, email, phone };
    return { profile: profileFrom(l.data().uid, p.data()), byPhone: !!phone };
  } catch (err) {
    console.warn(err);
    return { problem: "Couldn't search. Check your internet connection and try again." };
  }
}

// ---------- Saving changes ----------
const now = () => Date.now();

/** Creates a shared group with you in it (with your family, from your profile or as chosen). */
export function createGroup({ name, category, currency, me }) {
  const u = state.user;
  const id = C.newId();
  const g = { name, category, currency, createdAt: now(), owner: u.uid, ownerEmail: u.email, access: [u.email] };
  const b = writeBatch(db);
  b.set(groupRef(id), C.groupDoc(g));
  if (me) {
    const family = me.adults + me.kids > 1;
    b.set(sub(id, "members", C.newId()), C.memberDoc({
      name: me.name, isFamily: family, adults: family ? me.adults : 1, kids: family ? me.kids : 0,
      addedAt: now(), email: u.email, friends: 0, custom: !me.fromProfile,
    }));
  }
  commit(b);
  return id;
}

export function editGroup(id, { name, category, currency }) {
  const b = writeBatch(db);
  b.update(groupRef(id), { name, category, currency });
  commit(b);
}

/** Adds or updates a person; a linked Gmail also gets access to the group. */
export function saveMember(gid, m) {
  const g = state.groups.get(gid);
  const b = writeBatch(db);
  const email = (m.email || "").trim().toLowerCase();
  // An email belongs to one person in a group.
  if (email && g) for (const other of g.members) if (other.id !== m.id && other.email === email) b.set(sub(gid, "members", other.id), C.memberDoc({ ...other, email: "" }));
  b.set(sub(gid, "members", m.id || C.newId()), C.memberDoc({ ...m, email, addedAt: m.addedAt || now() }));
  if (email && g && !g.access.includes(email) && g.access.length < C.MAX_ACCESS) b.update(groupRef(gid), { access: arrayUnion(email) });
  commit(b);
}

export function addProfileToGroup(gid, p) {
  const g = state.groups.get(gid);
  const taken = new Set(g.members.map((m) => m.name.trim().toLowerCase()));
  const name = taken.has(p.name.trim().toLowerCase()) ? `${p.name} (${p.email.split("@")[0]})` : p.name;
  const family = profileHeads(p) > 1;
  saveMember(gid, { name, isFamily: family, adults: family ? p.adults + p.friends : 1, kids: family ? p.kids : 0, email: p.email, friends: 0, custom: false });
}

export function removeMember(gid, mid) {
  const g = state.groups.get(gid);
  if (!g || C.isInvolved(g, mid)) return false;
  const b = writeBatch(db);
  b.delete(sub(gid, "members", mid));
  commit(b);
  return true;
}

export function linkMe(gid, mid) {
  const g = state.groups.get(gid);
  const m = g && g.members.find((x) => x.id === mid);
  if (m) saveMember(gid, { ...m, email: state.user.email });
}

export function saveExpense(gid, e) {
  const b = writeBatch(db);
  b.set(sub(gid, "expenses", e.id || C.newId()), C.expenseDoc({ ...e, createdAt: e.createdAt || now() }));
  commit(b);
}
export function deleteExpense(gid, eid) { const b = writeBatch(db); b.delete(sub(gid, "expenses", eid)); commit(b); }

export function addPayment(gid, { from, to, amount, currency }) {
  const b = writeBatch(db);
  b.set(sub(gid, "payments", C.newId()), C.paymentDoc({ from, to, amount, currency, createdAt: now() }));
  commit(b);
}
export function deletePayment(gid, pid) { const b = writeBatch(db); b.delete(sub(gid, "payments", pid)); commit(b); }

export function invite(gid, email) {
  const b = writeBatch(db);
  b.update(groupRef(gid), { access: arrayUnion(email.trim().toLowerCase()) });
  commit(b);
}

export function removeAccess(gid, email) {
  const g = state.groups.get(gid);
  if (!g || email === g.ownerEmail) return;
  const b = writeBatch(db);
  // They stay in the people list for past expenses, but are no longer linked to that account.
  for (const m of g.members) if (m.email === email) b.set(sub(gid, "members", m.id), C.memberDoc({ ...m, email: "" }));
  b.update(groupRef(gid), { access: arrayRemove(email) });
  commit(b);
}

export function leave(gid) {
  const g = state.groups.get(gid);
  const u = state.user;
  // Two steps, in order: unlink yourself while you still have access, then remove the access.
  const unlink = writeBatch(db);
  if (g) for (const m of g.members) if (m.email === u.email) unlink.set(sub(gid, "members", m.id), C.memberDoc({ ...m, email: "" }));
  commit(unlink);
  const b = writeBatch(db);
  b.update(groupRef(gid), { access: arrayRemove(u.email) });
  commit(b);
  const w = watches.get(gid); if (w) { w.stop(); watches.delete(gid); }
  state.groups.delete(gid);
  changed();
}

/** Owner only: deletes the group and everything in it, for everyone. */
export function deleteForEveryone(gid) {
  const g = state.groups.get(gid);
  if (!g) return;
  const ops = [
    ...g.members.map((m) => sub(gid, "members", m.id)),
    ...g.expenses.map((e) => sub(gid, "expenses", e.id)),
    ...g.payments.map((p) => sub(gid, "payments", p.id)),
  ];
  const w = watches.get(gid); if (w) { w.stop(); watches.delete(gid); }
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((r) => b.delete(r));
    commit(b);
  }
  const b = writeBatch(db);
  b.delete(groupRef(gid));
  commit(b);
  state.groups.delete(gid);
  changed();
}

export const isOwner = (g) => state.user && g.owner === state.user.uid;
