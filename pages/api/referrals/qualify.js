import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const supabaseServer = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  if (!session) {
    return res.status(401).json({ success: false, error: "login_required" });
  }

  const userId = session.user.id;

  // Verify email status directly from auth.users (never trust client)
  const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return res.status(404).json({ success: false, error: "user_not_found" });
  }

  if (!authUser.user.email_confirmed_at) {
    return res.status(400).json({
      success: false,
      error: "email_not_verified",
      message: "Please click the confirmation link in your verification email before qualifying.",
    });
  }

  // Call the atomic PostgreSQL RPC function
  const { data, error } = await supabaseAdmin.rpc("qualify_referral", {
    p_referred_user_id: userId,
  });

  if (error) {
    console.error("[referrals/qualify] RPC error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(200).json({ success: true, result: data });
}

