// Supported EVM crypto networks & tokens for DigiVerse checkout and wallet deposits.
// All options listed here share the identical EVM payout wallet address (0x...).

export const CRYPTO_NETWORKS = {
  usdt_bep20: {
    id: "usdt_bep20",
    token: "USDT",
    label: "USDT (BEP20)",
    networkName: "BNB Smart Chain (BEP20)",
    shortNetwork: "BSC (BEP20)",
    decimals: 18,
    chainId: 56,
    badge: "Default",
    explorerTx: "https://bscscan.com/tx/",
    acceptedContracts: [
      (process.env.BSC_USDT_CONTRACT || "0x55d398326f99059fF775485246999027B3197955").toLowerCase(),
    ],
    rpcEndpoints: [
      "https://bsc-dataseed.binance.org/",
      "https://bsc-dataseed1.defibit.io/",
      "https://bsc-rpc.publicnode.com",
      "https://1rpc.io/bnb",
    ],
  },
  usdt_polygon: {
    id: "usdt_polygon",
    token: "USDT",
    label: "USDT (Polygon)",
    networkName: "Polygon PoS",
    shortNetwork: "Polygon",
    decimals: 6,
    chainId: 137,
    badge: "Lowest Gas (<$0.01)",
    explorerTx: "https://polygonscan.com/tx/",
    acceptedContracts: [
      "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // Native Polygon Tether USD
    ],
    rpcEndpoints: [
      "https://1rpc.io/matic",
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon.drpc.org",
    ],
  },
  usdc_polygon: {
    id: "usdc_polygon",
    token: "USDC",
    label: "USDC (Polygon)",
    networkName: "Polygon PoS",
    shortNetwork: "Polygon",
    decimals: 6,
    chainId: 137,
    badge: "Popular USD Coin",
    explorerTx: "https://polygonscan.com/tx/",
    acceptedContracts: [
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // Circle Native USDC
      "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", // Legacy Bridged USDC.e fallback
    ],
    rpcEndpoints: [
      "https://1rpc.io/matic",
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon.drpc.org",
    ],
  },
  usdc_base: {
    id: "usdc_base",
    token: "USDC",
    label: "USDC (Base)",
    networkName: "Base (Coinbase L2)",
    shortNetwork: "Base",
    decimals: 6,
    chainId: 8453,
    badge: "Coinbase L2",
    explorerTx: "https://basescan.org/tx/",
    acceptedContracts: [
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Circle Native USDC on Base
    ],
    rpcEndpoints: [
      "https://mainnet.base.org",
      "https://base-rpc.publicnode.com",
      "https://1rpc.io/base",
      "https://base.drpc.org",
    ],
  },
  usdc_bep20: {
    id: "usdc_bep20",
    token: "USDC",
    label: "USDC (BEP20)",
    networkName: "BNB Smart Chain (BEP20)",
    shortNetwork: "BSC (BEP20)",
    decimals: 18,
    chainId: 56,
    badge: "Binance USDC",
    explorerTx: "https://bscscan.com/tx/",
    acceptedContracts: [
      "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // Binance-Peg USDC
    ],
    rpcEndpoints: [
      "https://bsc-dataseed.binance.org/",
      "https://bsc-dataseed1.defibit.io/",
      "https://bsc-rpc.publicnode.com",
      "https://1rpc.io/bnb",
    ],
  },
};

export const DEFAULT_NETWORK_ID = "usdt_bep20";

export function getNetworkConfig(networkId) {
  return CRYPTO_NETWORKS[networkId] || CRYPTO_NETWORKS[DEFAULT_NETWORK_ID];
}

