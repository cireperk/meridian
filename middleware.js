export default function middleware(request) {
  const url = new URL(request.url);

  // Only intercept the root path
  if (url.pathname !== "/") return;

  const ua = (request.headers.get("user-agent") || "").toLowerCase();

  // Common search engine and social media crawlers
  const bots = [
    "googlebot", "bingbot", "yandexbot", "duckduckbot", "baiduspider",
    "slurp", "facebookexternalhit", "twitterbot", "linkedinbot",
    "whatsapp", "telegrambot", "discordbot", "slackbot",
    "applebot", "ia_archiver", "semrushbot", "ahrefsbot"
  ];

  const isBot = bots.some(bot => ua.includes(bot));

  if (isBot) {
    return fetch(new URL("/landing.html", request.url));
  }
}

export const config = {
  matcher: ["/"],
};
