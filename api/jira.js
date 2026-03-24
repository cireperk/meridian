export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
  const JIRA_EMAIL = process.env.JIRA_EMAIL;
  const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;
  const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    return res.status(500).json({ error: "Jira not configured" });
  }

  const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;
  const jiraHeaders = {
    Authorization: authHeader,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // DELETE — delete an issue
  if (req.method === "DELETE") {
    const { issueKey } = req.body || {};
    if (!issueKey) return res.status(400).json({ error: "issueKey is required" });

    try {
      const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`, {
        method: "DELETE",
        headers: jiraHeaders,
      });
      if (!jiraRes.ok) {
        const errText = await jiraRes.text();
        return res.status(500).json({ error: "Failed to delete issue", details: errText });
      }
      return res.status(200).json({ ok: true, deleted: issueKey });
    } catch (err) {
      return res.status(500).json({ error: "Failed to delete issue" });
    }
  }

  // PUT — update an existing issue
  if (req.method === "PUT") {
    const { issueKey, summary, description, priority, labels, status } = req.body || {};
    if (!issueKey) return res.status(400).json({ error: "issueKey is required" });

    const fields = {};
    if (summary) fields.summary = summary.trim();
    if (priority) fields.priority = { name: priority };
    if (labels) fields.labels = ["dev", ...labels];
    if (description) {
      fields.description = { type: "doc", version: 1, content: buildADF(description) };
    }

    try {
      // Update fields
      if (Object.keys(fields).length > 0) {
        const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}`, {
          method: "PUT",
          headers: jiraHeaders,
          body: JSON.stringify({ fields }),
        });
        if (!jiraRes.ok) {
          const errText = await jiraRes.text();
          return res.status(500).json({ error: "Failed to update issue", details: errText });
        }
      }

      // Transition status if requested
      if (status) {
        const transRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {
          method: "GET",
          headers: jiraHeaders,
        });
        if (transRes.ok) {
          const { transitions } = await transRes.json();
          const match = transitions.find(t => t.name.toLowerCase() === status.toLowerCase());
          if (match) {
            await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${issueKey}/transitions`, {
              method: "POST",
              headers: jiraHeaders,
              body: JSON.stringify({ transition: { id: match.id } }),
            });
          }
        }
      }

      return res.status(200).json({ ok: true, updated: issueKey, issueUrl: `${JIRA_BASE_URL}/browse/${issueKey}` });
    } catch (err) {
      return res.status(500).json({ error: "Failed to update issue" });
    }
  }

  // POST — create a new issue
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { summary, description, issueType = "Task", priority = "Medium", labels = [] } = req.body;
  if (!summary || !summary.trim()) {
    return res.status(400).json({ error: "Summary is required" });
  }

  const fields = {
    project: { key: JIRA_PROJECT_KEY },
    summary: summary.trim(),
    issuetype: { name: issueType },
    labels: ["dev", ...labels],
  };

  const descContent = buildADF(description);
  if (descContent.length > 0) {
    fields.description = { type: "doc", version: 1, content: descContent };
  }

  if (priority) {
    fields.priority = { name: priority };
  }

  try {
    const jiraRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: jiraHeaders,
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

function buildADF(description) {
  if (!description) return [];
  const content = [];
  const sections = description.split("\n\n");
  for (const section of sections) {
    if (section.startsWith("## ")) {
      content.push({
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: section.replace("## ", "") }],
      });
    } else if (section.includes("\n- ")) {
      const lines = section.split("\n").filter(l => l.startsWith("- "));
      content.push({
        type: "bulletList",
        content: lines.map(l => ({
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: l.replace("- ", "") }] }],
        })),
      });
    } else {
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: section }],
      });
    }
  }
  return content;
}
