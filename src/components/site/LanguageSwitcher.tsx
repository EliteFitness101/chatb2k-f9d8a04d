import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const LANGS = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "es", label: "ES" },
  { code: "ar", label: "AR" },
  { code: "zh", label: "中文" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.resolvedLanguage ?? "en";
  return (
    <label className="inline-flex items-center gap-1.5 text-xs tracking-widest uppercase text-muted-foreground cursor-pointer">
      <Globe className="h-3 w-3 text-gold" />
      <select
        aria-label="Language"
        value={current}
        onChange={(e) => {
          i18n.changeLanguage(e.target.value);
          if (typeof document !== "undefined") {
            document.documentElement.dir = e.target.value === "ar" ? "rtl" : "ltr";
          }
        }}
        className="bg-transparent outline-none cursor-pointer"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code} className="bg-[var(--ink)]">
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}