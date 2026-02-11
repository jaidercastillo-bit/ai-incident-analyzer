const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3001;
const MODEL = process.env.MODEL || "gpt-4.1-mini";

app.get("/health", (req, res) => res.json({ ok: true }));

app.post("/ai/analyze", async (req, res) => {
  try {
    const { text, temperature = 0.2 } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' (string)." });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in .env" });
    }

    const system = [
      "Eres un Senior SRE/IT Ops en un entorno tipo Connect (operación 24/7).",
      "Reglas:",
      "- No inventes datos. Si falta evidencia, marca como 'hipótesis'.",
      "- Devuelve SOLO JSON válido (sin markdown, sin texto extra).",
      "- Prioriza acciones seguras (sin downtime) y checks verificables.",
      "- Incluye confidence 0-100 por hipótesis."
    ].join("\n");

    const schema = {
      summary: "string (máx 5 líneas)",
      signals: ["string"],
      hypotheses: [
        { title: "string", why: "string", checks: ["string"], confidence: 0 }
      ],
      safe_mitigations: ["string"],
      escalate_when: ["string"],
      questions_to_ask: ["string"]
    };

    const user = `LOGS / CONTEXTO:\n${text}\n\nDevuelve EXACTAMENTE este JSON (misma estructura):\n${JSON.stringify(schema, null, 2)}`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    const rawText = await r.text();
    if (!r.ok) {
      return res.status(500).json({ error: "LLM call failed", details: rawText });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: "Unexpected LLM response", details: rawText }); }

    const outputText =
      data.output_text ||
      (Array.isArray(data.output)
        ? data.output
            .map(o => (o && Array.isArray(o.content) ? o.content.map(c => c.text || "").join("") : ""))
            .join("")
        : "");

    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch {
      return res.status(500).json({ error: "Model did not return valid JSON", raw: outputText });
    }

    return res.json(parsed);
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
});

app.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
