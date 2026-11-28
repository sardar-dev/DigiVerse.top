import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SubTabBar from "./SubTabBar";
import { LoadingState } from "../ui/States";

const ReferralsTab = dynamic(() => import("./ReferralsTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading referrals…" />,
});
const ReferralCostTab = dynamic(() => import("./ReferralCostTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading referral cost analytics…" />,
});

const SUB_TABS = [
  { id: "rewards", label: "Rewards & Gifts", icon: "🎁" },
  { id: "costs", label: "Costs & Analytics", icon: "📊" },
];

/**
 * Unified Referrals hub combining referral management and supplier cost analytics.
 * Each sub-tab loads dynamically only when selected to keep free-tier requests minimal.
 */
export default function ReferralsHub({ subHint }) {
  const [sub, setSub] = useState(subHint?.sub === "costs" ? "costs" : "rewards");

  useEffect(() => {
    if (subHint?.tab === "referrals" && subHint.sub) {
      setSub(subHint.sub === "costs" ? "costs" : "rewards");
    }
  }, [subHint?.seq, subHint?.tab, subHint?.sub]);

  return (
    <div>
      <SubTabBar tabs={SUB_TABS} active={sub} onChange={setSub} />
      {sub === "rewards" ? <ReferralsTab /> : <ReferralCostTab />}
    </div>
  );
}

