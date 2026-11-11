import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { validateRegistrationEmail } from "../../../lib/emailAllowlist";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "method_not_allowed" });
  }

  const { username, email, password, ref, device_id } = req.body || {};

  // 1. Username validation
  const cleanUsername = String(username || "").trim();
  if (!cleanUsername) {
    return res.status(400).json({ success: false, error: "Username is required." });
  }

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
    return res.status(400).json({
      success: false,
      error: "Username must be 3–24 characters and can only contain letters, numbers, and underscores (_).",
    });
  }

  // Check username uniqueness (case-insensitive)
  const { data: existingUser, error: userErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", cleanUsername)
    .maybeSingle();

  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: "This username is already taken. Please choose another.",
    });
  }

  // 2. Email domain allowlist validation
  const emailCheck = validateRegistrationEmail(email);
  if (!emailCheck.valid) {
    return res.status(400).json({ success: false, error: emailCheck.error });
  }

  // Check email uniqueness
  const { data: existingEmail } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", emailCheck.normalizedEmail)
    .maybeSingle();

  if (existingEmail) {
    return res.status(400).json({
      success: false,
      error: "An account with this email address already exists. Please log in instead.",
    });
  }

  // 3. Password validation: Allow any password format/length chosen by the user
  if (!password || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      error: "Password is required.",
    });
  }

  // 4. Resolve inviter if referral code is present
  let inviter = null;
  const cleanRef = String(ref || "").trim();
  if (cleanRef) {
    // Prevent self-referral using same username
    if (cleanRef.toLowerCase() === cleanUsername.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: "You cannot refer yourself.",
      });
    }

    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("username", cleanRef)
      .maybeSingle();

    if (inviterProfile) {
      inviter = { id: inviterProfile.id, username: inviterProfile.username };
    }
  }

  // 5. Anti-fraud IP & Device registration checks
  const clientIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "";

  return res.status(200).json({
    success: true,
    cleanUsername: cleanUsername.toLowerCase(),
    cleanEmail: emailCheck.normalizedEmail,
    inviter,
    clientIp,
  });
}

