import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SubTabBar from "./SubTabBar";
import ProductsTab from "./ProductsTab";
import { LoadingState } from "../ui/States";

const AiDescriptionsTab = dynamic(() => import("./AiDescriptionsTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading AI descriptions…" />,
});

const SUB_TABS = [
  { id: "catalog", label: "Catalog", icon: "🛍️" },
  { id: "aitext", label: "AI Descriptions", icon: "✨" },
];

/**
 * Unified Products hub combining catalog management and on-demand AI description rewriting.
 */
export default function ProductsHub({ subHint, ...productsProps }) {
  const [sub, setSub] = useState(subHint?.sub === "aitext" ? "aitext" : "catalog");

  useEffect(() => {
    if (subHint?.tab === "products" && subHint.sub) {
      setSub(subHint.sub === "aitext" ? "aitext" : "catalog");
    }
  }, [subHint?.seq, subHint?.tab, subHint?.sub]);

  return (
    <div>
      <SubTabBar tabs={SUB_TABS} active={sub} onChange={setSub} />
      {sub === "catalog" ? <ProductsTab {...productsProps} /> : <AiDescriptionsTab />}
    </div>
  );
}

