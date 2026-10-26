export type ProductEvent =
  | "signup_attempted"
  | "signup_completed"
  | "signin_attempted"
  | "signin_completed"
  | "guide_search"
  | "professional_referral_requested"
  | "professional_referral_link_issued";

export function trackEvent(event: ProductEvent) {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !/^https?:$/.test(window.location.protocol)) return;

  const body = new Blob([JSON.stringify({ event })], { type: "application/json" });
  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/analytics", body)) return;
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch((error) => console.error("Analytics event failed:", error));
}
