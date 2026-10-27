import { FormSelect } from "../ui/FormInput";
import { PRODUCT_CATEGORIES } from "../../lib/categories";

// Dropdown of the 15 categories. A category saved before this list existed
// (free text) is still shown, so nothing silently changes.
export default function CategorySelect({ label = "Category", value, onChange, hint, className }) {
  const current = value || "";
  const extra = current && !PRODUCT_CATEGORIES.includes(current) ? [current] : [];
  return (
    <FormSelect label={label} value={current} onChange={(e) => onChange(e.target.value)} hint={hint} className={className}>
      <option value="">— No category —</option>
      {[...PRODUCT_CATEGORIES, ...extra].map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </FormSelect>
  );
}
