// MySplitIt Web: logo, group types and expense icons. Same as the Android app (ui/Brand.kt).
import { html } from "https://unpkg.com/htm@3.1.1/preact/standalone.module.js";
import { PATHS } from "./icons.js?v=20261105c";

/** A Material icon by name, drawn in the current text colour. */
export const Icon = ({ name, size = 24, cls = "" }) =>
  html`<svg class=${"mi " + cls} viewBox="0 0 24 24" width=${size} height=${size} fill="currentColor" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: PATHS[name] || "" }}></svg>`;

/** The MySplitIt logo: a circle split in two halves on a teal tile. */
// Each logo gets its own gradient id: a gradient inside a hidden element (the sidebar on phones) can't be borrowed.
let logoCount = 0;
export const Logo = ({ size = 36, tile = true, cls = "" }) => {
  const id = "mslg" + (++logoCount);
  return html`<svg class=${"logo-mark " + cls} viewBox="0 0 108 108" width=${size} height=${size} aria-hidden="true">
  ${tile && html`<defs><linearGradient id=${id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00897b" /><stop offset="1" stop-color="#004d40" /></linearGradient></defs>
  <rect width="108" height="108" rx="30" fill=${`url(#${id})`} />`}
  <path fill="#fff" d="M51 30A24 24 0 0 0 51 78Z" /><path fill="#b2dfdb" d="M57 30A24 24 0 0 1 57 78Z" /></svg>`;
};

/** Group types: stored name, icon, colour and the emoji used in shared text. */
export const CATEGORIES = [
  { name: "Trip", icon: "flight", color: "#1e88e5", emoji: "✈️" },
  { name: "Road trip", icon: "directions_car", color: "#5e35b1", emoji: "🚗" },
  { name: "Holiday", icon: "beach_access", color: "#00acc1", emoji: "🏖️" },
  { name: "Outing", icon: "restaurant", color: "#f4511e", emoji: "🍽️" },
  { name: "Home", icon: "home", color: "#43a047", emoji: "🏠" },
  { name: "Event", icon: "celebration", color: "#d81b60", emoji: "🎉" },
  { name: "Sports", icon: "sports_soccer", color: "#7cb342", emoji: "⚽" },
  { name: "Work", icon: "work", color: "#6d4c41", emoji: "💼" },
  { name: "Other", icon: "category", color: "#546e7a", emoji: "📌" },
];
export const categoryStyle = (c) => CATEGORIES.find((x) => x.name === c) || CATEGORIES[CATEGORIES.length - 1];

/** A coloured rounded tile with a white icon. */
export const Tile = ({ icon, color, size = 48 }) =>
  html`<span class="tile" style=${`--c:${color};width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px`}><${Icon} name=${icon} size=${Math.round(size * 0.52)} /></span>`;

export const CategoryTile = ({ category, size = 48 }) => {
  const s = categoryStyle(category);
  return html`<${Tile} icon=${s.icon} color=${s.color} size=${size} />`;
};

// Picked from words in the expense name ("Hotel", "Uber", "Dinner"…). Same order as Android.
const RULES = [
  [/hotel|stay|room|resort|airbnb|hostel|lodge|villa|homestay/i, "hotel", "#7e57c2"],
  [/taxi|\bcab\b|uber|\bola\b|lyft|rapido|\bauto\b|rickshaw|ride|transfer/i, "local_taxi", "#f9a825"],
  [/flight|airline|plane|airport|air ticket/i, "flight", "#1e88e5"],
  [/train|rail|metro|subway|tram/i, "train", "#3949ab"],
  [/\bbus\b|coach/i, "directions_bus", "#3949ab"],
  [/fuel|petrol|diesel|toll|parking|\bgas station/i, "local_gas_station", "#e53935"],
  [/\bcar\b|rental|bike|scooter/i, "directions_car", "#5e35b1"],
  [/coffee|\btea\b|cafe|café|starbucks|chai/i, "local_cafe", "#8d6e63"],
  [/beer|\bbar\b|drinks|wine|\bpub\b|cocktail|liquor/i, "local_bar", "#ab47bc"],
  [/ice ?cream|dessert|cake|sweets|bakery/i, "icecream", "#ec407a"],
  [/snack|burger|pizza|kfc|mcdonald|fries|sandwich/i, "fastfood", "#fb8c00"],
  [/breakfast|lunch|dinner|food|restaurant|meal|brunch|biryani|buffet|dhaba|eat/i, "restaurant", "#f4511e"],
  [/grocer|supermarket|vegetable|fruits|market|costco|walmart/i, "shopping_cart", "#43a047"],
  [/shopping|clothes|mall|souvenir|amazon/i, "shopping_bag", "#d81b60"],
  [/movie|cinema|film|netflix/i, "movie", "#6d4c41"],
  [/ticket|entry|museum|\bpark\b|\bzoo\b|show|tour|safari|boat|cruise|activity/i, "confirmation_number", "#00897b"],
  [/gift|present|birthday/i, "card_giftcard", "#e91e63"],
  [/\brent\b|maintenance|society/i, "home", "#43a047"],
  [/electric|power|wifi|internet|\bbill\b|water|recharge|phone/i, "bolt", "#ffa000"],
  [/medic|doctor|pharmacy|hospital|clinic/i, "medical_services", "#e53935"],
  [/sport|gym|court|turf|golf|swim/i, "sports_soccer", "#7cb342"],
];
export const expenseStyle = (text) => {
  const r = RULES.find(([re]) => re.test(text));
  return r ? { icon: r[1], color: r[2] } : { icon: "receipt", color: "#00897b" };
};
export const PAYMENT = { icon: "handshake", color: "#2e7d32" };
