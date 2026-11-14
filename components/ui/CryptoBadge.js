// Renders an official cryptocurrency logo with an overlapping network badge.
// 100% vector SVG, compressed, fast, and crisp on all screen densities.

const SIZES = {
  sm: { coin: "w-6 h-6", net: "w-3 h-3 -bottom-0.5 -right-0.5", coinDim: 24, netDim: 12 },
  md: { coin: "w-8 h-8", net: "w-4 h-4 -bottom-1 -right-1", coinDim: 32, netDim: 16 },
  lg: { coin: "w-10 h-10", net: "w-5 h-5 -bottom-1 -right-1", coinDim: 40, netDim: 20 },
};

const ICONS = {
  usdt_bep20: { coin: "/crypto/usdt.svg", net: "/crypto/bsc.svg", alt: "USDT on BSC" },
  usdt_polygon: { coin: "/crypto/usdt.svg", net: "/crypto/polygon.svg", alt: "USDT on Polygon" },
  usdc_polygon: { coin: "/crypto/usdc.svg", net: "/crypto/polygon.svg", alt: "USDC on Polygon" },
  usdc_base: { coin: "/crypto/usdc.svg", net: "/crypto/base.svg", alt: "USDC on Base" },
  usdc_bep20: { coin: "/crypto/usdc.svg", net: "/crypto/bsc.svg", alt: "USDC on BSC" },
};

export default function CryptoBadge({ networkId, size = "md", className = "" }) {
  const icon = ICONS[networkId] || ICONS.usdt_bep20;
  const s = SIZES[size] || SIZES.md;

  return (
    <div className={`relative inline-flex flex-shrink-0 items-center justify-center ${className}`}>
      {/* Primary Token Icon (USDT / USDC) */}
      <img
        src={icon.coin}
        alt={icon.alt}
        className={`${s.coin} rounded-full shadow-sm`}
        width={s.coinDim}
        height={s.coinDim}
        loading="eager"
      />
      {/* Network Mini-Badge Overlay (Polygon / Base / BSC) */}
      <img
        src={icon.net}
        alt=""
        aria-hidden="true"
        className={`absolute ${s.net} rounded-full border-2 border-surface bg-surface shadow-xs`}
        width={s.netDim}
        height={s.netDim}
        loading="eager"
      />
    </div>
  );
}
