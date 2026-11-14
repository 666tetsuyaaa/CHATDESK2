/*
 * Inlined at the top of every page of the web app by finish-web-export.mjs,
 * so it runs before the app. Written in old-style JavaScript on purpose: it
 * must run on old browsers too.
 *
 * 1. Fallbacks for a few browser features that the app's libraries use and
 *    that older phones lack (iPhones before iOS 15.4 / 16: navigation uses
 *    toSpliced and findLastIndex, animations use structuredClone, start-up
 *    uses crypto.randomUUID). Each is added only when the browser has none.
 * 2. A browser too old to run the app at all (before about iOS 15, or an old
 *    Chrome) gets a short "Please update your browser" message instead of a
 *    blank or broken page.
 */
(function () {
  var AP = Array.prototype;
  function add(target, name, fn) {
    if (target && !(name in target)) {
      Object.defineProperty(target, name, { value: fn, writable: true, configurable: true });
    }
  }
  function copy(list) {
    return AP.slice.call(list);
  }

  add(AP, "at", function (n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    return n < 0 || n >= this.length ? undefined : this[n];
  });
  add(AP, "findLast", function (test, self) {
    for (var i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
    return undefined;
  });
  add(AP, "findLastIndex", function (test, self) {
    for (var i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
    return -1;
  });
  add(AP, "toSpliced", function () {
    var result = copy(this);
    AP.splice.apply(result, arguments);
    return result;
  });
  add(AP, "toSorted", function (compare) {
    return copy(this).sort(compare);
  });
  add(AP, "toReversed", function () {
    return copy(this).reverse();
  });
  add(Object, "hasOwn", function (object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  });

  if (typeof window.structuredClone !== "function") {
    window.structuredClone = function (value) {
      var seen = typeof WeakMap === "function" ? new WeakMap() : null;
      function clone(v) {
        if (v === null || typeof v !== "object") return v;
        if (seen && seen.has(v)) return seen.get(v);
        var out;
        if (v instanceof Date) return new Date(v.getTime());
        if (v instanceof RegExp) return new RegExp(v.source, v.flags);
        if (typeof Map === "function" && v instanceof Map) {
          out = new Map();
          if (seen) seen.set(v, out);
          v.forEach(function (item, key) {
            out.set(clone(key), clone(item));
          });
          return out;
        }
        if (typeof Set === "function" && v instanceof Set) {
          out = new Set();
          if (seen) seen.set(v, out);
          v.forEach(function (item) {
            out.add(clone(item));
          });
          return out;
        }
        out = Array.isArray(v) ? [] : {};
        if (seen) seen.set(v, out);
        for (var key in v) if (Object.prototype.hasOwnProperty.call(v, key)) out[key] = clone(v[key]);
        return out;
      }
      return clone(value);
    };
  }

  var crypto = window.crypto;
  if (crypto && typeof crypto.getRandomValues === "function" && typeof crypto.randomUUID !== "function") {
    crypto.randomUUID = function () {
      var b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 15) | 64;
      b[8] = (b[8] & 63) | 128;
      var hex = [];
      for (var i = 0; i < 16; i++) hex.push((b[i] + 256).toString(16).slice(1));
      return (
        hex.slice(0, 4).join("") + "-" + hex.slice(4, 6).join("") + "-" + hex.slice(6, 8).join("") + "-" +
        hex.slice(8, 10).join("") + "-" + hex.slice(10).join("")
      );
    };
  }

  // 2. What the app can't do without (each in browsers since about iOS 15 /
  // Chrome 90): its newer JavaScript syntax, and the screen and size
  // information it lays itself out with.
  function runs(source) {
    try {
      new Function(source);
      return true;
    } catch (e) {
      return false;
    }
  }
  var modern =
    runs("var a = {}; a.b = a?.c ?? 1; a.d ??= 2; class C { #p = 1; static s = 1; get p() { return this.#p; } }") &&
    "visualViewport" in window &&
    typeof window.ResizeObserver === "function" &&
    typeof window.fetch === "function" &&
    typeof window.Promise === "function";
  if (modern) return;

  window.__CHATDESK_UNSUPPORTED__ = true;
  var style = document.createElement("style");
  style.textContent = "#root{display:none!important}";
  document.head.appendChild(style);
  function showMessage() {
    var box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;" +
      "padding:24px;background:#122254;color:#fff;font-family:-apple-system,Helvetica,Arial,sans-serif;text-align:center;z-index:9999";
    box.innerHTML =
      '<div style="max-width:340px">' +
      '<div style="font-size:26px;font-weight:700;margin-bottom:6px">Chat<span style="color:#F5A623">Desk</span></div>' +
      '<div style="font-size:19px;font-weight:700;margin:18px 0 10px">Please update your browser</div>' +
      '<div style="font-size:15px;line-height:22px;opacity:.9">ChatDesk needs a newer browser than the one on this phone.' +
      "<br><br><b>iPhone:</b> update to iOS 15 or later in Settings &gt; General &gt; Software Update." +
      "<br><b>Android:</b> update Chrome from the Play Store." +
      "<br><br>Then open this page again.</div></div>";
    document.body.appendChild(box);
  }
  if (document.body) showMessage();
  else document.addEventListener("DOMContentLoaded", showMessage);
})();
