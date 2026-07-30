// app.ts
// Browser frontend. Bundled to /app.js by server.ts. Vanilla TS + plain DOM —
// no framework. All the interesting logic (the rowspan arithmetic) lives in
// render.ts, which this imports.

import { renderRecipeTable, type Recipe } from "./render";

const input = document.getElementById("input") as HTMLTextAreaElement;
const parseButton = document.getElementById("parse") as HTMLButtonElement;
const sampleButton = document.getElementById("sample") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const output = document.getElementById("output") as HTMLDivElement;

const SAMPLE_RECIPE = `Best Chocolate Chip Cookies
Makes about 24 cookies

Preheat oven to 350°F.
Line two baking sheets with parchment paper.

2 1/4 cups all-purpose flour
1 tsp baking soda
1 tsp salt
1 cup butter, softened
3/4 cup granulated sugar
3/4 cup packed brown sugar
2 large eggs
2 tsp vanilla extract
2 cups semisweet chocolate chips

Whisk together the flour, baking soda, and salt.
In a separate bowl, cream the butter with both sugars until fluffy.
Beat in the eggs and vanilla.
Gradually stir the flour mixture into the butter mixture.
Fold in the chocolate chips.
Drop spoonfuls onto the sheets and bake 10 to 12 minutes.`;

function setStatus(message: string, isError = false): void {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function render(recipe: Recipe): void {
  try {
    output.innerHTML = renderRecipeTable(recipe);
  } catch (err) {
    setStatus(`Could not render the parsed recipe: ${String(err)}`, true);
  }
}

async function parse(): Promise<void> {
  const text = input.value.trim();
  if (!text) {
    setStatus("Paste some recipe text first.", true);
    return;
  }

  parseButton.disabled = true;
  setStatus("Parsing…");
  output.innerHTML = "";

  try {
    const resp = await fetch("/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      const detail = data && typeof data === "object" && "error" in data ? data.error : resp.statusText;
      setStatus(`Parse failed: ${detail}`, true);
      return;
    }

    setStatus("Parsed.");
    render(data as Recipe);
  } catch (err) {
    setStatus(`Request failed: ${String(err)}`, true);
  } finally {
    parseButton.disabled = false;
  }
}

parseButton.addEventListener("click", () => {
  void parse();
});

sampleButton.addEventListener("click", () => {
  input.value = SAMPLE_RECIPE;
  setStatus("Sample loaded — click “Parse recipe”.");
});
