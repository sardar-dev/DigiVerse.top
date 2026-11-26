// Turns pasted text into delivery boxes. Pure function, shared by the
// admin form (live "N boxes" counter) and the server.
//  - mode "separator" (default): a line containing only --- separates
//    boxes; no separator = one box (which may span many lines).
//  - mode "line": every non-empty line is its own box (handy for pasting
//    a list of accounts, one per line).
export const MAX_BOX_LENGTH = 5000;
export const MAX_BOXES_PER_SAVE = 200;
// "Same content for every order" mode: longer text allowed, stock shown as unlimited.
export const MAX_SHARED_LENGTH = 5000;
export const SHARED_STOCK = 9999;

export function splitBoxes(text, mode = "separator") {
  const raw = String(text || "");
  const parts =
    mode === "line" ? raw.split(/\r?\n/) : raw.split(/^\s*---+\s*$/m);
  return parts.map((s) => s.trim()).filter(Boolean);
}
