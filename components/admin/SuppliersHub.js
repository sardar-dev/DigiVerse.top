import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SubTabBar from "./SubTabBar";
import { LoadingState } from "../ui/States";

const SuppliersTab = dynamic(() => import("./SuppliersTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading suppliers…" />,
});
const ApiConnectionsTab = dynamic(() => import("./ApiConnectionsTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading API connections…" />,
});

const SUB_TABS = [
  { id: "linking", label: "Supplier Linking", icon: "🔗" },
  { id: "apis", label: "API Connections", icon: "🔌" },
];

/**
 * Unified Suppliers & APIs hub keeping multi-source product matching and custom API keys together.
 */
export default function SuppliersHub({ onChanged, subHint }) {
  const [sub, setSub] = useState(subHint?.sub === "apis" ? "apis" : "linking");

  useEffect(() => {
    if (subHint?.tab === "suppliers" && subHint.sub) {
      setSub(subHint.sub === "apis" ? "apis" : "linking");
    }
  }, [subHint?.seq, subHint?.tab, subHint?.sub]);

  return (
    <div>
      <SubTabBar tabs={SUB_TABS} active={sub} onChange={setSub} />
      {sub === "linking" ? (
        <SuppliersTab onChanged={onChanged} />
      ) : (
        <ApiConnectionsTab onChanged={onChanged} />
      )}
    </div>
  );
}

