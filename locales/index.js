// Merges every translation file. Each file in ./parts exports
// { ar: {"English text": "..."}, ru: {"English text": "..."} }.
import common from "./parts/common";
import store from "./parts/store";
import pages from "./parts/pages";
import account from "./parts/account";

const parts = [common, store, pages, account];

const dictionaries = { ar: {}, ru: {} };
for (const p of parts) {
  Object.assign(dictionaries.ar, p.ar);
  Object.assign(dictionaries.ru, p.ru);
}
export default dictionaries;
