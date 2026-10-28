document.querySelectorAll("[data-current-year]").forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const allowedEvents = new Set(["guide_search", "professional_referral_requested", "tool_schedule_generated", "tool_calendar_downloaded", "tool_signup_clicked"]);
const trackEvent = (event) => {
  if (!allowedEvents.has(event)) return;
  const body = new Blob([JSON.stringify({ event })], { type: "application/json" });
  if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/analytics", body)) return;
  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch((error) => console.error("Analytics event failed:", error));
};

document.querySelectorAll("[data-analytics-event]").forEach((element) => {
  element.addEventListener("click", () => trackEvent(element.dataset.analyticsEvent));
});

const guideSearch = document.querySelector("#guide-search");
if (guideSearch) {
  let searchTimeout;
  guideSearch.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    if (guideSearch.value.trim()) {
      searchTimeout = setTimeout(() => trackEvent("guide_search"), 600);
    }
  });
}
