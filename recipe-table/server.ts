// server.ts
// Standalone local server for the recipe-table prototype.
//   bun run server.ts   (or: bun start)
//
// Serves the static frontend, transpiles/bundles the vanilla-TS frontend on the
// fly, and exposes POST /parse which calls the Anthropic API server-side. The
// API key is read from ANTHROPIC_API_KEY (see .env) and never sent to the
// browser.

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ROOT = import.meta.dir;

const PARSE_SYSTEM_PROMPT = `You are a recipe parser. You convert raw recipe text into a strict JSON dependency tree in the "Cooking for Engineers" style, where operations combine ingredients step by step.

OUTPUT RULES (obey exactly):
- Return ONLY raw JSON. No markdown, no code fences, no backticks, no commentary or explanation before or after. The first character of your reply must be "{" and the last must be "}".
- Never invent a quantity, unit, temperature, or time. Copy them verbatim from the source text. If the source does not state a value, leave that field empty ("") — do not guess or estimate.
- If you are unsure whether an ingredient exists, what its quantity is, or where it belongs in the steps, set "uncertain": true on that ingredient so a human can check it against the source. Otherwise set "uncertain": false.

SCHEMA (match this shape exactly):
{
  "title": string,
  "servings": string | null,
  "prep": string[],
  "ingredients": [{ "id": string, "qty": string, "name": string, "note": string | null, "uncertain": boolean }],
  "tree": Node
}
Node = { "op": string, "children": (Node | { "ref": string })[] }

FIELD RULES:
- title: the recipe's name. If none is given, use a short descriptive title.
- servings: the yield/servings string exactly as written, or null if absent.
- prep: setup steps that are NOT combinations of ingredients — preheating the oven, greasing or lining a pan, bringing water to a boil. One short string each. These render as full-width header rows at the top and must NOT appear in the tree.
- ingredients: one entry per ingredient use. "id" is a short unique slug (e.g. "flour", "butter-1"). "qty" holds the quantity AND unit together exactly as written (e.g. "2 cups", "1/2 tsp"), or "" if none is given. "name" is the ingredient name. "note" is an optional short note shown in the cell (e.g. "softened", "divided") or null.
- Divided ingredients: if one ingredient is used at two separate stages (e.g. "1 cup butter, divided"), emit it as TWO separate ingredient entries with DISTINCT ids (e.g. "butter-1", "butter-2"), each with "note": "divided". If the text says how the quantity splits, split it; otherwise put the full quantity on the first entry, "" on the second, and set "uncertain": true on both.

TREE RULES:
- The tree encodes the order in which operations combine ingredients. A leaf { "ref": "<id>" } points to an ingredient by its id. An operation node { "op": "...", "children": [...] } combines its children.
- "op" is a short imperative label for the step (e.g. "cream", "whisk", "fold in", "bake"). Include a time or temperature in the op label ONLY if the source states it (e.g. "bake 12 min at 350°F").
- Every ingredient id must appear exactly once as a ref somewhere in the tree.
- Build the tree so the earliest operations (the deepest nodes) combine the first ingredients, and later operations build on earlier results, until a single root operation produces the finished dish.

Return only the JSON object.`;

// Bundle the browser frontend (app.ts + its imports) into a single JS file.
// Rebuilt on each request so local edits show up on refresh.
async function buildAppJs(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [`${ROOT}/app.ts`],
    target: "browser",
    minify: false,
  });
  if (!result.success) {
    const message = result.logs.map((l) => String(l)).join("\n");
    throw new Error(message || "app.ts build failed");
  }
  return await result.outputs[0].text();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Defensively extract a JSON object from the model's reply. The prompt asks for
// raw JSON, but we strip stray code fences / prose just in case.
function extractJson(text: string): unknown | null {
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      return JSON.parse(t.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function handleParse(req: Request): Promise<Response> {
  if (!API_KEY) {
    return jsonResponse(
      { error: "ANTHROPIC_API_KEY is not set. Create a .env file with ANTHROPIC_API_KEY=sk-ant-..." },
      500,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be JSON: { text: string }" }, 400);
  }

  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || !text.trim()) {
    return jsonResponse({ error: "Provide a non-empty { text: string }." }, 400);
  }

  let apiResp: Response;
  try {
    apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        system: PARSE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
  } catch (err) {
    return jsonResponse({ error: `Failed to reach the Anthropic API: ${String(err)}` }, 502);
  }

  if (!apiResp.ok) {
    const detail = await apiResp.text();
    return jsonResponse({ error: `Anthropic API error ${apiResp.status}`, detail }, 502);
  }

  const data = (await apiResp.json()) as { content?: Array<{ type: string; text?: string }> };
  const raw = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();

  const parsed = extractJson(raw);
  if (parsed === null) {
    return jsonResponse({ error: "The model did not return valid JSON.", raw }, 502);
  }
  return jsonResponse(parsed, 200);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(Bun.file(`${ROOT}/index.html`), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (req.method === "GET" && path === "/app.js") {
      try {
        const js = await buildAppJs();
        return new Response(js, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      } catch (err) {
        return new Response(`console.error(${JSON.stringify("Frontend build failed:\n" + String(err))});`, {
          status: 500,
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      }
    }

    if (req.method === "POST" && path === "/parse") {
      return handleParse(req);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`recipe-table running at http://localhost:${server.port}`);
if (!API_KEY) {
  console.log("⚠  ANTHROPIC_API_KEY is not set — /parse will return an error until you add a .env file.");
}
