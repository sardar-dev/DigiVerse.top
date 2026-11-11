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
    max_lifetime_gifts: 15,
    daily_redemption_limit: 3,
    lock_delay_seconds: 30,
    supplier_cost_per_gift: 0.06,
    fraud_max_accounts_per_ip: 3,
    fraud_max_accounts_per_device: 2,
  });

  const [activeSubTab, setActiveSubTab] = useState("referrals"); // referrals | gifts | settings

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
        if (json.settings && Object.keys(json.settings).length > 0) {
          setSettingsForm({
            referral_enabled: json.settings.referral_enabled !== undefined ? Boolean(json.settings.referral_enabled) : true,
            redemption_enabled: json.settings.redemption_enabled !== undefined ? Boolean(json.settings.redemption_enabled) : true,
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
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      const json = await res.json();
      if (json.success) {
        setSuccess("Referral settings updated successfully!");
        if (json.settings) {
          setSettingsForm((prev) => ({
            ...prev,
            referral_enabled: json.settings.referral_enabled !== undefined ? Boolean(json.settings.referral_enabled) : prev.referral_enabled,
            redemption_enabled: json.settings.redemption_enabled !== undefined ? Boolean(json.settings.redemption_enabled) : prev.redemption_enabled,
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

          <div className="flex items-center gap-2.5">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                settingsForm.redemption_enabled
                  ? "bg-success-soft text-success border border-success/30"
                  : "bg-danger-soft text-danger border border-danger/30"
              }`}
            >
              {settingsForm.redemption_enabled ? "Redemption: ACTIVE" : "Redemption: DISABLED"}
            </span>

            <button
              type="button"
              onClick={() => toggleRedemptionQuick(!settingsForm.redemption_enabled)}
              className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                settingsForm.redemption_enabled
                  ? "bg-danger/10 text-danger border border-danger/30 hover:bg-danger hover:text-white"
                  : "bg-success text-white border border-success hover:bg-success/90"
              }`}
            >
              {settingsForm.redemption_enabled ? "Turn OFF" : "Turn ON (Enable)"}
            </button>
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
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {/* SUB-TAB 1: Referrals List */}
      {activeSubTab === "referrals" && (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <h3 className="text-sm font-bold text-ink mb-3">All Referral Registrations</h3>
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
                  {data.referrals.map((r) => (
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
                        <div>IP: {r.registration_ip || "—"}</div>
                        <div className="truncate max-w-[140px]">Dev: {r.device_id || "—"}</div>
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
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={settingsForm.referral_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, referral_enabled: e.target.checked })}
                  className="h-4 w-4 rounded text-brand focus:ring-brand"
                />
                <div>
                  <div className="text-xs font-bold text-ink">Enable Referral Program</div>
                  <div className="text-[11px] text-muted">When off, new signups do not track referrals or award gifts.</div>
                </div>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-border p-3.5 cursor-pointer hover:bg-surface-alt">
                <input
                  type="checkbox"
                  checked={settingsForm.redemption_enabled}
                  onChange={(e) => setSettingsForm({ ...settingsForm, redemption_enabled: e.target.checked })}
                  className="h-4 w-4 rounded text-brand focus:ring-brand"
                />
                <div>
                  <div className="text-xs font-bold text-ink">Enable Free Muse AI Gift Redemption</div>
                  <div className="text-[11px] text-muted">Master Switch: When OFF, checkout blocks all gift redemptions.</div>
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

          <div className="flex justify-end pt-3">
            <PrimaryButton disabled={saving} className="px-6">
              {saving ? "Saving…" : "Save Referral Settings"}
            </PrimaryButton>
          </div>
        </form>
      )}
    </div>
  );
}

