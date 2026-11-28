import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SubTabBar from "./SubTabBar";
import { LoadingState } from "../ui/States";

const SupportTab = dynamic(() => import("./SupportTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading support tickets…" />,
});
const MessagesTab = dynamic(() => import("./MessagesTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading customer messages…" />,
});
const FeedbackTab = dynamic(() => import("./FeedbackTab"), {
  ssr: false,
  loading: () => <LoadingState label="Loading customer feedback…" />,
});

const VALID_SUBS = new Set(["support", "messages", "feedback"]);

/**
 * Unified Customer Inbox combining Support Tickets, Broadcast/Direct Messages, and Feedback.
 */
export default function CustomerInboxHub({ openTickets = 0, subHint }) {
  const [sub, setSub] = useState(VALID_SUBS.has(subHint?.sub) ? subHint.sub : "support");

  useEffect(() => {
    if (subHint?.tab === "inbox" && VALID_SUBS.has(subHint.sub)) {
      setSub(subHint.sub);
    }
  }, [subHint?.seq, subHint?.tab, subHint?.sub]);

  const tabs = [
    { id: "support", label: "Support Tickets", icon: "🎧", badge: openTickets },
    { id: "messages", label: "Messages", icon: "📨" },
    { id: "feedback", label: "Feedback", icon: "💬" },
  ];

  return (
    <div>
      <SubTabBar tabs={tabs} active={sub} onChange={setSub} />
      {sub === "support" && <SupportTab />}
      {sub === "messages" && <MessagesTab />}
      {sub === "feedback" && <FeedbackTab />}
    </div>
  );
}

