// MySplitIt web: the same splitting rules as the Android app, so both always agree.
// Amounts are whole cents/paise (integers). No browser or Firebase code in this file.

export const MAX_ACCESS = 50;
const MAX_MONEY = 100_000_000_000_000;
const MAX_COUNT = 30;

// ---------- Splitting ----------

/**
 * Splits `amount` in proportion to each weight. Leftover cents go one each to the first
 * people, so the shares always add up to exactly `amount`. Returns a Map id -> cents.
 */
export function weighted(amount, weights) {
  const w = weights.filter(([, x]) => x > 0);
  const total = w.reduce((s, [, x]) => s + BigInt(x), 0n);
  const out = new Map();
  if (total === 0n) return out;
  let used = 0;
  for (const [id, x] of w) {
    const s = Number((BigInt(amount) * BigInt(x)) / total);
    out.set(id, s);
    used += s;
  }
  let remainder = amount - used;
  for (let i = 0; remainder > 0; i++, remainder--) {
    const id = w[i % w.length][0];
    out.set(id, out.get(id) + 1);
  }
  return out;
}

export const shares = (amount, people) => weighted(amount, people.map((p) => [p, 1]));

const countsOf = (e, id) => e.counts[id] || { adults: 1, kids: 0 };
const heads = (c) => c.adults + c.kids;

/** Ticket cost per person before tax: adults × adult price + kids × kid price. */
export function ageBaseShares(e) {
  return e.splitAmong.map((id) => {
    const c = countsOf(e, id);
    return [id, c.adults * e.adultPrice + c.kids * e.kidPrice];
  });
}

export const ageSubtotal = (e) => ageBaseShares(e).reduce((s, [, x]) => s + x, 0);

const perHead = (e) => weighted(e.amount, e.splitAmong.map((id) => [id, e.counts[id] ? heads(e.counts[id]) : 1]));

/** What each included person owes for one expense (Map id -> cents). */
export function expenseShares(e) {
  if (e.mode === "AGE") {
    const base = ageBaseShares(e);
    const subtotal = base.reduce((s, [, x]) => s + x, 0);
    if (subtotal === e.amount) return new Map(base);
    // Tax, service charge or discount: shared in proportion to each person's ticket cost.
    if (subtotal > 0) return weighted(e.amount, base);
  }
  return perHead(e);
}

const zeroes = (g) => new Map(g.members.map((m) => [m.id, 0]));
const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);

/** Net balance per person in one currency: positive = gets money back, negative = owes. */
export function balances(g, currency) {
  const net = zeroes(g);
  for (const e of g.expenses.filter((x) => x.currency === currency)) {
    add(net, e.paidBy, e.amount);
    for (const [id, s] of expenseShares(e)) add(net, id, -s);
  }
  for (const p of g.payments.filter((x) => x.currency === currency)) {
    add(net, p.from, p.amount);
    add(net, p.to, -p.amount);
  }
  return net;
}

/** Fewest-steps style suggestion: biggest debtor pays biggest creditor, repeat. */
export function settleUp(net, currency) {
  const debtors = [...net].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v })).sort((a, b) => b.amount - a.amount);
  const creditors = [...net].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v })).sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].amount, creditors[j].amount);
    if (x > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: x, currency });
    debtors[i].amount -= x;
    creditors[j].amount -= x;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return out;
}

/** Currencies used in a group; the group's default comes first. */
export function currenciesUsed(g) {
  const used = new Set();
  [...g.expenses].sort((a, b) => a.createdAt - b.createdAt).forEach((e) => used.add(e.currency));
  [...g.payments].sort((a, b) => a.createdAt - b.createdAt).forEach((p) => used.add(p.currency));
  const list = [...used];
  const i = list.indexOf(g.currency);
  if (i >= 0) { list.splice(i, 1); list.unshift(g.currency); }
  return list;
}

/** Total spent per currency (zero totals left out). */
export function totals(g) {
  const out = new Map();
  for (const c of currenciesUsed(g)) {
    const t = g.expenses.filter((e) => e.currency === c).reduce((s, e) => s + e.amount, 0);
    if (t !== 0) out.set(c, t);
  }
  return out;
}

export const allTransfers = (g) => currenciesUsed(g).flatMap((c) => settleUp(balances(g, c), c));

/** Money still to be paid back, per currency. */
export function unsettled(g) {
  const out = new Map();
  for (const c of currenciesUsed(g)) {
    const owed = [...balances(g, c).values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
    if (owed > 0) out.set(c, owed);
  }
  return out;
}

export const isInvolved = (g, id) =>
  g.expenses.some((e) => e.paidBy === id || e.splitAmong.includes(id)) ||
  g.payments.some((p) => p.from === id || p.to === id);

/**
 * A "per family" expense: one total amount where every included family or person counts once.
 * Stored as each of them counting as 1 adult, so every app version splits it the same way.
 * Same rule as Splits.isPerFamily on Android.
 */
export const isPerFamily = (e, g) => e.mode === "EQUAL" && e.splitAmong.length > 0
  && e.splitAmong.every((id) => e.counts[id] && e.counts[id].adults === 1 && e.counts[id].kids === 0)
  && e.splitAmong.some((id) => { const m = g.members.find((x) => x.id === id); return m && m.adults + m.kids > 1; });

export const totalHeads = (g) => g.members.reduce((s, m) => s + m.adults + m.kids, 0);

// ---------- Friends (one-to-one balances) ----------

export const meIn = (g, myEmail) => (myEmail ? g.members.find((m) => m.email === myEmail)?.id ?? null : null);

export const personKey = (m) => (m.email ? "e:" + m.email : "n:" + m.name.trim().replace(/\s+/g, " ").toLowerCase());

/** Everyone you share a group with, and what you owe each other (positive = they owe you). */
export function friendsOverview(groups, myEmail) {
  const lines = new Map();
  const names = new Map();
  const missing = [];
  for (const g of [...groups].sort((a, b) => b.createdAt - a.createdAt)) {
    const me = meIn(g, myEmail);
    if (!me) { if (g.members.length) missing.push(g); continue; }
    const owed = new Map();
    for (const cur of currenciesUsed(g)) {
      for (const t of settleUp(balances(g, cur), cur)) {
        let other; let signed;
        if (t.to === me) { other = t.from; signed = t.amount; } else if (t.from === me) { other = t.to; signed = -t.amount; } else continue;
        if (!owed.has(other)) owed.set(other, new Map());
        add(owed.get(other), cur, signed);
      }
    }
    for (const m of g.members) {
      if (m.id === me) continue;
      const k = personKey(m);
      if (!lines.has(k)) lines.set(k, []);
      lines.get(k).push({ groupId: g.id, groupName: g.name, memberId: m.id, amounts: owed.get(m.id) || new Map() });
      if (!names.has(k) || m.email) names.set(k, { name: m.name, email: m.email });
    }
  }
  const friends = [...lines].map(([key, l]) => {
    const t = new Map();
    l.forEach((x) => x.amounts.forEach((v, c) => add(t, c, v)));
    for (const [c, v] of t) if (v === 0) t.delete(c);
    return { key, ...names.get(key), lines: l, totals: t };
  });
  friends.sort((a, b) => (a.totals.size === 0) - (b.totals.size === 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  return { friends, groupsWithoutYou: missing };
}

// ---------- Money ----------

const SYMBOLS = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", CNY: "CN¥", AUD: "A$", CAD: "C$", SGD: "S$", HKD: "HK$",
  NZD: "NZ$", THB: "฿", KRW: "₩", VND: "₫", PHP: "₱", TRY: "₺", RUB: "₽", BRL: "R$", ILS: "₪", NGN: "₦",
  UAH: "₴", BDT: "৳", MYR: "RM", IDR: "Rp", ZAR: "R", MXN: "MX$", LKR: "Rs", NPR: "Rs", PKR: "Rs",
};
export const POPULAR = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "THB", "MYR", "AUD", "CAD", "JPY", "LKR", "NPR",
  "IDR", "VND", "CHF", "SAR", "QAR", "KWD", "OMR", "BHD", "HKD", "NZD", "CNY", "KRW", "ZAR", "TRY", "BDT", "PKR", "PHP", "MVR", "BTN"];

export function allCurrencies() {
  let codes = [];
  try { codes = Intl.supportedValuesOf("currency"); } catch (e) { codes = POPULAR; }
  const set = new Set(codes);
  const first = POPULAR.filter((c) => set.has(c));
  return [...first, ...codes.filter((c) => !first.includes(c)).sort()];
}
let validSet = null;
export const isCurrency = (code) => {
  if (!validSet) validSet = new Set(allCurrencies());
  return typeof code === "string" && code.length === 3 && validSet.has(code);
};
export const symbol = (code) => SYMBOLS[code] || code;
export const currencyLabel = (code) => (symbol(code) === code ? code : `${symbol(code)} ${code}`);
export function currencyName(code) {
  try { return new Intl.DisplayNames(undefined, { type: "currency" }).of(code); } catch (e) { return code; }
}
const prefix = (code) => { const s = symbol(code); return /[A-Za-z]$/.test(s) ? s + " " : s; };

export function formatMoney(cents, code) {
  const a = Math.abs(cents);
  const digits = a % 100 === 0 ? 0 : 2;
  const nf = new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (cents < 0 ? "-" : "") + prefix(code) + nf.format(a / 100);
}
export const formatTotals = (t, fallback) =>
  t.size === 0 ? formatMoney(0, fallback) : [...t].map(([c, v]) => formatMoney(v, c)).join(" + ");

/** "12.5" -> 1250; null for invalid input or more than 2 decimals. */
export function parseMoney(text) {
  const s = String(text).trim().replace(",", ".");
  if (!/^\d{1,12}(\.\d{0,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}
export const toInput = (cents) => (cents % 100 === 0 ? String(cents / 100) : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`);

// ---------- People and lookups ----------

export const isEmail = (t) => typeof t === "string" && t.length <= 254 && /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t.trim());

/** Phone numbers match on their last 10 digits ("+91 98765 43210" = "098765 43210"). */
export function phoneKey(text) {
  if (/[A-Za-z@]/.test(text)) return null;
  const d = String(text).replace(/\D/g, "");
  return d.length >= 7 && d.length <= 15 ? d.slice(-10) : null;
}

export function nameFromEmail(email) {
  const parts = email.split("@")[0].split(/[._+-]/).filter(Boolean);
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ") || email.split("@")[0];
}

export function describeCounts(c) {
  const n = (x, one, many) => `${x} ${x === 1 ? one : many}`;
  if (c.kids === 0) return n(c.adults, "adult", "adults");
  if (c.adults === 0) return n(c.kids, "kid", "kids");
  return `${n(c.adults, "adult", "adults")} · ${n(c.kids, "kid", "kids")}`;
}

export const sameGroupName = (a, b) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

// ---------- Cloud documents (same shape as the Android app) ----------

export const groupDoc = (g) => ({ name: g.name, category: g.category, currency: g.currency, createdAt: g.createdAt, owner: g.owner, ownerEmail: g.ownerEmail, access: g.access });
export const memberDoc = (m) => ({ name: m.name, isFamily: m.isFamily, adults: m.adults, kids: m.kids, addedAt: m.addedAt, email: m.email || "", friends: m.friends || 0, custom: !!m.custom });
export const expenseDoc = (e) => ({
  name: e.name, description: e.description, amount: e.amount, currency: e.currency, paidBy: e.paidBy,
  splitAmong: e.splitAmong, createdAt: e.createdAt, mode: e.mode,
  counts: Object.fromEntries(Object.entries(e.counts).map(([k, c]) => [k, [c.adults, c.kids]])),
  adultPrice: e.adultPrice, kidPrice: e.kidPrice,
});
export const paymentDoc = (p) => ({ from: p.from, to: p.to, amount: p.amount, currency: p.currency, createdAt: p.createdAt });

const str = (d, k, max) => (typeof d[k] === "string" ? d[k].slice(0, max).trim() : "");
const num = (d, k) => (typeof d[k] === "number" && isFinite(d[k]) ? Math.trunc(d[k]) : 0);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const money = (d, k) => clamp(num(d, k), 0, MAX_MONEY);
const strings = (d, k) => (Array.isArray(d[k]) ? d[k].filter((x) => typeof x === "string").slice(0, 200) : []);
const cur = (code, fallback) => (isCurrency(String(code).toUpperCase()) ? String(code).toUpperCase() : fallback);

/**
 * Builds a group from its cloud documents. Data comes from other people's phones, so it's
 * checked and clamped first (the same checks as the Android app).
 */
export function groupFromDocs(id, doc, members, expenses, payments) {
  const currency = cur(str(doc, "currency", 8), "INR");
  const people = members.map(([mid, d]) => {
    const family = d.isFamily === true;
    const adults = family ? clamp(num(d, "adults"), 1, MAX_COUNT) : 1;
    const email = str(d, "email", 254).toLowerCase();
    return {
      id: mid, name: str(d, "name", 100) || "Someone", isFamily: family, adults,
      kids: family ? clamp(num(d, "kids"), 0, MAX_COUNT) : 0, addedAt: num(d, "addedAt"),
      email: email && isEmail(email) ? email : "", friends: family ? clamp(num(d, "friends"), 0, adults - 1) : 0, custom: d.custom === true,
    };
  }).sort((a, b) => a.addedAt - b.addedAt || (a.id < b.id ? -1 : 1));
  const ids = new Set(people.map((p) => p.id));
  const exps = expenses.map(([eid, d]) => {
    const split = [...new Set(strings(d, "splitAmong").filter((x) => ids.has(x)))];
    const paidBy = str(d, "paidBy", 64);
    if (!split.length || !ids.has(paidBy)) return null;
    const counts = {};
    const raw = d.counts && typeof d.counts === "object" ? d.counts : {};
    for (const [k, v] of Object.entries(raw)) {
      if (split.includes(k) && Array.isArray(v) && v.length >= 2) {
        counts[k] = { adults: clamp(Math.trunc(Number(v[0]) || 0), 0, MAX_COUNT), kids: clamp(Math.trunc(Number(v[1]) || 0), 0, MAX_COUNT) };
      }
    }
    return {
      id: eid, name: str(d, "name", 100) || "Expense", description: str(d, "description", 1000), amount: money(d, "amount"),
      currency: cur(str(d, "currency", 8), currency), paidBy, splitAmong: split, createdAt: num(d, "createdAt"),
      mode: d.mode === "AGE" ? "AGE" : "EQUAL", counts, adultPrice: money(d, "adultPrice"), kidPrice: money(d, "kidPrice"),
    };
  }).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const pays = payments.map(([pid, d]) => {
    const from = str(d, "from", 64);
    const to = str(d, "to", 64);
    if (!ids.has(from) || !ids.has(to) || from === to) return null;
    return { id: pid, from, to, amount: money(d, "amount"), currency: cur(str(d, "currency", 8), currency), createdAt: num(d, "createdAt") };
  }).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  return {
    id, name: str(doc, "name", 100) || "Shared group", category: str(doc, "category", 40) || "Other", currency,
    members: people, expenses: exps, payments: pays, createdAt: num(doc, "createdAt"), shared: true,
    owner: str(doc, "owner", 128), ownerEmail: str(doc, "ownerEmail", 254),
    access: [...new Set(strings(doc, "access").map((a) => a.toLowerCase()))],
  };
}

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
