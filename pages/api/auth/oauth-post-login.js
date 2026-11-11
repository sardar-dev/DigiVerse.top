import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  // 1. Resolve authenticated user via session cookie or Bearer token
  let userId = null;
  let userEmail = null;

  try {
    const supabaseServer = createPagesServerClient({ req, res });
    const {
      data: { session },
    } = await supabaseServer.auth.getSession();
    if (session?.user) {
      userId = session.user.id;
      userEmail = session.user.email;
    }
  } catch (e) {
    // Session cookie read fallback
  }

  if (!userId && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, "").trim();
      if (token) {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (userData?.user) {
          userId = userData.user.id;
          userEmail = userData.user.email;
        }
      }
    } catch (e) {
      // Bearer token fallback error
    }
  }

  if (!userId) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  const { ref, device_id } = req.body || {};
  const cleanRef = typeof ref === "string" ? ref.trim().toLowerCase() : null;
  const cleanDeviceId = typeof device_id === "string" ? device_id.trim() : null;

  try {
    // 2. Query user profile
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, username, referred_by, device_id")
      .eq("id", userId)
      .maybeSingle();

    let currentUsername = profile?.username;

    // If profile or username is missing, generate one
    if (!profile || !currentUsername) {
      let baseUser = (userEmail || "user").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (baseUser.length < 3) baseUser = `user_${baseUser}`;
      if (baseUser.length > 18) baseUser = baseUser.slice(0, 18);

      let candidate = baseUser;
      let attempts = 0;
      while (attempts < 10) {
        const { data: existing } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("username", candidate)
          .neq("id", userId)
          .maybeSingle();

        if (!existing) break;
        candidate = `${baseUser.slice(0, 17)}_${Math.floor(1000 + Math.random() * 9000)}`;
        attempts++;
      }

      currentUsername = candidate;

      if (!profile) {
        await supabaseAdmin.from("profiles").insert({
          id: userId,
          email: userEmail,
          username: currentUsername,
          device_id: cleanDeviceId || null,
        });
      } else {
        await supabaseAdmin
          .from("profiles")
          .update({
            username: currentUsername,
            device_id: profile.device_id || cleanDeviceId || null,
          })
          .eq("id", userId);
      }
    }

    // 3. Link referral if user has no referrer and ref code was supplied
    if (cleanRef && (!profile || !profile.referred_by)) {
      // Check if a referral record already exists
      const { data: existingRef } = await supabaseAdmin
        .from("referrals")
        .select("id")
        .eq("referred_id", userId)
        .maybeSingle();

      if (!existingRef) {
        // Look up inviter
        const { data: inviter } = await supabaseAdmin
          .from("profiles")
          .select("id, username")
          .ilike("username", cleanRef)
          .neq("id", userId)
          .maybeSingle();

        if (inviter) {
          // Link in profile
          await supabaseAdmin
            .from("profiles")
            .update({
              referred_by: inviter.id,
              device_id: cleanDeviceId || profile?.device_id || null,
            })
            .eq("id", userId);

          // Insert into referrals
          await supabaseAdmin.from("referrals").insert({
            referrer_id: inviter.id,
            referred_id: userId,
            referrer_username: cleanRef,
            device_id: cleanDeviceId || null,
            status: "pending_verification",
          });

          // Google OAuth users are email-verified; qualify referral right away!
          try {
            await supabaseAdmin.rpc("qualify_referral", {
              p_referred_user_id: userId,
            });
          } catch (qErr) {
            console.warn("[oauth-post-login] qualify_referral warn:", qErr.message);
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      username: currentUsername,
    });
  } catch (err) {
    console.error("[oauth-post-login] error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

