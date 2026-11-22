/**
 * Formats raw supplier warranty codes into clear, human-readable descriptions.
 * e.g. "3W" -> "3 Weeks Warranty (See description)"
 *      "1M" -> "1 Month Warranty (See description)"
 *      "20D" -> "20 Days Warranty (See description)"
 *      "NW" / "No Warranty" -> "Specified in description"
 */
export function formatWarranty(val) {
  if (!val || typeof val !== "string") return "Stated in product description";
  const s = val.trim();
  const lower = s.toLowerCase();

  if (
    lower === "nw" ||
    lower === "no warranty" ||
    lower === "not specified by owner" ||
    lower === "redeem code" ||
    lower === "redmin link" ||
    lower === "100% replacement warranty"
  ) {
    return "Stated in product description";
  }

  if (lower === "fw" || lower === "full warranty") {
    return "Full Warranty (See description)";
  }

  if (
    lower === "activation" ||
    lower === "activatoin" ||
    lower === "activation warraty" ||
    lower === "login warranty" ||
    lower === "log in warranty"
  ) {
    return "Activation / Login Warranty (See description)";
  }

  // Weeks: e.g. 3W, 25w
  const weekMatch = s.match(/^(\d+)\s*w$/i);
  if (weekMatch) {
    const n = weekMatch[1];
    return `${n} Week${n === "1" ? "" : "s"} Warranty (See description)`;
  }

  // Months: e.g. 1M, 3M, 6M
  const monthMatch = s.match(/^(\d+)\s*m$/i);
  if (monthMatch) {
    const n = monthMatch[1];
    return `${n} Month${n === "1" ? "" : "s"} Warranty (See description)`;
  }

  // Days: e.g. 5D, 10D, 15D, 20D, 24 days, 27 DAYS, 3DW, 5DW
  const dayMatch = s.match(/^(\d+)\s*(?:d|days|dw)$/i);
  if (dayMatch) {
    const n = dayMatch[1];
    return `${n} Day${n === "1" ? "" : "s"} Warranty (See description)`;
  }

  // Hours: e.g. 12h, 24 H, 2 H ONLY
  const hourMatch = s.match(/^(\d+)\s*(?:h|hours?)(?:\s*only)?$/i);
  if (hourMatch) {
    const n = hourMatch[1];
    return `${n} Hour${n === "1" ? "" : "s"} Warranty (See description)`;
  }

  return s;
}

