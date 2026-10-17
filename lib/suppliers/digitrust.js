// Adapter that exposes the existing DigiTrust client in the shared
// supplier shape. lib/digitrust.js itself is untouched.
import * as dt from "../digitrust";
import { cleanTitle } from "../cleanText";

export const configured = () =>
  Boolean(process.env.DIGITRUST_API_BASE && process.env.DIGITRUST_API_KEY);

function normalize(p) {
  return {
    supplierProductId: String(p.id),
    title: cleanTitle(p.title),
    description: p.description ?? p.details ?? null,
    category: null,
    cost: Number(p.special_price?.price ?? p.price),
    stock: Math.max(0, Number(p.stock) || 0),
    requiresEmail: Boolean(p.requires_email),
    delivery: p.delivery,
    warranty: p.warranty ?? p.warranty_period ?? p.warranty_days ?? p.guarantee ?? null,
  };
}

export async function listProducts() {
  const remote = await dt.getAllProducts();
  return remote.products.map(normalize);
}

export async function getProduct(id) {
  const { product } = await dt.getProduct(id);
  return normalize(product);
}

export async function getBalance() {
  const data = await dt.getBalance();
  const raw = data.balance ?? data.wallet?.balance;
  return { balance: raw === undefined ? null : Number(raw), raw: data };
}

export async function health() {
  await dt.getBalance();
  return { ok: true, status: 200 };
}

export async function purchase({ productId, quantity, email }) {
  const result = await dt.purchase({ productId, quantity, email });
  return { supplierOrderId: String(result.order.id), items: result.order.items };
}
