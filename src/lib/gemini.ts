// lib/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function extractRecipeData(input: string | { data: string; mimeType: string }, isUrl: boolean = false) {
  const isVisual = typeof input === 'object';
  // SURGICAL FIX: Use the actual, live production endpoint
  const currentModel = "gemini-2.5-flash";
  
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
  - AMBIGUITY PROTOCOL: ONLY set isAmbiguous: true if the recipe uses explicitly vague measurements like "a pinch", "to taste", "a dash", or "some". [cite: 2]
  - NOUN-FIRST INVERSION & CONTEXTUAL PREP DETECTION: Format ingredient names using a "Noun, Adjective" convention for better alphabetical sorting. Analyze the entire recipe text to differentiate: if a descriptor is an action performed in the recipe steps (e.g., "chopped", "melted"), STRIP it completely. If it is a required retail product, PRESERVE it. [cite: 2]
  - FLOURS: ALWAYS invert flour types. "Bread flour" MUST become "flour, bread" and "almond flour" MUST become "flour, almond". [cite: 2]
  - COMPOUND NOUNS: DO NOT invert compound nouns (e.g., "baking soda", "olive oil", "cream cheese"). [cite: 2]
  - EXTRACTS: "Vanilla" is the ingredient, "extract" is the state. Format "vanilla extract" as "vanilla, extract". [cite: 2]
  - DUAL-UNIT PARSING: If an ingredient lists both a volume and a weight, prioritize the weight (grams) EXCEPT for liquids (milk, cream, water, oil, buttermilk, stock, broth), which MUST remain in volume (ml, cups, fl oz, etc). [cite: 2]
  - SUGAR NAMING: If the recipe specifies "sugar" or "granulated sugar" without a specific type, format it strictly as "sugar, white". [cite: 2]
  - PARENTHETICAL CLEANUP: Remove any notes in parentheses from the final name. [cite: 2]
  - UNIVERSAL CAPTURE: Do NOT filter, drop, or ignore non-food items of ANY kind. Extract normally and assign to "Needs Sorting". [cite: 2]
  - CONSOLIDATE & MERGE: Combine similar ingredients if they appear multiple times. If a recipe lists a highly specific item with a quantity (e.g., "1/4 cup unsalted butter") and later lists a generic version without a quantity (e.g., "butter for brushing"), you MUST merge them by keeping the specific item and dropping the generic, unquantified duplicate.  - Omit "Water" unless it is specifically described as "Sparkling", "Distilled", or "Mineral". [cite: 2]
  - For eggs, yolks, or whites, list the total count of eggs. [cite: 2]
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
    const response = await ai.models.generateContent({
      model: currentModel,
      // CRITICAL FIX: Wrap contents in an array with an explicit role
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
    if (error.message?.includes("fetch") || error.message?.includes("network")) throw new Error("NETWORK_ERROR");
    if (error.message?.includes("timeout") || error.message?.includes("deadline")) throw new Error("TIMEOUT_ERROR");
    throw new Error("AI_SERVICE_ERROR");
  }
}

export async function parseSingleIngredient(input: string) {
  // SURGICAL FIX: Live production endpoint
  const model = "gemini-2.5-flash";
  
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
    const response = await ai.models.generateContent({
      model,
      // CRITICAL FIX: Wrapped in Array
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
    throw new Error("AI_SERVICE_ERROR");
  }
}

export async function categorizeIngredient(name: string) {
  // SURGICAL FIX: Live production endpoint
  const model = "gemini-2.5-flash";
  
  const prompt = `Categorize this item into one of these grocery departments: [Bakery, Produce, Protein, Dairy, Frozen, Pantry].
  If the item does not strictly belong to one of these food categories, or if you are simply unsure, you MUST return "Needs Sorting".
  Return ONLY the category name as a plain string.`;
  
  try {
    const response = await ai.models.generateContent({
      model,
      // CRITICAL FIX: Wrapped in Array
      contents: [{ role: 'user', parts: [{ text: prompt }, { text: name }] }]
    });

    return response.text?.trim() || "Needs Sorting";
  } catch (error: any) {
    console.error("Gemini Categorization Error:", error);
    return "Needs Sorting"; 
  }
}