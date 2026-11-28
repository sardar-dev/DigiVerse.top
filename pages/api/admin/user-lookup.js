import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { supplierLabels } from "../../../lib/suppliers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROFILE_COLS =
  "id, email, username, balance, is_admin, referred_by, registration_ip, device_id, created_at";
const PROFILE_FALLBACK_COLS = "id, email, balance, created_at";

async function findProfile(rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  const handle = q.replace(/^@+/, "");

  const runSelect = async (cols, build) => {
    const res = await build(supabaseAdmin.from("profiles").select(cols));
    if (res.error && /username|referred_by|registration_ip|device_id|is_admin/i.test(res.error.message)) {
      return build(supabaseAdmin.from("profiles").select(PROFILE_FALLBACK_COLS));
    }
    return res;
  };

  // 1. Direct UUID lookup
  if (UUID_RE.test(q)) {
    const { data } = await runSelect(PROFILE_COLS, (qb) => qb.eq("id", q).maybeSingle());
    if (data) return { profile: data };
  }

  // 2. Exact email match
  const { data: exactEmail } = await runSelect(PROFILE_COLS, (qb) => qb.ilike("email", q).maybeSingle());
  if (exactEmail) return { profile: exactEmail };

  // 3. Exact username match (with or without leading @)
  if (!q.includes("@") || q.startsWith("@")) {
    const { data: exactUser, error: userErr } = await supabaseAdmin
      .from("profiles")
      .select(PROFILE_COLS)
      .ilike("username", handle)
      .maybeSingle();
    if (!userErr && exactUser) return { profile: exactUser };
  }

  // 4. Partial match across email & username
  const esc = handle.replace(/[%_]/g, "");
  let { data: like, error: likeErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, username, balance, created_at")
    .or(`email.ilike.%${esc}%,username.ilike.%${esc}%`)
    .limit(8);

  if (likeErr) {
    ({ data: like } = await supabaseAdmin
      .from("profiles")
      .select("id, email, balance, created_at")
      .ilike("email", `%${esc}%`)
      .limit(8));
  }

  if (like?.length === 1) {
    const { data: full } = await runSelect(PROFILE_COLS, (qb) => qb.eq("id", like[0].id).maybeSingle());
    return { profile: full || like[0] };
  }
  if (like?.length > 1) {
    return {
      matches: like.map((u) => ({
        email: u.email || (u.username ? `@${u.username}` : u.id),
        username: u.username || null,
        label: u.username && u.email ? `${u.email} (@${u.username})` : u.email || `@${u.username}`,
      })),
    };
  }

  // 5. Fallback search in auth.users in case profile record wasn't synced yet
  try {
    const { data: listRes } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const users = (listRes?.users || []).filter(
      (u) =>
        (u.email && u.email.toLowerCase().includes(esc)) ||
        String(u.user_metadata?.username || "").toLowerCase().includes(esc)
    );
    if (users.length === 1) {
      const au = users[0];
      return {
        profile: {
          id: au.id,
          email: au.email,
          username: au.user_metadata?.username || null,
          balance: 0,
          created_at: au.created_at,
        },
        authUserPrefetched: au,
      };
    }
    if (users.length > 1) {
      return {
        matches: users.slice(0, 8).map((u) => ({
          email: u.email,
          username: u.user_metadata?.username || null,
          label: u.email,
        })),
      };
    }
  } catch {}

  return { profile: null };
}

// GET ?email= — Comprehensive 360-degree customer lookup for admin support.
// Runs on demand when Search is clicked; all sub-queries run concurrently and fail-safe.
export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;
  const rawQ = String(req.query.email || "").trim();
  if (rawQ.replace(/^@+/, "").length < 3) {
    return res.status(400).json({ success: false, error: "email_too_short" });
  }

  const lookup = await findProfile(rawQ);
  if (lookup.matches) {
    return res.status(200).json({ success: true, found: false, matches: lookup.matches });
  }
  if (!lookup.profile) {
    return res.status(200).json({ success: true, found: false });
  }

  const profile = lookup.profile;
  const uid = profile.id;
  const safeEmail = profile.email ? profile.email.replace(/[,()]/g, "") : "";

  const ordersQuery = async () => {
    const fullCols =
      "id, user_id, order_number, quantity, unit_price, unit_cost, total, expected_amount, status, paid_with, tx_hash, email, activation_info, items, failure_reason, supplier, supplier_order_id, digitrust_order_id, coupon_code, discount_amount, gifts_redeemed, gift_discount, created_at, products(title)";
    const baseCols =
      "id, user_id, order_number, quantity, unit_price, total, status, paid_with, tx_hash, email, activation_info, items, failure_reason, coupon_code, discount_amount, created_at, products(title)";

    const run = (cols) => {
      const qb = supabaseAdmin.from("orders").select(cols);
      return safeEmail
        ? qb.or(`user_id.eq.${uid},and(user_id.is.null,email.ilike.${safeEmail})`)
        : qb.eq("user_id", uid);
    };

    let r = await run(fullCols).order("created_at", { ascending: false }).limit(50);
    if (r.error) {
      r = await run(baseCols).order("created_at", { ascending: false }).limit(50);
    }
    return r;
  };

  const [
    authRes,
    ordersRes,
    topupsRes,
    invoicesRes,
    adjustmentsRes,
    withdrawalsRes,
    referralsSentRes,
    referralReceivedRes,
    giftsRes,
    redemptionsRes,
    ticketsRes,
    messagesRes,
    feedbackRes,
    supLabelsRes,
  ] = await Promise.allSettled([
    lookup.authUserPrefetched
      ? Promise.resolve({ data: { user: lookup.authUserPrefetched } })
      : supabaseAdmin.auth.admin.getUserById(uid),
    ordersQuery(),
    supabaseAdmin
      .from("wallet_topups")
      .select("id, amount, tx_hash, status, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("wallet_deposit_invoices")
      .select("id, requested_amount, unique_amount, status, tx_hash, expires_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("wallet_adjustments")
      .select("id, amount, reason, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("withdrawal_requests")
      .select("id, request_number, amount, address, network, method, status, payout_tx, admin_note, created_at, resolved_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("referrals")
      .select("id, referred_id, status, device_id, registration_ip, suspicious_reason, reward_issued, verified_at, created_at")
      .eq("referrer_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("referrals")
      .select("referrer_id, referrer_username, status, device_id, registration_ip, suspicious_reason, verified_at, created_at")
      .eq("referred_id", uid)
      .maybeSingle(),
    supabaseAdmin
      .from("referral_gifts")
      .select("id, reward_type, reward_quantity, status, created_at, available_at, redeemed_at, order_id, revoked_at, revoked_reason")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("referral_gift_redemptions")
      .select("id, order_id, tokens_redeemed, supplier_cost_snapshot, status, created_at, fulfilled_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("support_tickets")
      .select("id, ticket_number, name, order_number, status, created_at, updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(25),
    supabaseAdmin
      .from("admin_messages")
      .select("id, subject, body, reply_body, reply_at, read_at, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(25),
    safeEmail
      ? supabaseAdmin
          .from("feedback")
          .select("id, message, read, created_at")
          .ilike("email", safeEmail)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    supplierLabels().catch(() => ({})),
  ]);

  const val = (settled) => (settled.status === "fulfilled" ? settled.value?.data : null);
  const authUser = authRes.status === "fulfilled" ? authRes.value?.data?.user || null : null;
  const sup = supLabelsRes.status === "fulfilled" ? supLabelsRes.value || {} : {};
  const good = (rows) => (Array.isArray(rows) ? rows.filter(Boolean) : []);

  const ords = good(val(ordersRes)).map((o) => ({
    ...o,
    is_guest: !o.user_id,
    supplier_label: o.supplier ? sup[o.supplier]?.label || o.supplier : null,
  }));
  const allTopups = good(val(topupsRes));
  const creditedTopups = allTopups.filter((t) => t.status === "credited");
  const invoices = good(val(invoicesRes));
  const pendingInvoices = invoices.filter((i) => i.status === "pending");
  const adjustments = good(val(adjustmentsRes));
  const withdrawals = good(val(withdrawalsRes));
  const referralsSentRaw = good(val(referralsSentRes));
  const referralReceived = val(referralReceivedRes) || null;
  const gifts = good(val(giftsRes));
  const redemptions = good(val(redemptionsRes));
  const tickets = good(val(ticketsRes));
  const messages = good(val(messagesRes));
  const feedback = good(val(feedbackRes));

  // Secondary parallel enrichment: inviter profile, referred user profiles, security bans & linked accounts
  const inviterId = profile.referred_by || referralReceived?.referrer_id || null;
  const referredIds = [...new Set(referralsSentRaw.map((r) => r.referred_id).filter(Boolean))];
  const regIp = profile.registration_ip || referralReceived?.registration_ip || authUser?.user_metadata?.registration_ip || null;
  const devId = profile.device_id || referralReceived?.device_id || authUser?.user_metadata?.device_id || null;

  const secOrParts = [];
  if (devId) secOrParts.push(`device_id.eq.${devId.replace(/[,()]/g, "")}`);
  if (regIp) secOrParts.push(`registration_ip.eq.${regIp.replace(/[,()]/g, "")}`);

  const [inviterRes, referredProfilesRes, bansRes, linkedRes] = await Promise.allSettled([
    inviterId
      ? supabaseAdmin.from("profiles").select("id, email, username").eq("id", inviterId).maybeSingle()
      : Promise.resolve({ data: null }),
    referredIds.length
      ? supabaseAdmin.from("profiles").select("id, email, username").in("id", referredIds)
      : Promise.resolve({ data: [] }),
    regIp || devId
      ? supabaseAdmin
          .from("banned_entities")
          .select("type, value, reason, banned_by, created_at")
          .in("value", [regIp, devId].filter(Boolean))
      : Promise.resolve({ data: [] }),
    secOrParts.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, email, username, device_id, registration_ip, created_at")
          .neq("id", uid)
          .or(secOrParts.join(","))
          .limit(15)
      : Promise.resolve({ data: [] }),
  ]);

  const inviterProfile = val(inviterRes) || (referralReceived?.referrer_username ? { username: referralReceived.referrer_username } : null);
  const refProfMap = new Map(good(val(referredProfilesRes)).map((p) => [p.id, p]));
  const referrals = referralsSentRaw.map((r) => ({
    ...r,
    referred_email: refProfMap.get(r.referred_id)?.email || null,
    referred_username: refProfMap.get(r.referred_id)?.username || null,
  }));
  const bans = good(val(bansRes));
  const linkedAccounts = good(val(linkedRes));

  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const PAID_STATUSES = new Set([
    "paid",
    "fulfilling",
    "delivered",
    "completed",
    "awaiting_manual_fulfillment",
  ]);
  const paidOrders = ords.filter((o) => PAID_STATUSES.has(o.status));
  const netProfit = paidOrders.reduce((acc, o) => {
    if (o.unit_cost == null) return acc;
    return acc + (Number(o.total || 0) - Number(o.unit_cost) * Number(o.quantity || 1));
  }, 0);

  const nowMs = Date.now();
  const availGifts = gifts.filter(
    (g) => g.status === "available" || (g.status === "locked" && new Date(g.available_at).getTime() <= nowMs)
  );
  const lockedGifts = gifts.filter(
    (g) => g.status === "locked" && new Date(g.available_at).getTime() > nowMs
  );

  const authProvider =
    authUser?.app_metadata?.provider ||
    authUser?.identities?.[0]?.provider ||
    "email";

  return res.status(200).json({
    success: true,
    found: true,
    user: {
      id: uid,
      email: profile.email || authUser?.email || null,
      username: profile.username || authUser?.user_metadata?.username || null,
      balance: Number(profile.balance || 0),
      is_admin: Boolean(profile.is_admin),
      joined: profile.created_at || authUser?.created_at || null,
      last_sign_in: authUser?.last_sign_in_at || null,
      email_confirmed: Boolean(authUser?.email_confirmed_at),
      email_confirmed_at: authUser?.email_confirmed_at || null,
      provider: authProvider,
      banned_until: authUser?.banned_until || null,
      registration_ip: regIp,
      device_id: devId,
      inviter: inviterProfile,
      referral_status: referralReceived?.status || null,
    },
    totals: {
      deposited: Number(sum(creditedTopups, (t) => t.amount).toFixed(2)),
      deposit_count: creditedTopups.length,
      spent: Number(sum(paidOrders, (o) => o.total).toFixed(2)),
      paid_orders: paidOrders.length,
      refunded: Number(sum(ords.filter((o) => o.status === "refunded"), (o) => o.total).toFixed(2)),
      net_profit: Number(netProfit.toFixed(2)),
      orders: ords.length,
      guest_orders: ords.filter((o) => o.is_guest).length,
      withdrawn_approved: Number(
        sum(withdrawals.filter((w) => w.status === "approved"), (w) => w.amount).toFixed(2)
      ),
      withdraw_pending: Number(
        sum(withdrawals.filter((w) => w.status === "pending"), (w) => w.amount).toFixed(2)
      ),
      referrals_total: referrals.length,
      referrals_qualified: referrals.filter((r) => r.status === "qualified").length,
      gifts_available: availGifts.length,
      gifts_locked: lockedGifts.length,
      gifts_redeemed: gifts.filter((g) => g.status === "redeemed").length,
      gifts_revoked: gifts.filter((g) => g.status === "revoked").length,
      tokens_redeemed: sum(
        redemptions.filter((r) => r.status === "fulfilled"),
        (r) => r.tokens_redeemed
      ),
      open_tickets: tickets.filter((t) => t.status === "open").length,
      tickets_total: tickets.length,
    },
    orders: ords,
    deposits: allTopups,
    invoices,
    pendingInvoices,
    adjustments,
    withdrawals,
    referrals,
    gifts,
    redemptions,
    tickets,
    messages,
    feedback,
    security: {
      bans,
      linkedAccounts,
      isIpBanned: bans.some((b) => b.type === "ip"),
      isDeviceBanned: bans.some((b) => b.type === "device"),
    },
  });
}
