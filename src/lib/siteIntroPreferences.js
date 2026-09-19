export const SITE_INTRO_STORAGE_KEY = "nebulaSiteIntroEnabled";
export function getSiteIntroEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SITE_INTRO_STORAGE_KEY) !== "0";
}
export function setSiteIntroEnabled(value) {
  const enabled = value !== false;
  if (typeof window !== "undefined") window.localStorage.setItem(SITE_INTRO_STORAGE_KEY, enabled ? "1" : "0");
  return enabled;
}
