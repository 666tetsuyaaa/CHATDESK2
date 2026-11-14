// Remembers what the dashboard loaded, so opening a section again shows it at
// once instead of waiting on the server (each request goes to Sydney and back).
//
// - Asked again within FRESH_MS: answered from memory, no request.
// - Within KEEP_MS: answered from memory at once AND checked with the server
//   in the background; if the server's answer changed, REFRESHED_EVENT fires
//   so the page can redraw with it (see AdminDashboardLayout).
// - Older, or never asked: a normal request.
// Any change (POST, PATCH, PUT, DELETE) forgets everything, so an edit is
// never followed by an out-of-date list. Logins, and an open ticket's details
// and messages, are never remembered.
import axios from "axios";

const FRESH_MS = 30 * 1000;
const KEEP_MS = 10 * 60 * 1000;
export const REFRESHED_EVENT = "chatdesk:data-refreshed";

const NEVER = [/\/auth\//, /\/tickets\/\d+\//];
const memory = new Map(); // key -> { at, response }
const checking = new Set();

const networkAdapter = axios.getAdapter(axios.defaults.adapter);

function keyFor(config) {
  // Who is asking is part of the key: another admin never gets these answers.
  const auth = config.headers?.Authorization ?? config.headers?.authorization ?? "";
  return `${auth.slice(-24)} ${axios.getUri(config)}`;
}

export function forgetAll() {
  memory.clear();
}

function remember(key, response) {
  if (response.status >= 200 && response.status < 300) memory.set(key, { at: Date.now(), response });
}

function checkInBackground(config, key, known) {
  if (checking.has(key)) return;
  checking.add(key);
  networkAdapter(config)
    .then((response) => {
      remember(key, response);
      if (response.data !== known.response.data) {
        window.dispatchEvent(new CustomEvent(REFRESHED_EVENT, { detail: { key } }));
      }
    })
    .catch(() => {
      // Offline or the token expired - the next normal request deals with it.
    })
    .finally(() => checking.delete(key));
}

export async function cachingAdapter(config) {
  const method = (config.method || "get").toLowerCase();
  if (method !== "get") {
    forgetAll();
    return networkAdapter(config);
  }
  if (NEVER.some((pattern) => pattern.test(config.url || ""))) return networkAdapter(config);

  const key = keyFor(config);
  const known = memory.get(key);
  const age = known ? Date.now() - known.at : Infinity;
  if (known && age < KEEP_MS) {
    if (age >= FRESH_MS) checkInBackground(config, key, known);
    // The raw answer is turned into data again by axios, so each page gets
    // its own copy.
    return { ...known.response, config, request: null };
  }
  const response = await networkAdapter(config);
  remember(key, response);
  return response;
}
