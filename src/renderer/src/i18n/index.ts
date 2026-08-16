import { useApp } from "../store/useApp";
import { translations, type TranslationKey } from "./translations";

export type { TranslationKey } from "./translations";

interface Params {
  [key: string]: string | number;
}

/** React hook: returns a translation function bound to the active locale. */
export function useT() {
  const locale = useApp((s) => s.settings.locale);
  return (key: TranslationKey, params?: Params): string => {
    let text: string = translations[locale]?.[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}
