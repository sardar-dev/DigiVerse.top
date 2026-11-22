// Strict 5-domain allowlist for NEW registrations on DigiVerse
export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "yahoo.com",
  "hotmail.com",
  "icloud.com",
];

/**
 * Normalizes an email and validates that its domain is on the allowlist (when enabled).
 * Returns { valid: boolean, normalizedEmail: string, error?: string }
 */
export function validateRegistrationEmail(rawEmail, restrictDomains = true) {
  if (!rawEmail || typeof rawEmail !== "string") {
    return { valid: false, error: "Email is required." };
  }

  const email = rawEmail.trim().toLowerCase();
  const parts = email.split("@");

  if (parts.length !== 2 || !parts[0] || !parts[1] || !parts[1].includes(".")) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  const domain = parts[1].toLowerCase();

  if (restrictDomains && !ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    return {
      valid: false,
      domain,
      error: `Registration is only allowed with ${ALLOWED_EMAIL_DOMAINS.join(", ")}. Please use an allowed provider.`,
    };
  }

  return { valid: true, normalizedEmail: email, domain };
}

