// Backward-compatible adapter for legacy imports.
// Backed by the universal multi-chain EVM verifier in lib/cryptoVerifier.js, supporting
// USDT (BEP20), USDT (Polygon), USDC (Polygon), USDC (Base), and USDC (BEP20).

import {
  lookupCryptoTransfer,
  verifyCryptoPayment,
  verifyCryptoTopup,
} from "./cryptoVerifier";

export async function lookupUsdtTransfer(txHash, networkKey = "usdt_bep20") {
  return lookupCryptoTransfer(txHash, networkKey);
}

export async function verifyUsdtPayment(args) {
  return verifyCryptoPayment({ ...args, networkKey: args?.networkKey || "usdt_bep20" });
}

export async function verifyUsdtTopup(args) {
  return verifyCryptoTopup({ ...args, networkKey: args?.networkKey || "usdt_bep20" });
}
