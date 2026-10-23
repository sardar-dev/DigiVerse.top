import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { requireAdmin } from "../../../lib/requireAdmin";
import { aiConfigured } from "../../../lib/aiRewrite";
import { researchApi } from "../../../lib/aiResearch";
import { makeCustomApi, normalizeConfig, assertPublicHttps } from "../../../lib/suppliers/custom";
import { invalidateCustomSuppliers } from "../../../lib/suppliers";

export const config = { maxDuration: 60 };

const AUTH_TYPES = ["bearer", "header", "query", "basic", "none"];
const PUBLIC_COLS =
  "id, label, base_url, auth_type, auth_header, auth_prefix, extra_headers, config, docs, enabled, updated_at, api_key";

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function parseConfig(c) {
  if (typeof c === "string") {
    try {
      return JSON.parse(c);
    } catch {
      throw new Error("The settings JSON is not valid. Check commas and quotes.");
    }
  }
  return c || {};
}

function headersObj(h) {
  const src = typeof h === "string" && h.trim() ? parseConfig(h) : h;
  if (!src || typeof src !== "object" || Array.isArray(src)) return {};
  return Object.fromEntries(
    Object.entries(src)
      .filter(([k, v]) => /^[\w-]{1,60}$/.test(k) && typeof v === "string")
      .slice(0, 10)
      .map(([k, v]) => [k, v.slice(0, 300)])
  );
}

// Validated row from the form. api_key falls back to the stored one.
function buildRow(b, existing) {
  const label = clean(b.label, 60);
  if (label.length < 2) throw new Error("Enter a name for this API.");
  const base = assertPublicHttps(clean(b.base_url, 300)).toString().replace(/\/+$/, "");
  const authType = AUTH_TYPES.includes(b.auth_type) ? b.auth_type : "bearer";
  const typed = clean(b.api_key, 500);
  const apiKey = authType === "none" ? "" : typed || existing?.api_key || "";
  if (authType !== "none" && !apiKey) throw new Error("Enter the API key.");
  return {
    label,
    base_url: base,
    auth_type: authType,
    auth_header: clean(b.auth_header, 60),
    auth_prefix: clean(b.auth_prefix, 40),
    api_key: apiKey,
    extra_headers: headersObj(b.extra_headers),
    config: normalizeConfig(parseConfig(b.config)),
    docs: clean(b.docs, 60000) || existing?.docs || null,
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "api";

export default async function handler(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;

  const missing = (e) => e && /custom_suppliers/i.test(e.message || "");

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin.from("custom_suppliers").select(PUBLIC_COLS).order("created_at");
    if (error) {
      return res.status(missing(error) ? 200 : 500).json({
        success: !missing(error),
        migrated: false,
        error: missing(error) ? "run_migration_021" : error.message,
        configured: aiConfigured(),
        suppliers: [],
      });
    }
    const suppliers = (data || []).map(({ api_key, ...r }) => ({
      ...r,
      has_key: Boolean(api_key),
      key_hint: api_key ? `••••${api_key.slice(-4)}` : "",
    }));
    return res.status(200).json({ success: true, migrated: true, configured: aiConfigured(), suppliers });
  }

  if (req.method !== "POST") return res.status(405).json({ success: false, error: "method_not_allowed" });

  const b = req.body || {};
  const action = b.action;

  try {
    let existing = null;
    if (b.id) {
      const r = await supabaseAdmin.from("custom_suppliers").select("*").eq("id", String(b.id)).maybeSingle();
      existing = r.data || null;
    }

    if (action === "research") {
      const hints = [
        b.base_url ? `Base URL: ${clean(b.base_url, 300)}` : "",
        b.auth_type ? `Auth type: ${clean(b.auth_type, 20)}` : "",
        b.auth_header ? `Auth header/param name: ${clean(b.auth_header, 60)}` : "",
        b.auth_prefix ? `Auth value prefix: ${clean(b.auth_prefix, 40)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      let current = null;
      if (b.config) {
        try {
          current = parseConfig(b.config);
        } catch {}
      }
      const out = await researchApi({
        name: clean(b.label, 60),
        website: clean(b.website, 300),
        docsUrl: clean(b.docs_url, 400),
        docsText: clean(b.docs, 60000),
        quickStart: clean(b.quick_start, 8000),
        hints,
        apiKey: clean(b.api_key, 500) || existing?.api_key || "",
        current,
        feedback: clean(b.feedback, 4000),
      });
      return res.status(out.ok ? 200 : 502).json({ success: out.ok, ...out });
    }

    if (action === "test") {
      const row = buildRow(b, existing);
      const api = makeCustomApi({ ...row, id: existing?.id || "c_test", enabled: true });
      const result = await api.test();
      return res.status(200).json({ success: true, result });
    }

    if (action === "save") {
      const row = buildRow(b, existing);
      if (existing) {
        const { error } = await supabaseAdmin
          .from("custom_suppliers")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
        invalidateCustomSuppliers();
        return res.status(200).json({ success: true, id: existing.id });
      }
      let id = `c_${slug(row.label)}`;
      const { data: clash } = await supabaseAdmin.from("custom_suppliers").select("id").eq("id", id).maybeSingle();
      if (clash) id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
      const { error } = await supabaseAdmin.from("custom_suppliers").insert({ id, ...row });
      if (error) throw new Error(error.message);
      invalidateCustomSuppliers();
      return res.status(200).json({ success: true, id });
    }

    if (action === "toggle") {
      if (!existing) return res.status(404).json({ success: false, error: "not_found" });
      await supabaseAdmin
        .from("custom_suppliers")
        .update({ enabled: Boolean(b.enabled), updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      invalidateCustomSuppliers();
      return res.status(200).json({ success: true });
    }

    if (action === "delete") {
      if (!existing) return res.status(404).json({ success: false, error: "not_found" });
      const { count } = await supabaseAdmin
        .from("product_sources")
        .select("id", { count: "exact", head: true })
        .eq("supplier", existing.id);
      if (count > 0) return res.status(409).json({ success: false, error: "has_products", count });
      await supabaseAdmin.from("custom_suppliers").delete().eq("id", existing.id);
      invalidateCustomSuppliers();
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "unknown_action" });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "failed" });
  }
}
