// Supplier text (mostly Telegram-bot catalogs) can carry premium-emoji
// placeholders like "{pe:5069075201950483359}". They mean nothing on the
// web, so strip them and tidy the leftover spacing.
const TAG = /\{[a-zA-Z]{1,6}:\d{5,}\}/g;

// Single-line display text (titles).
export function cleanTitle(raw) {
  if (typeof raw !== "string") return raw;
  return raw.replace(TAG, "").replace(/\s+/g, " ").trim();
}

// Multi-line text (descriptions): keep line breaks, drop tags + double spaces.
export function stripTags(raw) {
  if (typeof raw !== "string") return raw;
  return raw.replace(TAG, "").replace(/[ \t]{2,}/g, " ");
}
