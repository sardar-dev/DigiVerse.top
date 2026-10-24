// No minimum: any amount from one cent up. (MIN_WITHDRAWAL env can set one.)
export const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL || 0.01);
export const MAX_PENDING = 3;

export const METHODS = {
  usdt_bep20: { label: "USDT (BEP20)", short: "USDT BEP20" },
  pkr_iban: { label: "PKR bank account (IBAN)", short: "PKR bank" },
  binance: { label: "Binance ID", short: "Binance" },
};

const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Returns { ok, address, details } or { ok:false, error }.
export function validatePayout(body) {
  const method = body?.method;
  if (method === "usdt_bep20") {
    const address = clean(body.address, 60);
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return { ok: false, error: "invalid_address" };
    return { ok: true, method, address, details: {} };
  }
  if (method === "pkr_iban") {
    const iban = clean(body.address, 40).replace(/\s/g, "").toUpperCase();
    if (!/^PK\d{2}[A-Z0-9]{4}\d{16}$/.test(iban)) return { ok: false, error: "invalid_iban" };
    const title = clean(body.account_title, 60);
    if (title.length < 3) return { ok: false, error: "title_required" };
    const bank = clean(body.bank_name, 40);
    return { ok: true, method, address: iban, details: { account_title: title, ...(bank ? { bank_name: bank } : {}) } };
  }
  if (method === "binance") {
    const id = clean(body.address, 60);
    if (!/^\d{5,15}$/.test(id)) return { ok: false, error: "invalid_binance" };
    return { ok: true, method, address: id, details: {} };
  }
  return { ok: false, error: "invalid_method" };
}

export const dbError = (e) =>
  e && /withdrawal_requests|request_withdrawal|resolve_withdrawal|method|details/i.test(e.message || "")
    ? "run_migration_022"
    : e?.message || "failed";
