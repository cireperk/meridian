export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { feedback, userId, email, chatMessage } = req.body;
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: "Feedback is required" });
  }

  const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    console.log("[FEEDBACK]", new Date().toISOString(), email || "anon", feedback.trim());
    return res.status(200).json({ ok: true });
  }

  const summary = feedback.trim().slice(0, 100) + (feedback.trim().length > 100 ? "..." : "");
  const descriptionParts = [
    { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "User Feedback" }] },
    { type: "paragraph", content: [{ type: "text", text: feedback.trim() }] },
    { type: "rule" },
    { type: "paragraph", content: [
      { type: "text", text: "From: ", marks: [{ type: "strong" }] },
      { type: "text", text: email || "anonymous" },
    ] },
    { type: "paragraph", content: [
      { type: "text", text: "User ID: ", marks: [{ type: "strong" }] },
      { type: "text", text: userId || "n/a" },
    ] },
  ];

  if (chatMessage) {
    descriptionParts.push(
      { type: "rule" },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Chat Message That Triggered Feedback" }] },
      { type: "paragraph", content: [{ type: "text", text: chatMessage }] },
    );
  }

  try {
    const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          summary: `Feedback: ${summary}`,
          description: { type: "doc", version: 1, content: descriptionParts },
          issuetype: { name: "Task" },
          labels: [chatMessage ? "chat-feedback" : "general-feedback"],
        },
      }),
    });

    if (!jiraRes.ok) {
      const errText = await jiraRes.text();
      console.error("Jira error:", jiraRes.status, errText);
      return res.status(500).json({ error: "Failed to create Jira issue" });
    }

    const data = await jiraRes.json();
    return res.status(200).json({ ok: true, issueKey: data.key });
  } catch (err) {
    console.error("Jira error:", err);
    return res.status(500).json({ error: "Failed to create Jira issue" });
  }
}
