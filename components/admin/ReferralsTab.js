import { useEffect, useState } from "react";
import Alert from "../ui/Alert";
import { PrimaryButton, SecondaryButton } from "../ui/Button";
import { FormInput } from "../ui/FormInput";

export default function ReferralsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({ settings: {}, referrals: [], gifts: [] });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form settings state
  const [settingsForm, setSettingsForm] = useState({
    referral_enabled: true,
    redemption_enabled: true,
    require_email_verification: true,
    max_lifetime_gifts: 15,
    daily_redemption_limit: 3,
    lock_delay_seconds: 30,
    supplier_cost_per_gift: 0.06,
    fraud_max_accounts_per_ip: 3,
    fraud_max_accounts_per_device: 2,
  });

  const [whitelistIps, setWhitelistIps] = useState("");
  const [whitelistDevices, setWhitelistDevices] = useState("");
  const [referralFilter, setReferralFilter] = useState("all"); // all | qualified | pending | flagged
  const [bannedFilter, setBannedFilter] = useState("all"); // all | ip | device
  const [banForm, setBanForm] = useState({ type: "ip", value: "", reason: "" });
  const [banSubmitting, setBanSubmitting] = useState(false);
  const [clearingPast, setClearingPast] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState("referrals"); // referrals | gifts | settings | banned

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/referrals");
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.whitelist_ips !== undefined) setWhitelistIps(json.whitelist_ips || "");
        if (json.whitelist_devices !== undefined) setWhitelistDevices(json.whitelist_devices || "");
        if (json.settings && Object.keys(json.settings).length > 0) {
          setSettingsForm({
            referral_enabled: json.settings.referral_enabled !== undefined ? Boolean(json.settings.referral_enabled) : true,
            redemption_enabled: json.settings.redemption_enabled !== undefined ? Boolean(json.settings.redemption_enabled) : true,
            require_email_verification: json.settings.require_email_verification !== undefined ? Boolean(json.settings.require_email_verification) : true,
            max_lifetime_gifts: json.settings.max_lifetime_gifts ?? 15,
            daily_redemption_limit: json.settings.daily_redemption_limit ?? 3,
            lock_delay_seconds: json.settings.lock_delay_seconds ?? 30,
            supplier_cost_per_gift: Number(json.settings.supplier_cost_per_gift ?? 0.06),
            fraud_max_accounts_per_ip: json.settings.fraud_max_accounts_per_ip ?? 3,
            fraud_max_accounts_per_device: json.settings.fraud_max_accounts_per_device ?? 2,
          });
        }
      } else {
        setError(json.error || "Failed to load referral data.");
      }
    } catch {
      setError("Network error loading referral data.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settingsForm,
          whitelist_ips: whitelistIps,
          whitelist_devices: whitelistDevices,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess("Referral settings and admin whitelist saved successfully!");
        if (json.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            referral_enabled: json.settings.referral_enabled !== undefined ? Boolean(json.settings.referral_enabled) : prev.referral_enabled,
            redemption_enabled: json.settings.redemption_enabled !== undefined ? Boolean(json.settings.redemption_enabled) : prev.redemption_enabled,
            require_email_verification: json.settings.require_email_verification !== undefined ? Boolean(json.settings.require_email_verification) : prev.require_email_verification,
            max_lifetime_gifts: json.settings.max_lifetime_gifts ?? prev.max_lifetime_gifts,
            daily_redemption_limit: json.settings.daily_redemption_limit ?? prev.daily_redemption_limit,
            lock_delay_seconds: json.settings.lock_delay_seconds ?? prev.lock_delay_seconds,
            supplier_cost_per_gift: Number(json.settings.supplier_cost_per_gift ?? prev.supplier_cost_per_gift),
            fraud_max_accounts_per_ip: json.settings.fraud_max_accounts_per_ip ?? prev.fraud_max_accounts_per_ip,
            fraud_max_accounts_per_device: json.settings.fraud_max_accounts_per_device ?? prev.fraud_max_accounts_per_device,
          }));
        }
      } else {
        setError(json.error || "Failed to save settings.");
      }
    } catch {
      setError("Network error while saving settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleWhitelistIp(ipToWhitelist) {
    if (!ipToWhitelist) return;
    setError("");
    setSuccess("");
    const currentList = whitelistIps.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (currentList.includes(ipToWhitelist)) {
      setSuccess(`IP ${ipToWhitelist} is already in whitelist!`);
      return;
    }
    const updated = currentList.concat(ipToWhitelist).join(", ");
    setWhitelistIps(updated);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_whitelist", whitelist_ips: updated, whitelist_devices: whitelistDevices }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`IP ${ipToWhitelist} has been successfully added to Admin Whitelist! You can now create unlimited test accounts on this IP.`);
      }
    } catch (e) {
      setError("Failed to save whitelist IP: " + e.message);
    }
  }

  async function handleBanEntity(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!banForm.value.trim()) {
      setError("Please enter an IP address or Device ID to ban.");
      return;
    }
    setError("");
    setSuccess("");
    setBanSubmitting(true);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban_entity",
          type: banForm.type,
          value: banForm.value.trim(),
          reason: banForm.reason.trim() || "Manual ban by admin",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Successfully banned ${banForm.type.toUpperCase()}: ${banForm.value}!`);
        setBanForm({ type: "ip", value: "", reason: "" });
        load();
      } else {
        setError(json.error || "Failed to ban entity.");
      }
    } catch {
      setError("Network error banning entity.");
    } finally {
      setBanSubmitting(false);
    }
  }

  async function handleQuickBan(type, value) {
    if (!value) return;
    const reason = prompt(
      `Enter reason to ban this ${type === "ip" ? "IP address" : "device"}:`,
      "Multiple accounts / fraud detected"
    );
    if (!reason) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ban_entity",
          type,
          value,
          reason,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Successfully banned ${type.toUpperCase()}: ${value}!`);
        load();
      } else {
        setError(json.error || "Failed to ban.");
      }
    } catch {
      setError("Network error.");
    }
  }

  async function handleUnbanEntity(type, value) {
    if (
      !confirm(
        `Are you sure you want to unban this ${type === "ip" ? "IP" : "device"} (${value})?\n\nThis will remove it from the blocklist and allow registrations again.`
      )
    ) {
      return;
    }
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unban_entity",
          type,
          value,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Successfully unbanned ${value}! Restrictions lifted.`);
        load();
      } else {
        setError(json.error || "Failed to unban.");
      }
    } catch {
      setError("Network error.");
    }
  }

  async function handleClearAllPastBans() {
    if (
      !confirm(
        "⚠️ FRESH START CONFIRMATION\n\nAre you sure you want to clear ALL past test bans and reset device tracking?\n\nThis will:\n1. Remove all banned IPs and Devices from previous tests.\n2. Mark past test flagged referrals as qualified.\n3. Reset device registration limits so your system starts 100% fresh from now."
      )
    ) {
      return;
    }
    setError("");
    setSuccess("");
    setClearingPast(true);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_past_bans" }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(
          `Fresh start activated! Cleared past bans. Unflagged ${json.unflagged_referrals_count || 0} referral(s) and reset device counters.`
        );
        load();
      } else {
        setError(json.error || "Failed to clear past bans.");
      }
    } catch {
      setError("Network error while clearing past bans.");
    } finally {
      setClearingPast(false);
    }
  }

  async function toggleEmailVerificationQuick(targetState) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_email_verification", enabled: targetState }),
      });
      const json = await res.json();
      if (json.success) {
        setSettingsForm((prev) => ({ ...prev, require_email_verification: targetState }));
        setSuccess(
          targetState
            ? "Email Verification Requirement is now ON: Only users who confirm their email will qualify as valid referrals."
            : `Email Verification Requirement is now OFF: All accounts qualify as valid referrals immediately${json.qualified_pending_count ? ` (${json.qualified_pending_count} pending referrals qualified!)` : "."}`
        );
        load();
      } else {
        setError(json.error || "Failed to toggle email verification setting.");
      }
    } catch {
      setError("Network error while toggling email verification setting.");
    }
  }

  async function handleQualifyAllPending() {
    if (!confirm("Qualify all currently pending referrals and grant rewards right now?")) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "qualify_all_pending" }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`Qualified ${json.count || 0} pending referral(s) successfully!`);
        load();
      } else {
        setError(json.error || "Failed to qualify pending referrals.");
      }
    } catch {
      setError("Network error.");
    }
  }

  async function toggleRedemptionQuick(targetState) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_redemption", enabled: targetState }),
      });
      const json = await res.json();
      if (json.success) {
        setSettingsForm((prev) => ({ ...prev, redemption_enabled: targetState }));
        setSuccess(`Redemption master switch is now ${targetState ? "ACTIVE (Enabled)" : "DISABLED"}.`);
      } else {
        setError(json.error || "Failed to toggle redemption.");
      }
    } catch {
      setError("Network error while toggling redemption.");
    }
  }

  async function handleApproveReferral(refId) {
    if (!confirm("Approve this referral and qualify rewards?")) return;
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_referral", referral_id: refId }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess("Referral approved and reward issued!");
        load();
      } else {
        setError(json.error || "Failed to approve referral.");
      }
    } catch {
      setError("Network error.");
    }
  }

  async function handleRejectReferral(refId) {
    const reason = prompt("Enter reason for rejection:", "Fraudulent / multiple accounts");
    if (!reason) return;
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject_referral", referral_id: refId, reason }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess("Referral rejected.");
        load();
      }
    } catch {
      setError("Network error.");
    }
  }

  async function handleRevokeGift(giftId) {
    const reason = prompt("Reason for revoking this gift:", "Suspected self-referral / abuse");
    if (!reason) return;
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_gift", gift_id: giftId, reason }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess("Gift revoked successfully.");
        load();
      } else {
        setError(json.error || "Failed to revoke gift.");
      }
    } catch {
      setError("Network error.");
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-muted">Loading referral management…</div>;
  }

  const bannedIpsSet = new Set(
    (data.banned_entities || [])
      .filter((b) => b.type === "ip")
      .map((b) => (b.value || "").toLowerCase().trim())
  );
  const bannedDevicesSet = new Set(
    (data.banned_entities || [])
      .filter((b) => b.type === "device")
      .map((b) => (b.value || "").toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Master Switches */}
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
              <span>🎁</span> Referral Rewards & Gift Wallet Management
            </h2>
            <p className="text-xs text-muted mt-1">
              Configure referral rewards, review registrations, enforce anti-fraud, and toggle the master redemption switch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Email Verification Requirement Quick Toggle */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-1.5 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted">Email Verification</span>
                <span
                  className={`text-xs font-bold ${
                    settingsForm.require_email_verification
                      ? "text-brand"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {settingsForm.require_email_verification ? "MANDATORY (Only Verified)" : "OFF (All Accounts Valid)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleEmailVerificationQuick(!settingsForm.require_email_verification)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                  settingsForm.require_email_verification
                    ? "bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500 hover:text-white"
                    : "bg-brand text-white border border-brand hover:bg-brand/90"
                }`}
                title={
                  settingsForm.require_email_verification
                    ? "Click to turn OFF: any account from referral counts as valid immediately without email verification"
                    : "Click to turn ON: only users who verify their email qualify for referral rewards"
                }
              >
                {settingsForm.require_email_verification ? "Turn OFF (Allow All)" : "Turn ON (Require Email)"}
              </button>
            </div>

            {/* Gift Redemption Master Switch */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3 py-1.5 shadow-sm">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold text-muted">Gift Redemption</span>
                <span
                  className={`text-xs font-bold ${
                    settingsForm.redemption_enabled ? "text-success" : "text-danger"
                  }`}
                >
                  {settingsForm.redemption_enabled ? "ACTIVE (Enabled)" : "DISABLED"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleRedemptionQuick(!settingsForm.redemption_enabled)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                  settingsForm.redemption_enabled
                    ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white"
                    : "bg-success text-white border border-success hover:bg-success/90"
                }`}
              >
                {settingsForm.redemption_enabled ? "Turn OFF" : "Turn ON"}
              </button>
            </div>
          </div>
        </div>

        {/* Sub-tab pills */}
        <div className="mt-5 flex gap-2 border-b border-border pb-3">
          <button
            onClick={() => setActiveSubTab("referrals")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeSubTab === "referrals"
                ? "bg-brand text-white"
                : "bg-surface-alt text-muted hover:text-ink"
            }`}
          >
            Referral Registrations ({data.referrals?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("gifts")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeSubTab === "gifts"
                ? "bg-brand text-white"
                : "bg-surface-alt text-muted hover:text-ink"
            }`}
          >
            Issued Gifts ({data.gifts?.length || 0})
          </button>
          <button
            onClick={() => setActiveSubTab("settings")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              activeSubTab === "settings"
                ? "bg-brand text-white"
                : "bg-surface-alt text-muted hover:text-ink"
            }`}
          >
            Settings & Anti-Fraud
          </button>
          <button
            onClick={() => setActiveSubTab("banned")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeSubTab === "banned"
                ? "bg-danger text-white"
                : (data.banned_entities?.length || 0) > 0
                ? "bg-danger-soft text-danger hover:bg-danger hover:text-white border border-danger/30"
                : "bg-surface-alt text-muted hover:text-ink"
            }`}
          >
            <span>🚫 Banned IPs & Devices</span>
            {(data.banned_entities?.length || 0) > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeSubTab === "banned" ? "bg-white text-danger" : "bg-danger text-white"
                }`}
              >
                {data.banned_entities.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* SUB-TAB 1: Referrals List */}
      {activeSubTab === "referrals" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          {/* Flagged / Blocked Stats Alert Banner */}
          {data.flagged_stats?.total_flagged > 0 && (
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft p-3.5 text-xs text-danger font-medium">
              <div className="flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>
                  <strong>{data.flagged_stats.total_flagged}</strong> registration{data.flagged_stats.total_flagged > 1 ? "s" : ""} flagged from <strong>{data.flagged_stats.unique_devices_count}</strong> devices and <strong>{data.flagged_stats.unique_ips_count}</strong> IPs.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReferralFilter(referralFilter === "flagged" ? "all" : "flagged")}
                className="self-start sm:self-auto rounded-lg bg-danger text-white px-3 py-1 font-semibold hover:bg-danger/90 transition-colors shadow-sm cursor-pointer"
              >
                {referralFilter === "flagged" ? "Show All Referrals" : `View Flagged Only (${data.flagged_stats.total_flagged})`}
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-ink">All Referral Registrations</h3>
              <p className="text-[11px] text-muted">
                {settingsForm.require_email_verification
                  ? "Email verification is currently REQUIRED (only verified emails qualify)."
                  : "Email verification is currently OFF (all registered accounts qualify immediately)."}
              </p>
            </div>
            {data.referrals.some((r) => r.status === "pending_verification") && (
              <button
                type="button"
                onClick={handleQualifyAllPending}
                className="rounded-lg bg-brand-soft text-brand border border-brand/20 px-3 py-1.5 text-xs font-semibold hover:bg-brand hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
              >
                ⚡ Qualify All Pending ({data.referrals.filter((r) => r.status === "pending_verification").length})
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              { id: "all", label: `All (${data.referrals.length})` },
              { id: "qualified", label: `✓ Qualified (${data.referrals.filter((r) => r.status === "qualified" || r.status === "qualified_cap_reached").length})` },
              { id: "pending", label: `⏳ Pending Email (${data.referrals.filter((r) => r.status === "pending_verification").length})` },
              { id: "flagged", label: `⚠️ Flagged / Blocked (${data.referrals.filter((r) => r.status === "flagged_suspicious").length})`, isFlagged: true },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setReferralFilter(f.id)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  referralFilter === f.id
                    ? f.isFlagged
                      ? "bg-danger text-white shadow-sm"
                      : "bg-brand text-white shadow-sm"
                    : f.isFlagged && data.referrals.some((r) => r.status === "flagged_suspicious")
                    ? "bg-danger-soft text-danger border border-danger/30 hover:bg-danger hover:text-white"
                    : "bg-surface-alt text-muted hover:text-ink border border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {data.referrals.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">No referrals recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="pb-2.5 text-start font-semibold">Referred User</th>
                    <th className="pb-2.5 text-start font-semibold">Invited By</th>
                    <th className="pb-2.5 text-start font-semibold">Status</th>
                    <th className="pb-2.5 text-start font-semibold">Device & IP</th>
                    <th className="pb-2.5 text-start font-semibold">Date</th>
                    <th className="pb-2.5 text-end font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.referrals
                    .filter((r) => {
                      if (referralFilter === "qualified") return r.status === "qualified" || r.status === "qualified_cap_reached";
                      if (referralFilter === "pending") return r.status === "pending_verification";
                      if (referralFilter === "flagged") return r.status === "flagged_suspicious";
                      return true;
                    })
                    .map((r) => (
                    <tr key={r.id} className="text-ink">
                      <td className="py-3">
                        <div className="font-semibold">@{r.referred_name}</div>
                        <div className="text-[11px] text-muted">{r.referred_email}</div>
                      </td>
                      <td className="py-3">
                        <span className="font-medium text-brand">@{r.referrer_name}</span>
                      </td>
                      <td className="py-3">
                        {r.status === "qualified" ? (
                          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
                            ✓ Qualified (+1 Gift)
                          </span>
                        ) : r.status === "qualified_cap_reached" ? (
                          <span className="rounded-full bg-border px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Cap Reached (15)
                          </span>
                        ) : r.status === "pending_verification" ? (
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
                            ⏳ Pending Email
                          </span>
                        ) : r.status === "flagged_suspicious" ? (
                          <div>
                            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                              ⚠️ Flagged
                            </span>
                            <div className="text-[10px] text-danger mt-0.5">{r.suspicious_reason}</div>
                          </div>
                        ) : (
                          <span className="rounded-full bg-border px-2 py-0.5 text-[11px] font-semibold text-muted">
                            {r.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-[11px] text-muted font-mono">
                        {/* IP row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>IP: {r.registration_ip || "—"}</span>
                          {r.registration_ip && (
                            <>
                              {bannedIpsSet.has((r.registration_ip || "").toLowerCase().trim()) ? (
                                <>
                                  <span className="rounded bg-danger/10 text-danger border border-danger/30 px-1.5 py-0.2 text-[9px] font-bold font-sans">
                                    BANNED
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUnbanEntity("ip", r.registration_ip)}
                                    className="text-[10px] text-success hover:underline cursor-pointer font-sans font-semibold"
                                  >
                                    Unban
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleWhitelistIp(r.registration_ip)}
                                    className="text-[10px] text-brand hover:underline cursor-pointer font-sans font-semibold"
                                    title="Add this IP to Admin Whitelist"
                                  >
                                    + Whitelist
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickBan("ip", r.registration_ip)}
                                    className="text-[10px] text-danger hover:underline cursor-pointer font-sans font-semibold"
                                    title="Block this IP address"
                                  >
                                    🚫 Ban
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>

                        {/* Device row */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="truncate max-w-[120px]">Dev: {r.device_id || "—"}</span>
                          {r.device_id && (
                            <>
                              {bannedDevicesSet.has((r.device_id || "").toLowerCase().trim()) ? (
                                <>
                                  <span className="rounded bg-danger/10 text-danger border border-danger/30 px-1.5 py-0.2 text-[9px] font-bold font-sans">
                                    BANNED
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUnbanEntity("device", r.device_id)}
                                    className="text-[10px] text-success hover:underline cursor-pointer font-sans font-semibold"
                                  >
                                    Unban
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleQuickBan("device", r.device_id)}
                                  className="text-[10px] text-danger hover:underline cursor-pointer font-sans font-semibold"
                                  title="Block this mobile/device"
                                >
                                  🚫 Ban
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-muted">
                        {new Date(r.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3 text-end">
                        {r.status === "pending_verification" && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleApproveReferral(r.id)}
                              className="rounded px-2.5 py-1 text-[11px] font-bold bg-brand text-white hover:bg-brand/90 transition-colors cursor-pointer"
                              title="Manually qualify this referral without waiting for email verification"
                            >
                              Qualify
                            </button>
                          </div>
                        )}
                        {r.status === "flagged_suspicious" && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleApproveReferral(r.id)}
                              className="rounded px-2 py-1 text-[11px] font-bold bg-success text-white hover:bg-success/90"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectReferral(r.id)}
                              className="rounded px-2 py-1 text-[11px] font-bold bg-danger text-white hover:bg-danger/90"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: Issued Gifts List */}
      {activeSubTab === "gifts" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="text-sm font-bold text-ink mb-3">All Issued Gift Boxes</h3>
          {data.gifts.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">No gifts issued yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="pb-2.5 text-start font-semibold">Owner (Inviter)</th>
                    <th className="pb-2.5 text-start font-semibold">Referred User</th>
                    <th className="pb-2.5 text-start font-semibold">Value</th>
                    <th className="pb-2.5 text-start font-semibold">Status</th>
                    <th className="pb-2.5 text-start font-semibold">Created / Unlock</th>
                    <th className="pb-2.5 text-end font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.gifts.map((g) => (
                    <tr key={g.id} className="text-ink">
                      <td className="py-3">
                        <div className="font-semibold">@{g.owner_name}</div>
                        <div className="text-[11px] text-muted">{g.owner_email}</div>
                      </td>
                      <td className="py-3 font-medium">@{g.referred_name}</td>
                      <td className="py-3 font-mono font-bold text-brand">1B Tokens</td>
                      <td className="py-3">
                        {g.status === "available" ? (
                          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
                            Available
                          </span>
                        ) : g.status === "locked" ? (
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">
                            Locked (30s)
                          </span>
                        ) : g.status === "redeemed" ? (
                          <span className="rounded-full bg-border px-2 py-0.5 text-[11px] font-semibold text-muted">
                            Redeemed
                          </span>
                        ) : (
                          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                            {g.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-[11px] text-muted">
                        <div>Created: {new Date(g.created_at).toLocaleTimeString()}</div>
                        <div>Unlock: {new Date(g.available_at).toLocaleTimeString()}</div>
                      </td>
                      <td className="py-3 text-end">
                        {g.status !== "redeemed" && g.status !== "revoked" && (
                          <button
                            onClick={() => handleRevokeGift(g.id)}
                            className="rounded px-2.5 py-1 text-[11px] font-bold text-danger border border-danger/30 hover:bg-danger-soft"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: Settings Form */}
      {activeSubTab === "settings" && (
        <form onSubmit={saveSettings} className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card space-y-5">
          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-ink">Master Switches</h3>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex items-start gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={settingsForm.referral_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, referral_enabled: e.target.checked })}
                  className="h-4 w-4 mt-0.5 rounded text-brand focus:ring-brand"
                />
                <div>
                  <div className="text-xs font-bold text-ink">Enable Referral Program</div>
                  <div className="text-[11px] text-muted mt-0.5">When off, new signups do not track referrals or award gifts.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={settingsForm.require_email_verification}
                  onChange={(e) => setSettingsForm({ ...settingsForm, require_email_verification: e.target.checked })}
                  className="h-4 w-4 mt-0.5 rounded text-brand focus:ring-brand"
                />
                <div>
                  <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <span>Require Email Verification</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                        settingsForm.require_email_verification
                          ? "bg-brand/10 text-brand"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {settingsForm.require_email_verification ? "ON (Strict)" : "OFF (All Valid)"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {settingsForm.require_email_verification
                      ? "Only users who click the email verification link give rewards to inviter."
                      : "Bhale email verify na kare, har account referral me valid count ho aur reward mile."}
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={settingsForm.redemption_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, redemption_enabled: e.target.checked })}
                  className="h-4 w-4 mt-0.5 rounded text-brand focus:ring-brand"
                />
                <div>
                  <div className="text-xs font-bold text-ink">Enable Gift Redemption</div>
                  <div className="text-[11px] text-muted mt-0.5">Master Switch: When OFF, checkout blocks all gift redemptions.</div>
                </div>
              </label>
            </div>
          </div>

          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-ink mb-3">Limits & Timing</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormInput
                label="Max Lifetime Gifts per User"
                type="number"
                min={1}
                value={settingsForm.max_lifetime_gifts}
                onChange={(e) => setSettingsForm({ ...settingsForm, max_lifetime_gifts: parseInt(e.target.value, 10) || 15 })}
                hint="Default is 15 gifts per user."
              />
              <FormInput
                label="Daily Redemption Limit"
                type="number"
                min={1}
                value={settingsForm.daily_redemption_limit}
                onChange={(e) => setSettingsForm({ ...settingsForm, daily_redemption_limit: parseInt(e.target.value, 10) || 3 })}
                hint="Max gifts redeemable per user per day (default 3)."
              />
              <FormInput
                label="Reward Lock Delay (Seconds)"
                type="number"
                min={5}
                value={settingsForm.lock_delay_seconds}
                onChange={(e) => setSettingsForm({ ...settingsForm, lock_delay_seconds: parseInt(e.target.value, 10) || 30 })}
                hint="Mandatory countdown lock (default 30s)."
              />
            </div>
          </div>

          <div className="border-b border-border pb-4">
            <h3 className="text-base font-bold text-ink mb-3">Supplier Cost per 1B Tokens</h3>
            <div className="max-w-xs">
              <FormInput
                label="Supplier Cost ($ USD per 1B tokens)"
                type="number"
                step="0.001"
                min="0.001"
                value={settingsForm.supplier_cost_per_gift}
                onChange={(e) => setSettingsForm({ ...settingsForm, supplier_cost_per_gift: parseFloat(e.target.value) || 0.06 })}
                hint="Actual supplier cost (e.g. $0.06). Used for analytics & liability."
              />
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold text-ink mb-3">Anti-Fraud Thresholds</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormInput
                label="Max Accounts per Device ID"
                type="number"
                min={1}
                value={settingsForm.fraud_max_accounts_per_device}
                onChange={(e) => setSettingsForm({ ...settingsForm, fraud_max_accounts_per_device: parseInt(e.target.value, 10) || 2 })}
                hint="Flags registrations as suspicious above this count."
              />
              <FormInput
                label="Max Accounts per IP Address"
                type="number"
                min={1}
                value={settingsForm.fraud_max_accounts_per_ip}
                onChange={(e) => setSettingsForm({ ...settingsForm, fraud_max_accounts_per_ip: parseInt(e.target.value, 10) || 3 })}
                hint="Accounts sharing public IP before flagging."
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-base font-bold text-ink mb-1">🛡️ Admin Whitelist & Bypass (For Testing)</h3>
            <p className="text-xs text-muted mb-4 leading-relaxed">
              Yahan aap apna IP address aur device whitelist kar sakte hain. Whitelisted IP aur device par koi bhi multiple account limit, IP cap, ya self-referral restriction nahi lagegi taake aap aasaani se testing kar sakein.
            </p>

            <div className="rounded-xl border border-brand/20 bg-brand-soft/30 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-ink flex items-center gap-2">
                    <span>🌐 Your Current Detected IP:</span>
                    <span className="font-mono text-brand bg-brand-soft px-2 py-0.5 rounded text-xs">
                      {data.current_admin_ip || "Loading…"}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Click the button to automatically add your current IP to the whitelist.
                  </div>
                </div>
                {data.current_admin_ip && (
                  <button
                    type="button"
                    onClick={() => handleWhitelistIp(data.current_admin_ip)}
                    className="rounded-lg bg-brand text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-brand/90 transition-all shadow-sm whitespace-nowrap self-start sm:self-auto cursor-pointer"
                  >
                    + Whitelist My Current IP ({data.current_admin_ip})
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Whitelisted IP Addresses (comma or space separated)
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                  placeholder="e.g. 182.185.10.20, 110.39.40.50"
                  value={whitelistIps}
                  onChange={(e) => setWhitelistIps(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  In IPs se aane wale registrations par koi restriction nahi hogi.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Whitelisted Device IDs (comma or space separated)
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                  placeholder="e.g. dev_a1b2c3d4e5..."
                  value={whitelistDevices}
                  onChange={(e) => setWhitelistDevices(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted">
                  In devices se aane wale signups par multiple account block nahi hoga.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <PrimaryButton disabled={saving} className="px-6">
              {saving ? "Saving…" : "Save Referral Settings"}
            </PrimaryButton>
          </div>
        </form>
      )}

      {/* SUB-TAB 4: Banned Devices & IPs */}
      {activeSubTab === "banned" && (
        <div className="space-y-6">
          {/* Header & Fresh Start banner */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  <span>🚫</span> Banned Devices & IP Addresses
                  <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-bold text-danger">
                    {data.banned_entities?.length || 0} Blocked
                  </span>
                </h3>
                <p className="text-xs text-muted mt-1 max-w-2xl leading-relaxed">
                  Yahan wo sabhi mobile devices aur IP addresses list honge jo multiple accounts limit ya anti-fraud rule cross karne par block hue hain. Aap yahan se kisi bhi device ya IP ko <strong>1-click me Unban</strong> kar sakte hain, ya manually nayi IP/device ko <strong>Ban</strong> kar sakte hain.
                </p>
                {data.banned_system_started_at && (
                  <div className="text-[11px] text-brand mt-2 font-medium flex items-center gap-1.5">
                    <span>⚡ Fresh Start Active:</span>
                    <span>Tracking active since {new Date(data.banned_system_started_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={clearingPast}
                  onClick={handleClearAllPastBans}
                  className="rounded-xl border border-danger/30 bg-danger/10 hover:bg-danger hover:text-white text-danger px-4 py-2.5 text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50"
                  title="Purge all previous test bans and flagged records so tracking starts completely fresh from now"
                >
                  <span>⚡</span>
                  <span>{clearingPast ? "Clearing Past Bans…" : "Clear All Past Test Bans (Fresh Start)"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Manual Ban Form Card */}
          <form
            onSubmit={handleBanEntity}
            className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card"
          >
            <h4 className="text-sm font-bold text-ink flex items-center gap-2 mb-3">
              <span>➕</span> Ban New IP Address or Mobile Device Manually
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-ink mb-1">Entity Type</label>
                <select
                  value={banForm.type}
                  onChange={(e) => setBanForm({ ...banForm, type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink focus:border-brand focus:outline-none"
                >
                  <option value="ip">🌐 IP Address</option>
                  <option value="device">📱 Device ID (Mobile / Browser)</option>
                </select>
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-ink mb-1">
                  {banForm.type === "ip" ? "IP Address" : "Device Identifier"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={banForm.type === "ip" ? "e.g. 182.185.10.20" : "e.g. dev_a1b2c3d4e5..."}
                  value={banForm.value}
                  onChange={(e) => setBanForm({ ...banForm, value: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-ink mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Multiple accounts / fake test"
                  value={banForm.reason}
                  onChange={(e) => setBanForm({ ...banForm, reason: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={banSubmitting}
                  className="w-full rounded-lg bg-danger text-white px-4 py-2 text-xs font-bold hover:bg-danger/90 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {banSubmitting ? "Banning…" : "🚫 Ban Now"}
                </button>
              </div>
            </div>
          </form>

          {/* Table of Banned Entities */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-sm font-bold text-ink">Currently Blocked Entities</h4>
                <p className="text-[11px] text-muted">
                  These devices and IP addresses are completely blocked from registering new accounts.
                </p>
              </div>

              {/* Filter pills */}
              <div className="flex gap-2">
                {[
                  { id: "all", label: `All (${data.banned_entities?.length || 0})` },
                  { id: "ip", label: `🌐 IPs (${(data.banned_entities || []).filter((b) => b.type === "ip").length})` },
                  { id: "device", label: `📱 Devices (${(data.banned_entities || []).filter((b) => b.type === "device").length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setBannedFilter(f.id)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                      bannedFilter === f.id
                        ? "bg-brand text-white shadow-sm"
                        : "bg-surface-alt text-muted hover:text-ink border border-border"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {(!data.banned_entities || data.banned_entities.length === 0) ? (
              <div className="py-12 text-center">
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-sm font-bold text-ink">No Banned IPs or Devices!</div>
                <div className="text-xs text-muted max-w-sm mx-auto mt-1">
                  Your system is clean. No IP or device is currently blocked. If any suspicious activity or multi-accounting occurs, it will automatically show here.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted">
                      <th className="pb-2.5 text-start font-semibold">Type</th>
                      <th className="pb-2.5 text-start font-semibold">Value (IP / Device ID)</th>
                      <th className="pb-2.5 text-start font-semibold">Reason</th>
                      <th className="pb-2.5 text-start font-semibold">Associated Accounts</th>
                      <th className="pb-2.5 text-start font-semibold">Banned Date</th>
                      <th className="pb-2.5 text-end font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.banned_entities
                      .filter((b) => {
                        if (bannedFilter === "ip") return b.type === "ip";
                        if (bannedFilter === "device") return b.type === "device";
                        return true;
                      })
                      .map((b) => (
                        <tr key={b.id || `${b.type}_${b.value}`} className="text-ink">
                          <td className="py-3">
                            {b.type === "ip" ? (
                              <span className="rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 px-2 py-0.5 text-[11px] font-bold">
                                🌐 IP Address
                              </span>
                            ) : (
                              <span className="rounded-full bg-purple-500/10 text-purple-600 border border-purple-500/20 px-2 py-0.5 text-[11px] font-bold">
                                📱 Device ID
                              </span>
                            )}
                          </td>
                          <td className="py-3 font-mono font-bold text-ink">
                            <div className="flex items-center gap-1.5">
                              <span>{b.value}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                                    navigator.clipboard.writeText(b.value);
                                    setSuccess(`Copied "${b.value}" to clipboard!`);
                                  }
                                }}
                                className="text-[10px] text-muted hover:text-brand cursor-pointer font-sans"
                                title="Copy to clipboard"
                              >
                                📋
                              </button>
                            </div>
                          </td>
                          <td className="py-3 text-muted">
                            <span className="text-danger font-medium">{b.reason || "Policy violation / multi-accounts"}</span>
                          </td>
                          <td className="py-3">
                            {b.accounts && b.accounts.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {b.accounts.map((acc, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold text-ink border border-border"
                                  >
                                    {acc}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 text-muted text-[11px]">
                            {b.banned_at
                              ? new Date(b.banned_at).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="py-3 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {b.type === "ip" && (
                                <button
                                  type="button"
                                  onClick={() => handleWhitelistIp(b.value)}
                                  className="rounded px-2.5 py-1 text-[11px] font-semibold bg-brand-soft text-brand hover:bg-brand hover:text-white transition-colors cursor-pointer"
                                  title="Add this IP to Whitelist so it is permanently exempt"
                                >
                                  + Whitelist
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleUnbanEntity(b.type, b.value)}
                                className="rounded px-2.5 py-1 text-[11px] font-bold bg-success text-white hover:bg-success/90 transition-colors shadow-sm cursor-pointer"
                                title="Unban this entity and allow account creation"
                              >
                                ✓ Unban (Allow)
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

