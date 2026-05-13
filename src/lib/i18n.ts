import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

const resources = {
  en: { translation: {
    "nav.arsenal": "Arsenal", "nav.bundles": "Bundles", "nav.quiz": "Reset Quiz",
    "nav.hubs": "Hubs", "nav.about": "Authority",
    "cta.checkout": "Checkout", "cta.signin": "Sign in", "cta.dashboard": "Dashboard",
    "geo.routing": "Routing",
  }},
  fr: { translation: {
    "nav.arsenal": "Arsenal", "nav.bundles": "Coffrets", "nav.quiz": "Quiz Reset",
    "nav.hubs": "Hubs", "nav.about": "Autorité",
    "cta.checkout": "Paiement", "cta.signin": "Connexion", "cta.dashboard": "Tableau",
    "geo.routing": "Routage",
  }},
  es: { translation: {
    "nav.arsenal": "Arsenal", "nav.bundles": "Paquetes", "nav.quiz": "Quiz Reset",
    "nav.hubs": "Hubs", "nav.about": "Autoridad",
    "cta.checkout": "Pagar", "cta.signin": "Entrar", "cta.dashboard": "Panel",
    "geo.routing": "Ruta",
  }},
  ar: { translation: {
    "nav.arsenal": "الترسانة", "nav.bundles": "الحزم", "nav.quiz": "اختبار",
    "nav.hubs": "المراكز", "nav.about": "السلطة",
    "cta.checkout": "الدفع", "cta.signin": "دخول", "cta.dashboard": "لوحة",
    "geo.routing": "توجيه",
  }},
  zh: { translation: {
    "nav.arsenal": "军械库", "nav.bundles": "套装", "nav.quiz": "重启测验",
    "nav.hubs": "中心", "nav.about": "权威",
    "cta.checkout": "结账", "cta.signin": "登录", "cta.dashboard": "仪表板",
    "geo.routing": "路由",
  }},
};

if (!i18n.isInitialized) {
  const chain = typeof window !== "undefined"
    ? i18n.use(LanguageDetector).use(initReactI18next)
    : i18n.use(initReactI18next);
  chain.init({
    resources,
    lng: typeof window === "undefined" ? "en" : undefined,
    fallbackLng: "en",
    supportedLngs: ["en", "fr", "es", "ar", "zh"],
    interpolation: { escapeValue: false },
    detection: { order: ["localStorage", "navigator"], caches: ["localStorage"] },
    react: { useSuspense: false },
  });
}

export default i18n;