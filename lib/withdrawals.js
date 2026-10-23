export const MIN_WITHDRAWAL = Number(process.env.MIN_WITHDRAWAL || 5);
export const MAX_PENDING = 3;
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const dbError = (e) =>
  e && /withdrawal_requests|request_withdrawal|resolve_withdrawal/i.test(e.message || "") ? "run_migration_021" : e?.message || "failed";
