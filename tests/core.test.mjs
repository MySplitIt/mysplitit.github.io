// Same cases as the Android app's unit tests, so web and phone split money identically.
// Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../app/core.js";

const members = ["a", "b", "c", "d"].map((id, i) => ({ id, name: ["Asha", "Bala", "Chitra", "Dev"][i], isFamily: false, adults: 1, kids: 0, email: "" }));
const group = (expenses, payments = []) => ({ id: "g", name: "Trip", category: "Trip", currency: "INR", members, expenses, payments, createdAt: 0 });
const exp = (amount, paidBy, among, cur = "INR", extra = {}) =>
  ({ id: amount + cur, name: "x", description: "", amount, currency: cur, paidBy, splitAmong: among, createdAt: 0, mode: "EQUAL", counts: {}, adultPrice: 0, kidPrice: 0, ...extra });
const obj = (m) => Object.fromEntries(m);

test("uneven split adds up exactly", () => {
  const s = C.shares(1000, ["a", "b", "c"]);
  assert.deepEqual(obj(s), { a: 334, b: 333, c: 333 });
});

test("split among everyone and some", () => {
  const g = group([exp(40000, "a", ["a", "b", "c", "d"]), exp(30000, "b", ["b", "c", "d"])]);
  const net = C.balances(g, "INR");
  assert.deepEqual(obj(net), { a: 30000, b: 10000, c: -20000, d: -20000 });
  const t = C.settleUp(net, "INR");
  assert.equal(t.reduce((s, x) => s + x.amount, 0), 40000);
  const settled = group(g.expenses, t.map((x, i) => ({ id: String(i), ...x, createdAt: 0 })));
  for (const v of C.balances(settled, "INR").values()) assert.equal(v, 0);
});

test("currencies are balanced separately", () => {
  const g = group([exp(40000, "a", ["a", "b", "c", "d"]), exp(8000, "b", ["a", "b"], "USD")]);
  assert.deepEqual(C.currenciesUsed(g), ["INR", "USD"]);
  assert.deepEqual(obj(C.totals(g)), { INR: 40000, USD: 8000 });
  const usd = C.balances(g, "USD");
  assert.equal(usd.get("a"), -4000);
  assert.equal(usd.get("b"), 4000);
  assert.deepEqual(C.allTransfers(g).filter((t) => t.currency === "USD"), [{ from: "a", to: "b", amount: 4000, currency: "USD" }]);
  assert.equal(C.formatMoney(8000, "USD"), "$80");
  assert.equal(C.formatMoney(1250, "AED"), "AED 12.50");
});

test("families split per person", () => {
  const e = exp(120000, "a", ["r", "a"], "INR", { counts: { r: { adults: 1, kids: 0 }, a: { adults: 2, kids: 2 } } });
  assert.deepEqual(obj(C.expenseShares(e)), { r: 24000, a: 96000 });
});

test("adult and kid prices", () => {
  const e = exp(2 * 50000 + 25000 + 50000, "r", ["r", "a"], "INR",
    { mode: "AGE", counts: { r: { adults: 1, kids: 0 }, a: { adults: 2, kids: 1 } }, adultPrice: 50000, kidPrice: 25000 });
  const s = C.expenseShares(e);
  assert.equal(s.get("r"), 50000);
  assert.equal(s.get("a"), 125000);
});

test("tax is shared in proportion", () => {
  const base = { mode: "AGE", counts: { r: { adults: 1, kids: 0 }, a: { adults: 2, kids: 2 } }, adultPrice: 50000, kidPrice: 25000 };
  const e = exp(236000, "r", ["r", "a"], "INR", base);
  assert.equal(C.ageSubtotal(e), 200000);
  assert.deepEqual(obj(C.expenseShares(e)), { r: 59000, a: 177000 });
  const odd = { ...e, amount: 233333 };
  assert.equal([...C.expenseShares(odd).values()].reduce((s, v) => s + v, 0), 233333);
  assert.equal(C.expenseShares({ ...e, amount: 180000 }).get("r"), 45000);
});

test("money parsing", () => {
  assert.equal(C.parseMoney("12.5"), 1250);
  assert.equal(C.parseMoney("12"), 1200);
  assert.equal(C.parseMoney("1.234"), null);
  assert.equal(C.parseMoney("abc"), null);
  assert.equal(C.toInput(1250), "12.50");
  assert.equal(C.toInput(1200), "12");
});

test("phone numbers match with or without country code", () => {
  assert.equal(C.phoneKey("+91 98765 43210"), "9876543210");
  assert.equal(C.phoneKey("098765-43210"), "9876543210");
  assert.equal(C.phoneKey("12345"), null);
  assert.equal(C.phoneKey("bob@gmail.com"), null);
});

test("cloud documents round-trip and bad data is cleaned up", () => {
  const g = {
    id: "g1", name: "Goa trip", category: "Trip", currency: "INR", createdAt: 5, shared: true, owner: "uid1",
    ownerEmail: "asha@gmail.com", access: ["asha@gmail.com", "ravi@gmail.com"], joinCode: "",
    members: [
      { id: "a", name: "Asha", isFamily: true, adults: 2, kids: 1, addedAt: 1, email: "", friends: 0, custom: false },
      { id: "r", name: "Ravi", isFamily: false, adults: 1, kids: 0, addedAt: 2, email: "ravi@gmail.com", friends: 0, custom: false },
    ],
    expenses: [{ id: "e1", name: "Tickets", description: "Water park", amount: 236000, currency: "INR", paidBy: "r", splitAmong: ["a", "r"],
      createdAt: 10, mode: "AGE", counts: { a: { adults: 2, kids: 1 }, r: { adults: 1, kids: 0 } }, adultPrice: 50000, kidPrice: 25000 }],
    payments: [{ id: "p1", from: "a", to: "r", amount: 1000, currency: "INR", createdAt: 20 }],
  };
  const back = C.groupFromDocs("g1", C.groupDoc(g), g.members.map((m) => [m.id, C.memberDoc(m)]),
    g.expenses.map((e) => [e.id, C.expenseDoc(e)]), g.payments.map((p) => [p.id, C.paymentDoc(p)]));
  assert.deepEqual(back, g);

  const bad = C.groupFromDocs("g1", { name: "x".repeat(500), currency: "NOPE", access: ["A@Gmail.com", 5] },
    [["a", { name: "Asha", isFamily: true, adults: 999, kids: -4, email: "not an email" }]],
    [["ok", { name: "Lunch", amount: -50, paidBy: "a", splitAmong: ["a", "ghost"], counts: { a: [99, 0], ghost: [1, 1] } }],
     ["orphan", { name: "?", amount: 100, paidBy: "ghost", splitAmong: ["a"] }]],
    [["p", { from: "a", to: "ghost", amount: 5 }]]);
  assert.equal(bad.name.length, 100);
  assert.equal(bad.currency, "INR");
  assert.deepEqual(bad.access, ["a@gmail.com"]);
  assert.deepEqual([bad.members[0].adults, bad.members[0].kids, bad.members[0].email], [30, 0, ""]);
  assert.deepEqual(bad.expenses.map((e) => e.id), ["ok"]);
  assert.equal(bad.expenses[0].amount, 0);
  assert.deepEqual(bad.expenses[0].counts, { a: { adults: 30, kids: 0 } });
  assert.equal(bad.payments.length, 0);
});

test("invite links", () => {
  const code = C.newJoinCode();
  assert.match(code, /^[A-Za-z0-9]{22}$/);
  assert.notEqual(code, C.newJoinCode());
  const gid = "0b6c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3";
  assert.equal(C.joinUrl(gid, code), `https://mysplitit.github.io/join/#${gid}.${code}`);
  assert.ok(C.validJoin(gid, code));
  assert.ok(!C.validJoin(gid, "short"));
  assert.ok(!C.validJoin("bad/id", code));
  assert.ok(!C.validJoin(gid, code + "!"));
  const g = C.groupFromDocs("g", { name: "Trip", currency: "INR", access: ["a@x.com"], joinCode: code }, [], [], []);
  assert.equal(g.joinCode, code);
  assert.equal(C.groupFromDocs("g", { name: "Trip" }, [], [], []).joinCode, "");
});

test("merging someone added twice", () => {
  const ms = [{ id: "a", name: "Asha" }, { id: "p", name: "Priya" }, { id: "m", name: "Priya (me)", email: "priya@gmail.com" }]
    .map((m) => ({ isFamily: false, adults: 1, kids: 0, email: "", ...m }));
  const e = (id, paidBy, among, counts = {}) => ({ ...exp(9000, paidBy, among, "INR", { counts, mode: Object.keys(counts).length ? "AGE" : "EQUAL" }), id });
  const g = { ...group([e("e1", "a", ["a", "p"]), e("e2", "m", ["a", "m"]), e("e3", "a", ["a", "p", "m"]), e("e4", "a", ["p", "m"], { p: { adults: 1, kids: 0 }, m: { adults: 2, kids: 1 } })],
    [{ id: "x1", from: "m", to: "a", amount: 500, currency: "INR", createdAt: 2 }, { id: "x2", from: "m", to: "p", amount: 100, currency: "INR", createdAt: 3 }]), members: ms };
  assert.equal(C.baseName(" Priya  (me) "), "priya");
  assert.equal(C.sameNameAs(g, "m").id, "p");
  assert.equal(C.sameNameAs(g, "a"), null);
  const m = C.mergeMember(g, "m", "p");
  assert.deepEqual(m.members.map((x) => x.id), ["a", "p"]);
  assert.equal(m.members[1].email, "priya@gmail.com");
  assert.equal(m.expenses[1].paidBy, "p");
  assert.deepEqual(m.expenses[2].splitAmong, ["a", "p"]);
  assert.deepEqual(m.expenses[3].counts, { p: { adults: 2, kids: 1 } });
  assert.deepEqual(m.payments.map((p) => [p.id, p.from]), [["x1", "p"]]);
  assert.equal(m.expenses[0], g.expenses[0]); // untouched expenses aren't rewritten
  assert.equal(C.mergeMember(g, "m", "m"), g);
});

test("summary text for chat apps", () => {
  const g = { ...group([exp(40000, "a", ["a", "b", "c", "d"]), exp(30000, "b", ["b", "c", "d"])]), name: "Goa" };
  const t = C.summaryText(g, "✈️");
  assert.match(t, /^✈️ Goa\nTotal spent: /);
  assert.match(t, /Expenses:\n• x: .*400 \(paid by Asha, split among 4\)/);
  assert.match(t, /Balances:\n• Asha: gets back .*300\n/);
  assert.match(t, /To settle up:\n• /);
  assert.equal(C.summaryText({ ...group([]), name: "Empty" }), "Empty\nTotal spent: " + C.formatMoney(0, "INR"));
});

test("friends add up across groups", () => {
  const me = (id) => ({ id, name: "Me", isFamily: false, adults: 1, kids: 0, email: "me@x.com" });
  const p = (id, name) => ({ id, name, isFamily: false, adults: 1, kids: 0, email: "" });
  const goa = { id: "1", name: "Goa", currency: "INR", createdAt: 1, members: [me("m1"), p("r1", "Ravi"), p("a1", "Asha")],
    expenses: [exp(900, "m1", ["m1", "r1", "a1"])], payments: [] };
  const ooty = { id: "2", name: "Ooty", currency: "INR", createdAt: 2, members: [me("m2"), p("r2", " ravi ")],
    expenses: [exp(200, "r2", ["m2", "r2"])], payments: [] };
  const o = C.friendsOverview([goa, ooty], "me@x.com");
  const ravi = o.friends.find((f) => f.key === "n:ravi");
  assert.deepEqual(obj(ravi.totals), { INR: 200 });
  assert.equal(ravi.lines.length, 2);
});

test("per family split gives each family one share", () => {
  const fam = [
    { id: "f", name: "Rao family", isFamily: true, adults: 2, kids: 2, email: "" },
    { id: "c", name: "Couple", isFamily: true, adults: 2, kids: 0, email: "" },
    { id: "s", name: "Sam", isFamily: false, adults: 1, kids: 0, email: "" },
  ];
  const g = { id: "g", members: fam, expenses: [], payments: [], currency: "INR" };
  const ones = { f: { adults: 1, kids: 0 }, c: { adults: 1, kids: 0 }, s: { adults: 1, kids: 0 } };
  const villa = exp(900000, "s", ["f", "c", "s"], "INR", { counts: ones });
  assert.deepEqual(obj(C.expenseShares(villa)), { f: 300000, c: 300000, s: 300000 });
  assert.equal(C.isPerFamily(villa, g), true);
  const perHead = { ...villa, counts: { f: { adults: 2, kids: 2 }, c: { adults: 2, kids: 0 }, s: { adults: 1, kids: 0 } } };
  assert.equal(C.isPerFamily(perHead, g), false);
  assert.equal(C.expenseShares(perHead).get("f"), 514286);
  assert.equal(C.isPerFamily({ ...villa, counts: {} }, g), false);
  assert.equal(C.isPerFamily(exp(40000, "a", ["a", "b"], "INR", { counts: { a: { adults: 1, kids: 0 }, b: { adults: 1, kids: 0 } } }), group([])), false);
});
