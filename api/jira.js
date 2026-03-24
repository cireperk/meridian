export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { summary, description, issueType = "Task", priority = "Medium", labels = [] } = req.body;
  if (!summary || !summary.trim()) {
    return res.status(400).json({ error: "Summary is required" });
  }

  const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    return res.status(500).json({ error: "Jira not configured" });
  }

  // Build ADF description
  const descContent = [];
  if (description) {
    const sections = description.split("\n\n");
    for (const section of sections) {
      if (section.startsWith("## ")) {
        descContent.push({
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: section.replace("## ", "") }],
        });
      } else if (section.includes("\n- ")) {
        const lines = section.split("\n").filter(l => l.startsWith("- "));
        descContent.push({
          type: "bulletList",
          content: lines.map(l => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: l.replace("- ", "") }] }],
          })),
        });
      } else {
        descContent.push({
          type: "paragraph",
          content: [{ type: "text", text: section }],
        });
      }
    }
  }

  const fields = {
    project: { key: JIRA_PROJECT_KEY },
    summary: summary.trim(),
    issuetype: { name: issueType },
    labels: ["dev", ...labels],
  };

  if (descContent.length > 0) {
    fields.description = { type: "doc", version: 1, content: descContent };
  }

  if (priority) {
    fields.priority = { name: priority };
  }

  try {
    const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!jiraRes.ok) {
      const errText = await jiraRes.text();
      console.error("Jira error:", jiraRes.status, errText);
      return res.status(500).json({ error: "Failed to create Jira issue", details: errText });
    }

    const data = await jiraRes.json();
    return res.status(200).json({ ok: true, issueKey: data.key, issueUrl: `${JIRA_BASE_URL}/browse/${data.key}` });
  } catch (err) {
    console.error("Jira error:", err);
    return res.status(500).json({ error: "Failed to create Jira issue" });
  }
}
