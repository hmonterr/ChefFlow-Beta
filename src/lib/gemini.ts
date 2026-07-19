// lib/gemini.ts
import { Type } from "@google/genai";

// The Gemini API key must NEVER reach the browser. Inlining it here (via Vite
// `define`) leaked it into the public bundle and got the GCP project hijacked +
// suspended. All generation now goes through the server-side proxy /api/gemini,
// which injects the key and forces the model. VITE_API_BASE lets the SPA point at
// the functions host when it isn't served from the same origin (e.g. Wix iframe).
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '';

async function callGemini(payload: { contents: any; config?: any }): Promise<{ text: string }> {
  const res = await fetch(`${API_BASE}/api/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Preserve upstream status so geminiErrorMessage() still classifies 429/403/etc.
    const err: any = new Error(data?.error || `Gemini proxy error ${res.status}`);
    err.status = data?.status ?? res.status;
    throw err;
  }
  return { text: data.text ?? '' };
}

// Map a raw Gemini/SDK error to a specific, human-readable message. The UI shows
// this string verbatim in its "Extraction Failed" toast, so it must be readable
// AND distinct per cause: collapsing everything into one "AI service error" hid a
// 403 billing hold ("Lightning dunning ... PERMISSION_DENIED") for an entire
// debugging session. EMPTY_DATA is handled/re-thrown by callers, so it passes through.
export function geminiErrorMessage(error: any): string {
  if (error?.message === "EMPTY_DATA") return "EMPTY_DATA";
  const status = Number(error?.status);
  const msg = String(error?.message || "").toLowerCase();
  if (status === 401 || status === 403 || /permission_denied|api key|unauthenticated/.test(msg))
    return "AI access denied — check the Gemini API key and Google Cloud billing.";
  if (status === 429 || /quota|rate limit|resource_exhausted/.test(msg))
    return "AI is rate-limited or over quota — wait a moment and retry.";
  if (/fetch|network/.test(msg)) return "Network error reaching the AI service.";
  if (/timeout|deadline/.test(msg)) return "AI request timed out — try again.";
  return "AI service error — check the console for details.";
}

export async function extractRecipeData(input: string | { data: string; mimeType: string }, isUrl: boolean = false) {
  const isVisual = typeof input === 'object';

  const prompt = `Extract ingredients and a title from this recipe.
  ${isVisual ? "IMAGE INSTRUCTION: This is a photo of a recipe. Perform high-precision OCR. If handwriting is ambiguous, use culinary context to infer the most logical ingredient." : ""}
  
  For each ingredient, provide:
  - name: string
  - quantity: number
  - unit: string (e.g., bunch, can, clove, cup, ea, fl oz, g, gal, head, jar, kg, lb, ltr, ml, oz, pack, pint, quart, splash, Tbl, tsp, etc.)
  - category: one of [Bakery, Produce, Protein, Dairy, Frozen, Pantry]
  
  Also provide:
  - title: A short title. If the input is just ingredients, use "Added Items".
  
  RULES:
  - 1-TO-1 TRANSCRIBER MAPPING (CRITICAL): You must act as a literal transcriber. Every single bullet point or line in the recipe's "Ingredients" section MUST result in an extracted JSON object. Do not evaluate if an item is "important enough" or if it is "actually food". If it is a line item in the ingredients list (e.g., "Cooking spray", "Parchment paper", "Ice"), you MUST output it. [cite: 2]
  - THE COOKING SPRAY MANDATE (CRITICAL): You must explicitly recognize "Cooking spray", "Pan spray", or "Nonstick spray" as valid, required food ingredients. Do NOT classify them as tools or equipment. Do NOT strip the word "spray" thinking it is a prep action. Do NOT paraphrase them into "vegetable oil". If cooking spray is in the ingredients list, you MUST extract it exactly as written. [cite: 2]
  - INGREDIENTS LIST STRICT BOUNDARY: You MUST extract ONLY from the core "Ingredients" section. Do not add items that only appear as actions in the instructions. [cite: 2]
  - ZERO INFERENCE: Do not guess or add items not explicitly in the list. [cite: 2]
  - IMPLIED QUANTITIES (NO AMBIGUITY): If an item lacks a numeric quantity (e.g., "cooking spray"), default to quantity: 1, unit: "can" (or "ea"), and isAmbiguous: false. Do NOT flag it as ambiguous. [cite: 2]
  - AMBIGUITY PROTOCOL: Set isAmbiguous: true when EITHER the quantity OR the ingredient NAME is vague. (1) Vague QUANTITY — explicitly vague measurements like "a pinch", "to taste", "a dash", "some". (2) Vague NAME — short-form abbreviations or umbrella terms that map to multiple distinct retail products. Examples: "choco" (chocolate chips / chunks / baking bar / cocoa / wafers), "veggies", "spice", "nuts" (almond / cashew / mixed?), "berries" (strawberry / blueberry / mixed?), "milk product". Single-word abbreviations of a broader category are vague. When flagging, populate ambiguityReason describing the disambiguation (e.g. "Vague name: 'choco' could be chocolate chips / chunks / baking bar / cocoa / wafers") so the AmbiguityIntercept can present candidate options. Exceptions (do NOT flag): salt and pepper (THE PANTRY PINCH EXCEPTION), items with implied retail quantity like "cooking spray" (IMPLIED QUANTITIES rule). [cite: 2]
  - NOUN-FIRST INVERSION & CONTEXTUAL PREP DETECTION: Format ingredient names using a "Noun, Adjective" convention for better alphabetical sorting. Analyze the entire recipe text to differentiate: if a descriptor is an action performed in the recipe steps (e.g., "chopped", "melted"), STRIP it completely. If it is a required retail product, PRESERVE it. [cite: 2]
  - FLOURS: ALWAYS invert flour types. "Bread flour" MUST become "flour, bread" and "almond flour" MUST become "flour, almond". [cite: 2]
  - COMPOUND NOUNS: DO NOT invert compound nouns (e.g., "baking soda", "olive oil", "cream cheese"). [cite: 2]
  - EXTRACTS: "Vanilla" is the ingredient, "extract" is the state. Format "vanilla extract" as "vanilla, extract". [cite: 2]
  - BUTTER PREP PATTERNS (CRITICAL — beats COMPOUND NOUNS for butter): When butter is listed with a state-of-prep descriptor — "brown", "browned", "melted", "softened", "chilled", "room-temperature", "whipped", "creamed", "cooled" — the descriptor is PREP, not a retail variant. Output the canonical ingredient ("butter, unsalted" by default) and discard the prep word from the name. Retail descriptors for butter that ARE preserved via standard noun-first inversion: "salted", "unsalted", "European-style", "cultured". A dash, em-dash, or hyphen separating butter from a trailing word ("Butter — Brown, cool") signals the trailing text is prep.
  - BUTTER DEFAULT: When butter is listed without an explicit salted/unsalted indicator, default the output name to "butter, unsalted".
  - DUAL-UNIT PARSING: If an ingredient lists both a volume and a weight, prioritize the weight (grams) EXCEPT for liquids (milk, cream, water, oil, buttermilk, stock, broth), which MUST remain in volume (ml, cups, fl oz, etc). [cite: 2]
  - SUGAR NAMING: If the recipe specifies "sugar" or "granulated sugar" without a specific type, format it strictly as "sugar, white". [cite: 2]
  - PARENTHETICAL CLEANUP: Remove any notes in parentheses from the final name. [cite: 2]
  - UNIVERSAL CAPTURE: Do NOT filter, drop, or ignore non-food items of ANY kind. Extract normally and assign to "Needs Sorting". [cite: 2]
  - DISTINCT DESCRIPTORS NEVER MERGE (CRITICAL): Variants of the same base noun with different specifying adjectives are DISTINCT ingredients and MUST NOT be merged under CONSOLIDATE. Examples: "brown sugar" and "white sugar" are TWO separate ingredients. "Salted butter" and "unsalted butter" are TWO separate ingredients. "Bread flour" and "AP flour" are TWO separate ingredients. Output one JSON object per distinct variant. This rule beats CONSOLIDATE.
  - CONSOLIDATE & MERGE (NARROWED): Only merge when two entries share the SAME canonical name after noun-first inversion AND one entry is unquantified. Example: "1/4 cup unsalted butter" + "butter for brushing" → keep the quantified entry, drop the unquantified one. NEVER merge two fully-quantified lines even if they share a base noun.
  - Omit "Water" unless it is specifically described as "Sparkling", "Distilled", or "Mineral". [cite: 2]
  - EGG AGGREGATION (CRITICAL): Whole eggs, egg yolks, and egg whites ALL count toward the same aggregated ingredient. Output exactly ONE entry named "egg" with quantity = (whole_eggs + yolks + whites). Do NOT emit separate JSON objects for whole eggs and yolks (or whites). Examples: recipe lists "1 egg" + "1 yolk" → output ONE entry {name:"egg", quantity:2, unit:"ea"}. Recipe lists "2 eggs" + "3 whites" → output ONE entry {name:"egg", quantity:5, unit:"ea"}. Unit MUST be "ea" — downstream logic handles carton substitution; the prompt must not emit "carton" or "pack" units for eggs. [cite: 2]
  - THE PANTRY PINCH EXCEPTION: Never flag salt or ground pepper (black/white) as ambiguous. If the quantity is vague (e.g., "to taste", "freshly ground", "a pinch"), DO NOT generate warning text. Simply assign quantity: 1, unit: "pinch", and ensure any ambiguous flags are false.
  
  
  SCRAPING OPTIMIZATION:
  - If extracting from a URL, prioritize the "ld+json" recipe schema if available to filter out story text and comments. [cite: 2]
  
  Return as a JSON object with "title" and "ingredients" array.`;

  let requestParts: any[];
  if (isUrl) {
    requestParts = [
      { text: prompt },
      { text: `Extract from this URL: ${input}. Focus on the ld+json schema if present.` }
    ];
  } else if (typeof input === 'string') {
    requestParts = [{ text: prompt }, { text: input }];
  } else {
    requestParts = [
      { text: prompt }, 
      { inlineData: { data: input.data, mimeType: input.mimeType } }
    ];
  }

  try {
    const response = await callGemini({
      contents: [{ role: 'user', parts: requestParts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  category: { type: Type.STRING },
                  isAmbiguous: { type: Type.BOOLEAN, description: "Must be true if vague." },
                  ambiguityReason: { type: Type.STRING, description: "State reason." }
                },
                required: ["name", "quantity", "unit", "category", "isAmbiguous"]
              }
            }
          },
          required: ["ingredients"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"title": "Untitled Recipe", "ingredients": []}');
    
    if (!result.ingredients || result.ingredients.length === 0) {
      throw new Error("EMPTY_DATA");
    }

    result.ingredients = result.ingredients.map((item: any) => ({
      ...item,
      quantity: Number(item.quantity) || 1 
    }));

    return result;
  } catch (error: any) {
    console.error("Gemini Extraction Error:", error);
    if (error.message === "EMPTY_DATA") throw error;
    throw new Error(geminiErrorMessage(error));
  }
}

export async function parseSingleIngredient(input: string) {
  const prompt = `Parse this single ingredient string into structured data.
  Provide:
  - name: string
  - quantity: number
  - unit: string (e.g., bunch, can, clove, cup, ea, fl oz, g, gal, head, jar, kg, lb, ltr, ml, oz, pack, pint, quart, splash, Tbl, tsp, etc.)  - category: one of [Bakery, Produce, Protein, Dairy, Frozen, Pantry]
  
  RULES:
  - NOUN-FIRST INVERSION: Format ingredient names using a "Noun, Adjective" convention for better alphabetical sorting. Strip prep instructions (like "chopped" or "separated"), but keep defining modifiers after a comma.
    Examples: "Salted butter" -> "butter, salted", "Pastry flour" -> "flour, pastry", "Granulated cinnamon" -> "cinnamon, granulated", "Mexican cinnamon" -> "cinnamon, mexican", "Powdered sugar" -> "sugar, powdered".
  - COMPOUND NOUNS: DO NOT invert compound nouns. "Baking soda" must remain "baking soda", "baking powder" remains "baking powder", "olive oil" remains "olive oil", "peanut butter" remains "peanut butter", and "cream cheese" remains "cream cheese".
  - FLOURS: ALWAYS invert flour types. "Bread flour" MUST become "flour, bread" and "almond flour" MUST become "flour, almond".
  - EXTRACTS: "Vanilla" is the ingredient, "extract" is the state. Format "vanilla extract" as "vanilla, extract". Same for almond, peppermint, etc.
  - STRIP PREPARATION DESCRIPTORS: Remove words like "mashed", "melted", "softened", "diced", "chopped", "sliced", "divided", "toasted", "chilled", "room temperature", "sifted", "packed" from the ingredient name.
  - UNIVERSAL CAPTURE: Do NOT reject non-food, unidentifiable, or miscellaneous items of ANY kind (e.g., "paper towels", "dog food", "batteries"). Parse the input normally and strictly assign it to "Needs Sorting".
  - If you cannot classify a category, use "Needs Sorting".
  - For eggs, yolks, or whites, just list the total count of eggs.
  - THE PANTRY PINCH EXCEPTION: Never flag salt or ground pepper (black/white) as ambiguous. If the quantity is vague (e.g., "to taste", "freshly ground", "a pinch"), DO NOT generate warning text. Simply assign quantity: 1, unit: "pinch", and ensure any ambiguous flags are false.
  
  
  ZERO-OMISSION & AMBIGUITY PROTOCOL (CRITICAL):
  You must never hallucinate or guess numeric values if they are missing or vague.
  1. IMPLIED QUANTITIES (NO AMBIGUITY): If an item implies a standard singular retail package (e.g., "cooking spray", "pan spray"), you MUST default to quantity: 1, unit: "can" (or "ea"), and explicitly set isAmbiguous: false.
  2. If an ingredient has a precise number and unit (e.g., "2 cups milk"), set isAmbiguous: false and ambiguityReason: null.
  3. If an ingredient uses vague terminology ("a pinch of salt", "some garlic", "handful of nuts", "salt to taste", "some"):
     - Set isAmbiguous: true.
     - Set ambiguityReason to explain exactly what is missing (e.g., "Vague unit: handful", "No quantity").
     - Default the quantity to 1 and the unit to "ea" so the downstream math system does not crash.`;
  ;


  try {
    const response = await callGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: input }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            category: { type: Type.STRING },
            isAmbiguous: { type: Type.BOOLEAN },
            ambiguityReason: { type: Type.STRING }
          },
          required: ["name", "quantity", "unit", "category", "isAmbiguous"]
        }
      }
    });

    const result = JSON.parse(response.text || '{"name": "", "quantity": 1, "unit": "pcs", "category": "Needs Sorting"}');
    if (!result.name) throw new Error("EMPTY_DATA");
    result.quantity = Number(result.quantity) || 1;
    return result;
  } catch (error: any) {
    console.error("Gemini Single Parse Error:", error);
    if (error.message === "EMPTY_DATA") throw error;
    throw new Error(geminiErrorMessage(error));
  }
}

export async function categorizeIngredient(name: string) {
  const prompt = `Categorize this item into one of these grocery departments: [Bakery, Produce, Protein, Dairy, Frozen, Pantry].
  If the item does not strictly belong to one of these food categories, or if you are simply unsure, you MUST return "Needs Sorting".
  Return ONLY the category name as a plain string.`;

  try {
    const response = await callGemini({
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: name }] }]
    });

    return response.text?.trim() || "Needs Sorting";
  } catch (error: any) {
    console.error("Gemini Categorization Error:", error);
    return "Needs Sorting"; 
  }
}