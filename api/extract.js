export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const { text_content } = req.body;
  if (!text_content) {
    return res.status(400).json({ error: "No text content provided" });
  }

  const systemPrompt = `You are a legal document analyst specializing in family law. You will be given the full text of a divorce decree or custody agreement. Your job is to extract specific structured fields from the document.

CRITICAL RULES:
- Only extract what is EXPLICITLY stated in the document. Never infer, guess, or assume.
- If a field is not mentioned or not clearly defined in the document, return null for that field.
- Use plain, simple language — the user is not a lawyer.
- For the raw_summary, write 3-5 sentences summarizing the most important terms in everyday language.
- Amounts should be numbers (not strings). Dates should be in YYYY-MM-DD format when possible.
- For holiday schedules, note which parent has which holiday in even vs odd years if specified.`;

  const tool = {
    name: "extract_decree_fields",
    description: "Extract structured fields from a divorce decree or custody agreement",
    input_schema: {
      type: "object",
      properties: {
        raw_summary: {
          type: ["string", "null"],
          description: "A 3-5 sentence plain-language summary of the decree's most important terms. Written for a non-lawyer."
        },
        custody_type: {
          type: ["string", "null"],
          description: "The type of custody arrangement: 'standard_possession' (Texas SPO), 'expanded_standard', 'joint_managing_conservator', 'sole_managing_conservator', 'custom', or other description"
        },
        custody_schedule: {
          type: ["object", "null"],
          description: "Details of the custody/visitation schedule",
          properties: {
            primary_parent: { type: ["string", "null"], description: "Parent with primary custody" },
            weekday_arrangement: { type: ["string", "null"], description: "Who has kids on weekdays" },
            weekend_arrangement: { type: ["string", "null"], description: "Weekend visitation pattern" },
            summer_arrangement: { type: ["string", "null"], description: "Summer possession schedule" },
            details: { type: ["string", "null"], description: "Additional schedule details in plain language" }
          }
        },
        holiday_schedule: {
          type: ["array", "null"],
          description: "List of holiday arrangements",
          items: {
            type: "object",
            properties: {
              holiday: { type: "string", description: "Holiday name" },
              even_years: { type: ["string", "null"], description: "Which parent has this holiday in even years" },
              odd_years: { type: ["string", "null"], description: "Which parent has this holiday in odd years" },
              times: { type: ["string", "null"], description: "Specific pickup/dropoff times for this holiday" },
              notes: { type: ["string", "null"], description: "Any special conditions" }
            }
          }
        },
        geographic_restriction: {
          type: ["object", "null"],
          description: "Geographic restriction on where the child can reside",
          properties: {
            restricted: { type: ["boolean", "null"], description: "Whether a geographic restriction exists" },
            area: { type: ["string", "null"], description: "The restricted area (county, state, radius, etc.)" },
            details: { type: ["string", "null"], description: "Additional details or exceptions" }
          }
        },
        child_support: {
          type: ["object", "null"],
          description: "Child support payment details",
          properties: {
            amount: { type: ["number", "null"], description: "Monthly amount in dollars" },
            payer: { type: ["string", "null"], description: "Who pays child support" },
            due_day: { type: ["number", "null"], description: "Day of month payment is due" },
            details: { type: ["string", "null"], description: "Additional terms (wage withholding, medical support, etc.)" }
          }
        },
        medical_decision_rights: {
          type: ["string", "null"],
          description: "'joint' if both parents decide, 'sole_mother' or 'sole_father' if one parent has exclusive right, or other description"
        },
        dental_decision_rights: {
          type: ["string", "null"],
          description: "'joint' if both parents decide, 'sole_mother' or 'sole_father' if one parent has exclusive right, or other description"
        },
        right_of_first_refusal: {
          type: ["object", "null"],
          description: "Right of first refusal details",
          properties: {
            enabled: { type: ["boolean", "null"], description: "Whether right of first refusal exists" },
            hours_threshold: { type: ["number", "null"], description: "Number of hours that triggers the right" },
            details: { type: ["string", "null"], description: "Additional terms" }
          }
        },
        communication_requirements: {
          type: ["string", "null"],
          description: "Required methods or rules for communication between co-parents (e.g., must use email, no contact after 9pm, etc.)"
        },
        pickup_dropoff: {
          type: ["object", "null"],
          description: "Pickup and dropoff logistics",
          properties: {
            location: { type: ["string", "null"], description: "Default exchange location" },
            weekday_time: { type: ["string", "null"], description: "Weekday pickup/dropoff time" },
            weekend_time: { type: ["string", "null"], description: "Weekend pickup/dropoff time" },
            details: { type: ["string", "null"], description: "Additional logistics" }
          }
        },
        children: {
          type: ["array", "null"],
          description: "Children mentioned in the decree",
          items: {
            type: "object",
            properties: {
              name: { type: ["string", "null"], description: "Child's name" },
              birthdate: { type: ["string", "null"], description: "Child's date of birth (YYYY-MM-DD)" }
            }
          }
        }
      },
      required: ["raw_summary"]
    }
  };

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: [tool],
        tool_choice: { type: "tool", name: "extract_decree_fields" },
        messages: [
          {
            role: "user",
            content: `Please extract all relevant fields from the following divorce decree/custody agreement. Only include information that is explicitly stated in the document.\n\n${text_content}`
          }
        ]
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    const result = await response.json();

    // Extract the tool use result
    const toolUse = result.content?.find(c => c.type === "tool_use");
    if (!toolUse?.input) {
      return res.status(500).json({ error: "Extraction failed — no structured data returned" });
    }

    return res.status(200).json(toolUse.input);
  } catch (err) {
    return res.status(500).json({ error: "Failed to extract decree fields" });
  }
}
