// Universal EVM Crypto Verifier for DigiVerse.
// Verifies USDT and USDC transfers across BNB Smart Chain, Polygon PoS, and Base
// via free public JSON-RPC nodes with zero third-party dependencies or fees.

import { CRYPTO_NETWORKS, DEFAULT_NETWORK_ID, getNetworkConfig } from "./cryptoNetworks";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicToAddress(topic) {
  if (!topic || typeof topic !== "string" || topic.length < 26) return "";
  return "0x" + topic.slice(26).toLowerCase();
}

function rawToAmount(hexValue, decimals) {
  try {
    return Number(BigInt(hexValue)) / 10 ** decimals;
  } catch {
    return 0;
  }
}

async function rpcCall(endpoints, method, params) {
  let lastError;
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      clearTimeout(timer);
      const data = await res.json();
      if (data && data.error) {
        lastError = new Error(data.error.message || "RPC error");
        continue;
      }
      if (data && data.result !== undefined) {
        return data.result;
      }
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
    }
  }
  throw lastError || new Error("All RPC endpoints failed for network");
}

/**
 * Checks a specific network's RPC for a token transfer receipt.
 */
async function checkReceiptOnNetwork(txHash, networkConfig, payoutWallet) {
  let receipt;
  try {
    receipt = await rpcCall(networkConfig.rpcEndpoints, "eth_getTransactionReceipt", [txHash]);
  } catch (e) {
    return { found: false, reason: "chain_lookup_failed", detail: e.message };
  }

  if (!receipt) {
    return { found: false, reason: "not_found_yet" };
  }

  if (receipt.status !== "0x1") {
    return { found: true, reason: "tx_failed" };
  }

  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  const transferLog = logs.find((log) => {
    const isTransfer = log.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC;
    if (!isTransfer) return false;
    const recipient = topicToAddress(log.topics?.[2]);
    const isToUs = recipient === payoutWallet;
    if (!isToUs) return false;
    const tokenContract = (log.address || "").toLowerCase();
    return networkConfig.acceptedContracts.includes(tokenContract);
  });

  if (!transferLog) {
    return { found: true, reason: "wrong_recipient" };
  }

  let currentBlockHex;
  try {
    currentBlockHex = await rpcCall(networkConfig.rpcEndpoints, "eth_blockNumber", []);
  } catch (e) {
    return { found: false, reason: "chain_lookup_failed", detail: e.message };
  }

  const confirmations =
    parseInt(currentBlockHex, 16) - parseInt(receipt.blockNumber, 16);

  return {
    found: true,
    ok: true,
    network: networkConfig.id,
    token: networkConfig.token,
    networkName: networkConfig.networkName,
    amount: rawToAmount(transferLog.data, networkConfig.decimals),
    from: topicToAddress(transferLog.topics?.[1]),
    to: payoutWallet,
    confirmations,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Universal lookup across supported EVM networks.
 * Tries the preferred network first; if not found, scans the remaining
 * supported networks so a customer who sent on Polygon or Base instead of BSC
 * is still automatically verified.
 */
export async function lookupCryptoTransfer(txHash, preferredNetworkKey = DEFAULT_NETWORK_ID) {
  const payout = (process.env.PAYOUT_WALLET_ADDRESS || "").toLowerCase();
  if (!payout) return { found: false, reason: "payout_wallet_missing" };

  if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash.trim())) {
    return { found: false, reason: "invalid_tx_hash" };
  }
  const cleanHash = txHash.trim().toLowerCase();

  const primaryConfig = getNetworkConfig(preferredNetworkKey);
  const primaryResult = await checkReceiptOnNetwork(cleanHash, primaryConfig, payout);

  if (primaryResult.ok) {
    return primaryResult;
  }

  // If primary check failed due to not_found_yet or wrong_recipient,
  // scan other networks in case customer chose network A but sent on network B.
  const otherNetworkKeys = Object.keys(CRYPTO_NETWORKS).filter((k) => k !== primaryConfig.id);
  for (const altKey of otherNetworkKeys) {
    const altConfig = CRYPTO_NETWORKS[altKey];
    try {
      const altResult = await checkReceiptOnNetwork(cleanHash, altConfig, payout);
      if (altResult.ok) {
        return altResult;
      }
    } catch {
      // Continue checking other networks
    }
  }

  return primaryResult;
}

/**
 * Verifies an order payment against expected amount and minimum block confirmations.
 */
export async function verifyCryptoPayment({ txHash, expectedAmount, networkKey = DEFAULT_NETWORK_ID }) {
  const minConf = Number(process.env.MIN_CONFIRMATIONS || 3);
  const result = await lookupCryptoTransfer(txHash, networkKey);

  if (!result.found) return { ok: false, reason: result.reason, detail: result.detail };
  if (result.reason === "wrong_recipient" || result.reason === "tx_failed") {
    return { ok: false, reason: result.reason };
  }

  // Tolerance of 0.00002 for float rounding only: exact micro-fingerprint digits must be paid
  if (result.amount + 0.00002 < expectedAmount) {
    return { ok: false, reason: "amount_too_low", amount: result.amount };
  }

  if (result.confirmations < minConf) {
    return {
      ok: false,
      reason: "awaiting_confirmations",
      amount: result.amount,
      confirmations: result.confirmations,
      network: result.network,
      token: result.token,
    };
  }

  return {
    ok: true,
    amount: result.amount,
    from: result.from,
    confirmations: result.confirmations,
    network: result.network,
    token: result.token,
    networkName: result.networkName,
  };
}

/**
 * Verifies wallet balance top-up across supported networks (any amount credited 1:1).
 */
export async function verifyCryptoTopup({ txHash, networkKey = DEFAULT_NETWORK_ID }) {
  const minConf = Number(process.env.MIN_CONFIRMATIONS || 3);
  const result = await lookupCryptoTransfer(txHash, networkKey);

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
      network: result.network,
      token: result.token,
    };
  }

  return {
    ok: true,
    amount: result.amount,
    from: result.from,
    confirmations: result.confirmations,
    network: result.network,
    token: result.token,
    networkName: result.networkName,
  };
}

