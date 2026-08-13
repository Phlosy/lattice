import { useApp } from "../store/useApp";
import { translations, type TranslationKey } from "./translations";

export type { TranslationKey } from "./translations";

/** React hook: returns a translation function bound to the active locale. */
export function useT() {
  const locale = useApp((s) => s.settings.locale);
  return (key: TranslationKey): string => translations[locale]?.[key] ?? key;
}
