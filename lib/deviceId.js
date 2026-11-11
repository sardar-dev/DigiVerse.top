// First-party persistent device identifier for anti-fraud detection.
// Uses local persistence (localStorage + cookie) and browser hardware entropy.
// Safe, private, and 100% free-tier compatible.

const COOKIE_NAME = "dg_device_id";

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId() {
  if (typeof window === "undefined") return "";

  try {
    // 1. Try localStorage
    const stored = localStorage.getItem(COOKIE_NAME);
    if (stored && /^[a-zA-Z0-9_-]{16,64}$/.test(stored)) {
      setCookie(COOKIE_NAME, stored, 365);
      return stored;
    }

    // 2. Try cookie
    const cookieVal = getCookie(COOKIE_NAME);
    if (cookieVal && /^[a-zA-Z0-9_-]{16,64}$/.test(cookieVal)) {
      localStorage.setItem(COOKIE_NAME, cookieVal);
      return cookieVal;
    }

    // 3. Generate new persistent ID
    const newId = `dev_${generateUUID().replace(/-/g, "")}`;
    localStorage.setItem(COOKIE_NAME, newId);
    setCookie(COOKIE_NAME, newId, 365);
    return newId;
  } catch {
    return `fallback_${Date.now()}`;
  }
}

function setCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = `expires=${d.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
  } catch {}
}

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]+)`));
    return match ? match[3] : null;
  } catch {
    return null;
  }
}

