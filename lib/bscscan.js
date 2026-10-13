// Verifies USDT (BEP20) payments by looking up transaction hashes
// directly on BNB Smart Chain, via free public RPC nodes — no API
// key, no third-party explorer service, and no paid plan needed.
//
// History: this used to call BscScan's API (api.bscscan.com), which
// was deprecated in August 2025. It was then migrated to Etherscan's
// unified V2 API, but that turned out to require a PAID plan for BSC
// coverage on the free tier ("Free API access is not supported for
// this chain"). Reading transaction receipts straight from a BSC RPC
// node sidesteps both problems entirely and is how block explorers
// get this data in the first place.

const RPC_ENDPOINTS = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
  "https://rpc.ankr.com/bsc",
];

// keccak256("Transfer(address,address,uint256)") — the standard
// ERC20/BEP20 Transfer event signature every token log starts with.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const USDT_DECIMALS = 18; // BEP20 USDT uses 18 decimals (unlike ERC20 USDT's 6)

function topicToAddress(topic) {
  return "0x" + topic.slice(26).toLowerCase();
}

function usdtRawToAmount(hexValue) {
  return Number(BigInt(hexValue)) / 10 ** USDT_DECIMALS;
}

async function rpcCall(method, params) {
  let lastError;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) {
        lastError = new Error(data.error.message || "RPC error");
        continue;
      }
      return data.result;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All BSC RPC endpoints failed");
}

/**
 * Low-level lookup: reads the transaction receipt straight from a BSC
 * node and finds the USDT Transfer event inside it. Returns
 * everything about the transfer with NO business rules applied (no
 * amount/expected checks) — those live in the two wrapper functions
 * below. Also used by the admin debug tool.
 */
export async function lookupUsdtTransfer(txHash) {
  const contract = (process.env.BSC_USDT_CONTRACT || "").toLowerCase();
  const payout = (process.env.PAYOUT_WALLET_ADDRESS || "").toLowerCase();

  if (!contract) return { found: false, reason: "usdt_contract_missing" };
  if (!payout) return { found: false, reason: "payout_wallet_missing" };
  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { found: false, reason: "invalid_tx_hash" };
  }

  let receipt;
  try {
    receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
  } catch (e) {
    return { found: false, reason: "chain_lookup_failed", detail: e.message };
  }

  if (!receipt) {
    // Either it hasn't been mined yet, or the hash is wrong.
    return { found: false, reason: "not_found_yet" };
  }

  if (receipt.status !== "0x1") {
    return { found: true, reason: "tx_failed" };
  }

  const transferLog = (receipt.logs || []).find(
    (log) =>
      log.address?.toLowerCase() === contract &&
      log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
      topicToAddress(log.topics[2]) === payout
  );

  if (!transferLog) {
    // The tx was mined, but it wasn't a USDT transfer to our wallet —
    // wrong token, wrong recipient, or wrong tx entirely.
    return { found: true, reason: "wrong_recipient" };
  }

  let currentBlockHex;
  try {
    currentBlockHex = await rpcCall("eth_blockNumber", []);
  } catch (e) {
    return { found: false, reason: "chain_lookup_failed", detail: e.message };
  }

  const confirmations =
    parseInt(currentBlockHex, 16) - parseInt(receipt.blockNumber, 16);

  return {
    found: true,
    ok: true,
    amount: usdtRawToAmount(transferLog.data),
    from: topicToAddress(transferLog.topics[1]),
    to: payout,
    confirmations,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Order checkout: verifies a tx paid at least `expectedAmount` with
 * enough confirmations. Returns { ok, reason, amount, from, confirmations }.
 */
export async function verifyUsdtPayment({ txHash, expectedAmount }) {
  const minConf = Number(process.env.MIN_CONFIRMATIONS || 3);
  const result = await lookupUsdtTransfer(txHash);

  if (!result.found) return { ok: false, reason: result.reason, detail: result.detail };
  if (result.reason === "wrong_recipient" || result.reason === "tx_failed") {
    return { ok: false, reason: result.reason };
  }

  // Tiny slack for float rounding only: the fingerprint digits (0.0001-0.0009)
  // must actually be paid, not absorbed by tolerance.
  if (result.amount + 0.00002 < expectedAmount) {
    return { ok: false, reason: "amount_too_low", amount: result.amount };
  }
  if (result.confirmations < minConf) {
    return {
      ok: false,
      reason: "awaiting_confirmations",
      amount: result.amount,
      confirmations: result.confirmations,
    };
  }
  return { ok: true, amount: result.amount, from: result.from, confirmations: result.confirmations };
}

/**
 * Wallet top-up: same on-chain check, but ANY amount is accepted
 * (whatever the customer sent gets credited to their balance 1:1).
 */
export async function verifyUsdtTopup({ txHash }) {
  const minConf = Number(process.env.MIN_CONFIRMATIONS || 3);
  const result = await lookupUsdtTransfer(txHash);

  if (!result.found) return { ok: false, reason: result.reason, detail: result.detail };
  if (result.reason === "wrong_recipient" || result.reason === "tx_failed") {
    return { ok: false, reason: result.reason };
  }

  if (result.confirmations < minConf) {
    return {
      ok: false,
      reason: "awaiting_confirmations",
      amount: result.amount,
      confirmations: result.confirmations,
    };
  }
  return { ok: true, amount: result.amount, from: result.from, confirmations: result.confirmations };
}
