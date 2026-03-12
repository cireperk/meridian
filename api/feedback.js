export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { feedback } = req.body;
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: "Feedback is required" });
  }

  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  const jiraBaseUrl = process.env.JIRA_BASE_URL; // e.g. https://yourorg.atlassian.net
  const jiraProjectKey = process.env.JIRA_PROJECT_KEY || "MER";

  if (!jiraEmail || !jiraToken || !jiraBaseUrl) {
    // Fallback: log it (visible in Vercel function logs)
    console.log("[FEEDBACK]", new Date().toISOString(), feedback.trim());
    return res.status(200).json({ ok: true, method: "logged" });
  }

  try {
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString("base64");
    const response = await fetch(`${jiraBaseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: jiraProjectKey },
          summary: `User Feedback: ${feedback.trim().slice(0, 80)}`,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: feedback.trim() }],
              },
            ],
          },
          issuetype: { name: "Task" },
          labels: ["customer-feedback", "meridian-app"],
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Jira API error:", err);
      return res.status(500).json({ error: "Failed to create ticket" });
    }

    const data = await response.json();
    return res.status(200).json({ ok: true, key: data.key });
  } catch (err) {
    console.error("Feedback error:", err);
    return res.status(500).json({ error: "Failed to send feedback" });
  }
}
