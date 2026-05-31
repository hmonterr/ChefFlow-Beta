import { Ingredient, UnitSystem } from '../types.ts';

/**
 * ==========================================
 * 🛒 DEPARTMENTAL RETAIL LOGIC (SSoT)
 * Protocol: Think Locally, Act Globally
 * ==========================================
 */

// ------------------------------------------
// 🥬 SECTION 1: PRODUCE
// ------------------------------------------
const FRESH_HERB_KEYWORDS = [
  'cilantro', 'parsley', 'basil', 'mint', 'dill', 
  'chives', 'tarragon', 'rosemary', 'thyme', 'oregano', 'sage'
];

// Citrus whose JUICE resolves to whole fruit ("ea"). Scoped to lime/lemon: their
// juice is bought as fresh fruit. Orange/grapefruit are excluded on purpose —
// their juice is bought as a carton/bottle, not counted whole. tbsp juice per fruit.
const JUICE_TO_WHOLE_FRUIT: Record<string, number> = { lime: 2, lemon: 2 };

// Citrus whose ZEST resolves to whole fruit ("ea"). Applies to ALL culinary citrus:
// zest is never sold on its own, so any zest means buying the whole fruit and
// grating it. tbsp zest per fruit (bigger fruit = more zest per piece).
const ZEST_TO_WHOLE_FRUIT: Record<string, number> = {
  lime: 1, lemon: 1, orange: 2, grapefruit: 3, mandarin: 1, clementine: 1, tangerine: 1,
};

const SOLID_PRODUCE_MPU: Record<string, { imperial: string; metric: string }> = {
  "mushrooms": { imperial: "8 oz container", metric: "250g container" }
};

const PRODUCE_ITEMS = ['banana', 'apple', 'lemon', 'onion', 'potato', 'tomato', 'garlic', 'lime', 'orange', 'bell pepper', 'cucumber'];

// ------------------------------------------
// 🧀 SECTION 2: DAIRY
// ------------------------------------------
const DAIRY_WEIGHT_SHIELD = ['cheese', 'gorgonzola', 'parmesan', 'feta', 'cheddar', 'butter', 'yogurt'];

// Butter is sold by weight, but recipes routinely call it out by VOLUME
// (sticks / cups / tablespoons). Without conversion the weight path reads the raw
// volume number as pounds — "16 tbsp" became "16 lb" → 256 oz, and tbsp+g sums
// exploded to thousands of oz. Standard butter density (1 cup = 227 g = 2 sticks):
//   1 stick = 113.5 g · 1 cup = 227 g · 1 tbsp = 14.2 g · 1 tsp = 4.73 g
// Checked longest-first so "tablespoon" wins before "tbl"/"tbsp" substrings.
const BUTTER_VOLUME_G: Array<[string, number]> = [
  ['tablespoon', 14.2], ['teaspoon', 4.73], ['stick', 113.5],
  ['cup', 227], ['tbsp', 14.2], ['tbl', 14.2], ['tsp', 4.73],
];
function butterVolumeToGrams(qty: number, unit: string): number | null {
  const u = unit.toLowerCase().trim();
  for (const [k, g] of BUTTER_VOLUME_G) if (u === k || u.includes(k)) return qty * g;
  return null; // not a recognized butter volume unit (weight units handled elsewhere)
}

// ------------------------------------------
// 🥫 SECTION 3: PANTRY & SPICES
// ------------------------------------------
const DRIED_INDICATORS = ['dried', 'ground', 'powder', 'dry', 'rubbed'];

const PANTRY_STAPLES = ['sugar', 'flour', 'salt', 'rice', 'pasta', 'baking powder', 'baking soda'];

const SPICES = ['cinnamon', 'cumin', 'paprika', 'nutmeg', 'clove', 'ginger', 'oregano', 'thyme', 'basil', 'pepper', 'chili', 'turmeric', 'coriander', 'cardamom', 'mustard'];

// ------------------------------------------
// 🛢️ SECTION 4: OILS & LIQUIDS
// ------------------------------------------
const STANDARD_OILS = [
  'olive oil', 'evoo', 'extra virgin olive oil', 'canola oil', 
  'grapeseed oil', 'vegetable oil', 'sunflower oil', 'avocado oil', 
  'corn oil', 'peanut oil', 'safflower oil',
  // INVERTED NOUNS (Required for Semantic Filter)
  'oil olive', 'oil canola', 'oil grapeseed', 'oil vegetable', 
  'oil sunflower', 'oil avocado', 'oil corn', 'oil peanut', 'oil safflower'
];


const MPU_EXCEPTIONS: Record<string, { 
  imperial: string; 
  metric: string; 
  threshold: number; 
  type?: string 
}> = {
  "baking soda": { imperial: "8 oz box", metric: "250g box", threshold: 8 },
  "baking powder": { imperial: "8 oz container", metric: "250g container", threshold: 8 },
  "salt": { imperial: "26 oz container", metric: "750g container", threshold: 26 },
  "sea salt": { imperial: "26 oz container", metric: "750g container", threshold: 26 },
  "vanilla extract": { imperial: "2 oz bottle", metric: "60ml bottle", threshold: 2 },
  "vanilla": { imperial: "2 oz bottle", metric: "60ml bottle", threshold: 2 },
  "bananas": { imperial: "ea", metric: "ea", threshold: 1, type: "count" },
  "banana": { imperial: "ea", metric: "ea", threshold: 1, type: "count" },
  "yeast": { imperial: "packet (0.25 oz ea)", metric: "packet (7g each)", threshold: 1, type: "count" },
  "cooking spray": { imperial: "can", metric: "can", threshold: 1, type: "count" }
};

const LIQUID_MPU = {
  Imperial: [8, 16, 32, 64, 128], // oz
  Metric: [250, 500, 1000, 2000], // ml
};

const WEIGHT_INCREMENTS = {
  Imperial: 0.5, // lb
  Metric: 250, // g
};

const COUNT_UNITS = ['pcs', 'each', 'piece', 'unit', 'bunch', 'whole', 'head', 'ea'];

const CONTAINER_WORDS = ['box', 'container', 'bottle', 'carton', 'jar', 'tin', 'bag', 'pack', 'pk'];

const PREP_DESCRIPTORS = [
  'mashed', 'melted', 'softened', 'diced', 'chopped', 'sliced', 'divided', 
  'toasted', 'chilled', 'room temperature', 'sifted', 'packed', 'large', 'medium', 'small'
];

export function formatDisplay(quantity: number, unit: string): string {
  const normalizedUnit = unit.toLowerCase();
  
  // 1. Word Check: Is it a recognized container? (bottle, jar, bag)
  const isContainer = CONTAINER_WORDS.some(word => normalizedUnit.includes(word));
  
  // 2. ACT GLOBALLY: Does the unit already contain a number? (e.g., "750ml", "8 oz", "1.5 oz")
  const hasEmbeddedSize = /\d/.test(normalizedUnit);
  
  // The Global "1" Suppressor (Resolves B-005)
  if (quantity === 1 && (isContainer || hasEmbeddedSize)) {
    return unit; // Strips the redundant "1 "
  }
  
  const formattedQty = quantity % 1 === 0 ? quantity : quantity.toFixed(1);
  return `${formattedQty} ${unit}`;
}

export function cleanIngredientName(name: string): string {
  let cleaned = name.toLowerCase().trim();
  
  // Sea Salt Override
  if (cleaned === 'salt' || cleaned === 'table salt') {
    cleaned = 'sea salt';
  }
  
  // Remove parentheticals
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();
  
  // Remove prep descriptors
  PREP_DESCRIPTORS.forEach(desc => {
    const regex = new RegExp(`\\b${desc}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  
  // Clean up extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function quantize(name: string, quantity: number | string, unit: string, system: UnitSystem, scale: number = 1): { 
  quantity: number; 
  unit: string; 
  mpuQuantity?: number; 
  mpuUnit?: string; 
  category?: string; 
  name?: string; 
  displayString?: string;
} {
  // 1. Execution Step 1: Normalization & Hard Overrides
  const parsedQty = typeof quantity === 'number' ? quantity : parseFloat(quantity as string) || 0;
  let totalQuantity = parsedQty * scale;

  let normalizedUnit = unit.toLowerCase().trim();
  const cleanedName = cleanIngredientName(name);
  const normalizedName = cleanedName.toLowerCase().trim();
  
  // Key Normalization (The Punctuation Strip)
  const searchKey = normalizedName.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const rootNoun = normalizedName.split(',')[0].trim();

  // ==========================================
  // 🥚 THE EGG OVERRIDE (Must remain isolated)
  // ==========================================
  if (searchKey.includes('egg') && !searchKey.includes('eggplant')) {
    const safeQty = typeof quantity === 'number' ? quantity : parseFloat(quantity as string) || 0;
    const totalQty = safeQty * scale;

    const cartons = Math.ceil(totalQty / 12);
    const displayAmount = cartons > 1 ? cartons : 1;
    const label = 'Carton (12pk)';
    return { 
      quantity: displayAmount, 
      unit: label, 
      mpuQuantity: displayAmount, 
      mpuUnit: label, 
      category: 'Dairy', 
      name: 'Eggs',
      displayString: formatDisplay(displayAmount, label)
    };
  } 

  // ==========================================
  // 🛡️ GLOBAL INTERCEPTORS (PRODUCE SHIELDS)
  // ==========================================

  // A. Global Fresh Herb Interceptor
  const isHerb = FRESH_HERB_KEYWORDS.some(h => searchKey.includes(h));
  const isDried = DRIED_INDICATORS.some(d => searchKey.includes(d));
  
  if (isHerb && !isDried) {
    return {
      quantity: 1,
      unit: 'bunch',
      mpuQuantity: 1,
      mpuUnit: 'bunch',
      category: 'Produce',
      displayString: formatDisplay(1, 'bunch'),
      name: cleanedName
    };
  }

  // B. Citrus Juice/Zest Interceptor (-> whole fruit "ea")
  // Think globally, act locally: a recipe's "1 tbsp orange zest" or "2 tbsp lime
  // juice" must land on the grocery list as countable whole fruit, never a liquid
  // container. Keyword match (not an exact-string lookup) so "fresh lime juice",
  // "zest of 2 limes", "blood orange zest", etc. all resolve. The form picks the
  // yield table: zest covers ALL citrus (zest is never sold alone); juice is scoped
  // to lime/lemon (orange/grapefruit juice is bought as a carton).
  // EXCEPTION: bottled/processed juice (bottle, concentrate, cordial, syrup) is
  // bought as the liquid the recipe names — keep it, do not convert to fresh fruit.
  const isZest = searchKey.includes('zest') || searchKey.includes('rind');
  const isProcessedJuice =
    searchKey.includes('bottle') || normalizedUnit.includes('bottle') ||
    searchKey.includes('concentrate') || searchKey.includes('cordial') ||
    searchKey.includes('syrup');
  const isJuice = searchKey.includes('juice') && !isProcessedJuice;
  const yieldTable = isZest ? ZEST_TO_WHOLE_FRUIT : isJuice ? JUICE_TO_WHOLE_FRUIT : null;
  const citrusFruit = yieldTable ? Object.keys(yieldTable).find(f => searchKey.includes(f)) : undefined;
  if (citrusFruit && yieldTable) {
    const tbspPerFruit = yieldTable[citrusFruit];

    // Convert the recipe amount to a whole-fruit count. Recognized volume units are
    // scaled by the fruit's yield. Count units (ea/whole/…) pass through unchanged —
    // load-bearing: it keeps consolidation's re-quantize of an already-counted value
    // idempotent. Unknown units (g, lb, …) leave fruitCount null so we fall through
    // to generic handling instead of treating the raw number as a fruit count
    // (e.g. "100 ml" must not become 100 fruit).
    const u = normalizedUnit;
    let tbspEquiv: number | null = null;
    if (u.includes('tbsp') || u.includes('tablespoon')) tbspEquiv = totalQuantity;
    else if (u.includes('tsp') || u.includes('teaspoon')) tbspEquiv = totalQuantity / 3;
    else if (u.includes('cup')) tbspEquiv = totalQuantity * 16;
    else if (u.includes('oz')) tbspEquiv = totalQuantity * 2; // fluid oz (covers "fl oz")
    else if (u.includes('ml')) tbspEquiv = totalQuantity / 14.79;

    const COUNT_UNITS = ['', 'ea', 'each', 'whole', 'pc', 'pcs', 'piece', 'pieces'];
    let fruitCount: number | null = null;
    if (tbspEquiv !== null) fruitCount = tbspEquiv / tbspPerFruit;
    else if (COUNT_UNITS.includes(u)) fruitCount = totalQuantity;

    if (fruitCount !== null && fruitCount > 0) {
      const finalQty = Math.ceil(fruitCount) || 1;
      return {
        quantity: finalQty,
        unit: 'ea',
        mpuQuantity: finalQty,
        mpuUnit: 'ea',
        category: 'Produce',
        name: cleanedName,
        displayString: formatDisplay(finalQty, 'ea')
      };
    }
  }

  // C. Solid Produce MPU Interceptor (Weight-over-Volume)
  if (SOLID_PRODUCE_MPU[searchKey]) {
    const label = system === 'Imperial' ? SOLID_PRODUCE_MPU[searchKey].imperial : SOLID_PRODUCE_MPU[searchKey].metric;
    return {
      quantity: 1,
      unit: label,
      displayString: formatDisplay(1, label),
      name: cleanedName
    };
  }

  // D. Bulletproof Garlic Override
  if (searchKey.includes('garlic') && !searchKey.includes('powder') && !searchKey.includes('salt')) {
    let heads = totalQuantity;
    if (normalizedUnit.includes('clove')) {
      heads = totalQuantity / 10; 
    }
    const displayHeads = Math.ceil(heads) || 1;
    
    return { 
      quantity: heads, 
      unit: 'head', 
      mpuQuantity: displayHeads, 
      mpuUnit: 'head', 
      category: 'Produce', 
      name: 'Garlic',
      displayString: formatDisplay(displayHeads, 'head')
    };
  }

// E. The Cracked Peppercorn Interceptor
  if (searchKey.includes('pepper') && searchKey.includes('cracked') && !searchKey.includes('bell')) {
    const jarLabel = system === 'Imperial' ? '1.5 oz jar' : '40g jar';
    return {
      quantity: 1,
      unit: jarLabel,
      displayString: formatDisplay(1, jarLabel),
      name: 'Black peppercorns, whole'
    };
  }

  // F. The Global Pantry Pinch Shield
  // Word-boundary salt match: "salt"/"sea salt" qualify, but "unsalted"/"salted"
  // (as in "butter, unsalted") must NOT — otherwise butter is mislabeled a pantry
  // pinch/staple and never reaches the dairy weight logic.
  const isPinchable = /\bsalt\b/.test(searchKey) ||
                      (searchKey.includes('pepper') && (searchKey.includes('black') || searchKey.includes('white')) && !searchKey.includes('bell') && !searchKey.includes('cracked') && !searchKey.includes('corn'));

  if (isPinchable) {
    let isTiny = false;
    if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) {
       if (totalQuantity < 24) isTiny = true;
    } else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon')) {
       if (totalQuantity < 8) isTiny = true;
    } else if (normalizedUnit.includes('cup')) {
       if (totalQuantity < 0.5) isTiny = true;
    } else if (normalizedUnit === 'oz' && totalQuantity < 4) {
       isTiny = true;
    } else if (normalizedUnit === 'g' && totalQuantity < 115) {
       isTiny = true;
    } else if (['ea', 'pinch', 'dash', 'pcs', ''].includes(normalizedUnit) && totalQuantity < 5) {
       isTiny = true; 
    }

    if (isTiny) {
      return {
        quantity: totalQuantity,
        unit: normalizedUnit,
        displayString: 'Pantry Staple',
        name: cleanedName
      };
    }
  }

  // 2. Execution Step 2: The Exception Dictionary (Format-Agnostic)
  let exception = MPU_EXCEPTIONS[searchKey];
  
  // Root Noun Fallback (Global Prevention)
  if (!exception) {
    if (rootNoun === "vanilla") {
      exception = MPU_EXCEPTIONS["vanilla extract"];
    } else if (rootNoun.includes("yeast")) {
      
      // --- THE YEAST BULK ESCALATION ALGORITHM ---
      let packets = totalQuantity;
      if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) {
         packets = totalQuantity / 2.25;
      } else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon')) {
         packets = (totalQuantity * 3) / 2.25; // 3 tsp per tbsp
      } else if (normalizedUnit.includes('cup')) {
         packets = (totalQuantity * 48) / 2.25; // 48 tsp per cup
      } else if (normalizedUnit === 'ml') {
         packets = (totalQuantity / 4.92) / 2.25; // ~4.92 ml per tsp
      } else if (normalizedUnit === 'g' || normalizedUnit === 'grams') {
         packets = totalQuantity / 7;
      } else if (normalizedUnit === 'oz' || normalizedUnit === 'ounces') {
         packets = totalQuantity / 0.25;
      } else if (normalizedUnit === 'lb' || normalizedUnit === 'lbs' || normalizedUnit === 'pound') {
         packets = (totalQuantity * 16) / 0.25; // 16 oz per lb
      }

     // Evaluate Tiers & Mutate Exception
      if (packets > 32) { 
        exception = { imperial: "bag (1 lb each)", metric: "bag (500g each)", threshold: 1, type: "count" };
        totalQuantity = (packets * 0.25) / 16;
      } else if (packets > 12) { 
        exception = { imperial: "jar (8 oz each)", metric: "jar (250g each)", threshold: 1, type: "count" };
        totalQuantity = (packets * 0.25) / 8;
      } else {
        exception = MPU_EXCEPTIONS["yeast"];
        totalQuantity = packets;
      }
      
      normalizedUnit = 'ea'; 
      // -------------------------------------------

    } else if (/\bsalt\b/.test(rootNoun)) {
      // Word boundary: "salt"/"sea salt" only. Guards against "unsalted butter"
      // (no-comma form) being routed to the salt-container exception.
      exception = MPU_EXCEPTIONS["salt"];
    } else if (rootNoun === "sugar") {
      
     // --- THE PANTRY PINCH RULE (Strictly Scoped to Salt) ---
      let isTiny = false;
      if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) {
         if (totalQuantity < 24) isTiny = true;
      } else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon')) {
         if (totalQuantity < 8) isTiny = true;
      } else if (normalizedUnit.includes('cup')) {
         if (totalQuantity < 0.5) isTiny = true;
      } else if (normalizedUnit === 'oz' && totalQuantity < 4) {
         isTiny = true;
      } else if (normalizedUnit === 'g' && totalQuantity < 115) {
         isTiny = true;
      } else if (['ea', 'pinch', 'dash', 'pcs', ''].includes(normalizedUnit) && totalQuantity < 5) {
         isTiny = true; // Catches 0 ea, 1 ea, or "a pinch" of salt
      }

      if (isTiny) {
        return {
          quantity: totalQuantity,
          unit: normalizedUnit,
          displayString: 'Pantry Staple',
          name: cleanedName
        };
      }
      exception = MPU_EXCEPTIONS["salt"];
      // --------------------------------------------------------

    } else if (rootNoun === "sugar") {
      // Sugar fallback: 1 lb bag / 500g bag
      exception = { imperial: "1 lb bag", metric: "500g bag", threshold: 1 };
    } else if (rootNoun === "baking soda") {
      exception = MPU_EXCEPTIONS["baking soda"];
    } else if (rootNoun === "baking powder") {
      exception = MPU_EXCEPTIONS["baking powder"];
    }
  }

  if (exception) {
    const label = system === 'Imperial' ? exception.imperial : exception.metric;
    if (exception.type === 'count') {
      const qty = Math.ceil(totalQuantity);
      return {
        quantity: qty,
        unit: label,
        displayString: formatDisplay(qty, label),
        name: cleanedName
      };
    }
    return {
      quantity: totalQuantity,
      unit: unit,
      mpuQuantity: 1, // One container
      mpuUnit: label,
      displayString: formatDisplay(1, label),
      name: cleanedName
    };
  }

  // 3. Execution Step 3: Global Count Protection (The Banana Fix)
  const nonMathUnits = ['ea', 'pcs', 'count', 'whole', 'half', 'bunch', 'head', 'heads', 'sprig', 'sprigs', 'piece', 'unit'];
  if (nonMathUnits.includes(normalizedUnit)) {
    const qty = Math.ceil(totalQuantity);
    return {
      quantity: qty,
      unit: normalizedUnit,
      displayString: formatDisplay(qty, normalizedUnit),
      name: cleanedName
    };
  }

  // 4. Execution Step 4: Standard Math Conversions
  
  if (searchKey.includes('mustard') && !searchKey.includes('seed') && !searchKey.includes('powder') && !searchKey.includes('dry')) {
    let oz = totalQuantity;
    
    // Normalize any unit into Ounces
    if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon') || normalizedUnit === 'tbl') oz = totalQuantity * 0.5;
    else if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) oz = totalQuantity * 0.166667;
    else if (normalizedUnit.includes('cup')) oz = totalQuantity * 8;
    else if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters') oz = totalQuantity / 29.573;
    else if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams') oz = totalQuantity / 28.35; // Convert metric weight to oz
    
    // The 7.5oz Baseline
    if (oz <= 7.5) {
      return {
        quantity: 1,
        unit: 'jar',
        mpuQuantity: 1,
        mpuUnit: 'jar',
        name: cleanedName,
        displayString: formatDisplay(1, 'jar')
      };
    } else {
      // If it exceeds 7.5oz, calculate how many jars are needed
      const jars = Math.ceil(oz / 7.5);
      return {
        quantity: oz,
        unit: 'oz',
        mpuQuantity: jars,
        mpuUnit: 'jar',
        name: cleanedName,
        displayString: formatDisplay(jars, 'jar')
      };
    }
  }

// --- 5. The Oil & Condiment Rule (Mustard/Oils) ---
  const isStandardOil = STANDARD_OILS.some(oil => searchKey.includes(oil));
  const isSpecialtyOil = [
  'sesame oil', 'truffle oil', 'chili oil', 'walnut oil', 
  'oil sesame', 'oil truffle', 'oil chili', 'oil walnut', 'oil mustard seed'
].some(oil => searchKey.includes(oil));
  const isEVOO = searchKey.includes('extra virgin') || searchKey.includes('evoo');
  const isMustard = searchKey.includes('mustard') && !searchKey.includes('seed') && !searchKey.includes('powder');

  if (isStandardOil || isSpecialtyOil || isEVOO || isMustard) {
    let oz = totalQuantity;
    
// Robust Liquid Normalization
      if (normalizedUnit.includes('tbl') || normalizedUnit.includes('tbsp')) oz = totalQuantity * 0.5;
      else if (normalizedUnit.includes('cup')) oz = totalQuantity * 8;
      else if (normalizedUnit.includes('ml')) oz = totalQuantity / 29.573;
      else if (normalizedUnit.includes('l')) oz = totalQuantity * 33.814;
      // THE DROPZONE FIX: Teach the math engine the volume of a retail container
      else if (normalizedUnit.includes('bottle')) oz = totalQuantity * (isSpecialtyOil ? 8 : 16);
      else if (normalizedUnit.includes('jar') && isMustard) oz = totalQuantity * 7.5;

    // Default to Standard Oil
    let mpuSize = 16; let mpuLabel = '16 oz bottle';
    
    // Imperial Overrides
    if (isSpecialtyOil) { mpuSize = 8; mpuLabel = '8 oz bottle'; }
    if (isMustard) { mpuSize = 7.5; mpuLabel = 'jar'; }
    
    // Metric Overrides
    if (system === 'Metric') {
      mpuSize = isSpecialtyOil ? 250 : 500;
      mpuLabel = `${mpuSize}ml bottle`;
      if (isMustard) mpuLabel = 'jar'; 
    }

    const divisor = system === 'Imperial' ? mpuSize : mpuSize / 29.573;
    const bottles = Math.ceil(oz / divisor) || 1;
    
    return { 
      quantity: oz, 
      unit: system === 'Imperial' ? 'oz' : 'ml', 
      mpuQuantity: bottles, 
      mpuUnit: mpuLabel, 
      displayString: formatDisplay(bottles, mpuLabel), 
      name: cleanedName 
    };
  }

  // The Spice Rule (Weight over Volume)
  if (SPICES.some(spice => normalizedName.includes(spice))) {
    // Standard Spice Jar: 1.5oz / 40g
    const jarSize = system === 'Imperial' ? 1.5 : 40;
    const jarUnit = system === 'Imperial' ? 'oz jar' : 'g jar';
    
    // If it's a huge amount (e.g. bulk), step to larger jars
    let mpuQuantity = 1;
    if (system === 'Imperial') {
      // Rough conversion if volume was provided
      let oz = totalQuantity;
      if (normalizedUnit.includes('tbsp')) oz = totalQuantity * 0.5;
      else if (normalizedUnit.includes('tsp')) oz = totalQuantity * 0.16;
      
      if (oz > 1.5) {
        mpuQuantity = Math.ceil(oz / 3);
        const label = `${mpuQuantity} 3 oz jars`;
        return { quantity: oz, unit: 'oz', mpuQuantity, mpuUnit: '3 oz jar', displayString: formatDisplay(mpuQuantity, '3 oz jar'), name: cleanedName };
      }
    } else {
      let g = totalQuantity;
      if (normalizedUnit.includes('tbsp')) g = totalQuantity * 15;
      else if (normalizedUnit.includes('tsp')) g = totalQuantity * 5;
      
      if (g > 40) {
        mpuQuantity = Math.ceil(g / 80);
        const label = `${mpuQuantity} 80g jars`;
        return { quantity: g, unit: 'g', mpuQuantity, mpuUnit: '80g jar', displayString: formatDisplay(mpuQuantity, '80g jar'), name: cleanedName };
      }
    }

    const label = system === 'Imperial' ? '1.5 oz jar' : '40g jar';
    return { 
      quantity: 1, 
      unit: label, 
      mpuQuantity: 1, 
      mpuUnit: label, 
      displayString: formatDisplay(1, label),
      name: cleanedName 
    };
  }

  // Produce Rule (Weight to Piece fallback)
  if (PRODUCE_ITEMS.some(p => normalizedName.includes(p))) {
    const isWeight = ['lb', 'oz', 'g', 'kg'].includes(normalizedUnit);
    if (isWeight) {
      let lbs = totalQuantity;
      if (normalizedUnit === 'oz') lbs = totalQuantity / 16;
      else if (normalizedUnit === 'g') lbs = totalQuantity * 0.00220462;
      else if (normalizedUnit === 'kg') lbs = totalQuantity * 2.20462;

      if (lbs < 3) {
        const ea = Math.ceil(lbs * 2);
        return { 
          quantity: ea, 
          unit: 'ea', 
          name: cleanedName,
          displayString: formatDisplay(ea, 'ea')
        };
      }
    }
  }

  // Pantry Rounding for staples. Word-boundary match so a staple token is only
  // hit as a whole word: critical for 'salt', which otherwise matches the "salt"
  // inside "unsalted"/"salted" and drags "butter, unsalted" into grain/flour
  // pound-rounding instead of the dairy weight shield below.
  if (PANTRY_STAPLES.some(staple => new RegExp(`\\b${staple}\\b`).test(normalizedName))) {
    if (system === 'Imperial') {
      let lbs = totalQuantity;
      if (normalizedUnit === 'g' || normalizedUnit === 'gram' || normalizedUnit === 'grams') lbs = totalQuantity * 0.00220462;
      else if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') lbs = totalQuantity * 2.20462;
      else if (normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') lbs = totalQuantity / 16;
      
      const mpu = Math.ceil(lbs / 1) * 1; // Round to nearest 1lb
      return { 
        quantity: lbs, 
        unit: 'lb', 
        mpuQuantity: mpu, 
        mpuUnit: 'lb', 
        name: cleanedName,
        displayString: formatDisplay(mpu, 'lb')
      };
    } else {
      let grams = totalQuantity;
      if (normalizedUnit === 'lb' || normalizedUnit === 'pound' || normalizedUnit === 'pounds') grams = totalQuantity * 453.59;
      else if (normalizedUnit === 'oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') grams = totalQuantity * 28.35;
      else if (normalizedUnit === 'kg' || normalizedUnit === 'kilogram' || normalizedUnit === 'kilograms') grams = totalQuantity * 1000;

      // Dry Goods (Metric) Stepping
      let mpu: number;
      if (grams <= 500) mpu = 500;
      else if (grams <= 1000) mpu = 1000;
      else mpu = Math.ceil(grams / 500) * 500;

      const finalQty = mpu >= 1000 ? mpu / 1000 : mpu;
      const finalUnit = mpu >= 1000 ? 'kg' : 'g';
      return { 
        quantity: grams, 
        unit: 'g', 
        mpuQuantity: finalQty, 
        mpuUnit: finalUnit, 
        name: cleanedName,
        displayString: formatDisplay(finalQty, finalUnit)
      };
    }
  }

  // Baking chips (chocolate / white / butterscotch chips, chunks, morsels) are a
  // SOLID sold by weight in ~12 oz bags — not a liquid. Without this they hit the
  // cup->fluid-oz liquid path and showed "16 oz (1 Pint)". Convert volume by weight
  // (1 cup chips = 6 oz), round UP to a 12 oz bag, and show the weight only.
  const isBakingChip =
    (searchKey.includes('chocolate') || searchKey.includes('butterscotch')) &&
    (searchKey.includes('chip') || searchKey.includes('chop') || searchKey.includes('chunk') || searchKey.includes('morsel'));
  if (isBakingChip) {
    const u = normalizedUnit;
    let oz = totalQuantity;
    if (u.includes('cup')) oz = totalQuantity * 6;
    else if (u.includes('tbsp') || u.includes('tbl') || u.includes('tablespoon')) oz = totalQuantity * 0.375;
    else if (u.includes('tsp') || u.includes('teaspoon')) oz = totalQuantity * 0.125;
    else if (u.includes('lb') || u.includes('pound')) oz = totalQuantity * 16;
    else if (u.includes('kg')) oz = totalQuantity * 35.274;
    else if (u === 'g' || u.includes('gram')) oz = totalQuantity / 28.3495;
    // else: already oz (or unknown) — treat the number as oz
    const bagOz = Math.max(1, Math.ceil(oz / 12 - 1e-6)) * 12; // round up to 12 oz bags
    return {
      quantity: bagOz, unit: 'oz', mpuQuantity: bagOz, mpuUnit: 'oz',
      name: cleanedName, displayString: `${bagOz} oz`,
    };
  }

  // Liquid Logic (With Dairy Shield)
  // The shield is for SOLID dairy (cheese, butter, yogurt). "buttermilk" contains
  // the substring "butter" and would be wrongly shielded into weight handling —
  // it is a liquid, sold by the carton/quart, so exclude it and let it fall to the
  // liquid retail stepping below.
  const isSolidDairy = DAIRY_WEIGHT_SHIELD.some(k => searchKey.includes(k)) && !/butter\s*milk/.test(searchKey);

  // Butter measured by volume -> weight (the retail unit). Convert up front so the
  // weight path treats it as grams, not as raw pounds. Scoped to butter; other
  // solid dairy keeps its existing handling.
  if (isSolidDairy && searchKey.includes('butter')) {
    const g = butterVolumeToGrams(totalQuantity, normalizedUnit);
    if (g !== null) { totalQuantity = g; normalizedUnit = 'g'; }
  }

  if (!isSolidDairy && ['oz', 'fl oz', 'ounce', 'ounces', 'cup', 'cups', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'tbsp', 'tbl', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons'].includes(normalizedUnit)) {
    if (system === 'Imperial') {
      let oz = totalQuantity;
      if (normalizedUnit.includes('cup')) oz = totalQuantity * 8;
      else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tbl') || normalizedUnit.includes('tablespoon')) oz = totalQuantity * 0.5;
      else if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) oz = totalQuantity * 0.166667;
      else if (normalizedUnit === 'ml' || normalizedUnit === 'milliliter' || normalizedUnit === 'milliliters') oz = totalQuantity / 29.573;
      else if (normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters') oz = (totalQuantity * 1000) / 29.573;
      
      // MPU Stepping (Imperial)
      let mpuUnit: string;
      let mpuQuantity: number;

      if (oz <= 8) { mpuUnit = '8 oz (Half Pint)'; mpuQuantity = 1; }
      else if (oz <= 16) { mpuUnit = '16 oz (1 Pint)'; mpuQuantity = 1; }
      else if (oz <= 32) { mpuUnit = '32 oz (1 Quart)'; mpuQuantity = 1; }
      else if (oz <= 64) { mpuUnit = '64 oz (Half Gallon)'; mpuQuantity = 1; }
      else {
        mpuQuantity = Math.ceil(oz / 128);
        mpuUnit = mpuQuantity === 1 ? 'Gallon' : 'Gallons';
      }

      return { 
        quantity: oz, 
        unit: 'oz', 
        mpuQuantity, 
        mpuUnit, 
        name: cleanedName,
        displayString: formatDisplay(mpuQuantity, mpuUnit)
      };
    } else {
      let ml = totalQuantity;
      if (normalizedUnit.includes('cup')) ml = totalQuantity * 240;
      else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tbl') || normalizedUnit.includes('tablespoon')) ml = totalQuantity * 15;
      else if (normalizedUnit.includes('tsp') || normalizedUnit.includes('teaspoon')) ml = totalQuantity * 5;
      else if (normalizedUnit === 'oz' || normalizedUnit === 'fl oz' || normalizedUnit === 'ounce' || normalizedUnit === 'ounces') ml = totalQuantity * 29.573;
      else if (normalizedUnit === 'l' || normalizedUnit === 'liter' || normalizedUnit === 'liters') ml = totalQuantity * 1000;
      
      // Liquid (Metric) Stepping: 250 -> 500 -> 1000 -> 2000...
      let mpu: number;
      if (ml <= 250) mpu = 250;
      else if (ml <= 500) mpu = 500;
      else if (ml <= 1000) mpu = 1000;
      else if (ml <= 2000) mpu = 2000;
      else mpu = Math.ceil(ml / 1000) * 1000;

      const finalQty = mpu >= 1000 ? mpu / 1000 : mpu;
      const finalUnit = mpu >= 1000 ? 'L' : 'ml';
      return { 
        quantity: ml, 
        unit: 'ml', 
        mpuQuantity: finalQty, 
        mpuUnit: finalUnit, 
        name: cleanedName,
        displayString: formatDisplay(finalQty, finalUnit)
      };
    }
  }

  // Weight Logic (With Dairy Catch)
  if (isSolidDairy || ['lb', 'pound', 'pounds', 'oz', 'ounce', 'ounces', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms'].includes(normalizedUnit)) {
    if (system === 'Imperial') {
      let lbs = totalQuantity;
      if (normalizedUnit.includes('oz') || normalizedUnit.includes('ounce')) lbs = totalQuantity / 16;
      else if (normalizedUnit.includes('g')) lbs = totalQuantity * 0.00220462;
      else if (normalizedUnit.includes('kg')) lbs = totalQuantity * 2.20462;
      else if (normalizedUnit.includes('cup') && isSolidDairy) lbs = (totalQuantity * 4) / 16; 

      // --- BUTTER RETAIL MPU (IMPERIAL) ---
      // Butter is sold in 1 lb boxes (4 sticks), not loose ounces — "6 oz" isn't a
      // buyable unit. Round UP to whole pounds, minimum one box. Volume units were
      // already normalized to grams upstream; the epsilon keeps an exact 1 lb / 16 oz
      // from tipping into 2 boxes via float drift.
      if (searchKey.includes('butter')) {
        const grams =
          (normalizedUnit.includes('oz') || normalizedUnit.includes('ounce')) ? totalQuantity * 28.3495 :
          normalizedUnit.includes('kg') ? totalQuantity * 1000 :
          (normalizedUnit.includes('lb') || normalizedUnit.includes('pound')) ? totalQuantity * 453.592 :
          totalQuantity; // grams
        const lb = Math.max(1, Math.ceil(grams / 453.592 - 1e-6));
        return {
          quantity: grams / 453.592, unit: 'lb', mpuQuantity: lb, mpuUnit: 'lb',
          name: cleanedName,
          displayString: `${lb} lb`,
        };
      }

      // --- SURGICAL CHEESE OVERRIDE (IMPERIAL) ---
      if (isSolidDairy) {
        const mpuOz = Math.max(4, Math.ceil(lbs * 16)); // 1oz steps, 4oz floor
        return { quantity: lbs * 16, unit: 'oz', mpuQuantity: mpuOz, mpuUnit: 'oz', name: cleanedName, displayString: formatDisplay(mpuOz, 'oz') };
      }

      const mpu = Math.ceil(lbs / WEIGHT_INCREMENTS.Imperial) * WEIGHT_INCREMENTS.Imperial;
      return { 
        quantity: lbs, 
        unit: 'lb', 
        mpuQuantity: mpu, 
        mpuUnit: 'lb', 
        name: cleanedName,
        displayString: formatDisplay(mpu, 'lb')
      };
    } else {
      let grams = totalQuantity;
      if (normalizedUnit.includes('lb') || normalizedUnit.includes('pound')) grams = totalQuantity * 453.59;
      else if (normalizedUnit.includes('oz') || normalizedUnit.includes('ounce')) grams = totalQuantity * 28.35;
      else if (normalizedUnit.includes('kg')) grams = totalQuantity * 1000;
      else if (normalizedUnit.includes('cup') && isSolidDairy) grams = totalQuantity * 115;

      // --- SURGICAL CHEESE OVERRIDE (METRIC) ---
      if (isSolidDairy) {
        const mpuGrams = Math.max(115, Math.ceil(grams / 25) * 25); // 25g steps, 115g floor
        return { quantity: grams, unit: 'g', mpuQuantity: mpuGrams, mpuUnit: 'g', name: cleanedName, displayString: formatDisplay(mpuGrams, 'g') };
      }

      let mpu: number;
      if (grams <= 500) mpu = 500;
      else if (grams <= 1000) mpu = 1000;
      else mpu = Math.ceil(grams / 500) * 500;

      const finalQty = mpu >= 1000 ? mpu / 1000 : mpu;
      const finalUnit = mpu >= 1000 ? 'kg' : 'g';
      return { 
        quantity: grams, 
        unit: 'g', 
        mpuQuantity: finalQty, 
        mpuUnit: finalUnit, 
        name: cleanedName,
        displayString: formatDisplay(finalQty, finalUnit)
      };
    }
  }

  // Discrete / Each
  if (['unit', 'each', 'piece', 'pcs', 'ea', ''].includes(normalizedUnit)) {
    const qty = Math.ceil(totalQuantity);
    return { 
      quantity: qty, 
      unit: 'ea', 
      name: cleanedName,
      displayString: formatDisplay(qty, 'ea')
    };
  }

  const finalQty = totalQuantity % 1 === 0 ? totalQuantity : Number(totalQuantity.toFixed(1));
  return { 
    quantity: finalQty, 
    unit, 
    name: cleanedName,
    displayString: formatDisplay(finalQty, unit)
  };
}

export function shouldOmit(name: string): boolean {
  const normalizedName = name.toLowerCase();
  // The "Water" Rule
  if (normalizedName === 'water') {
    return true;
  }
  // Keep if specific water
  if (normalizedName.includes('water') && (normalizedName.includes('sparkling') || normalizedName.includes('distilled') || normalizedName.includes('mineral'))) {
    return false;
  }
  if (normalizedName.includes('water')) return true;
  
  return false;
}

// ==========================================
// THE NOUN INVERSION MAP (Standardizes taxonomy)
// ==========================================
const NOUN_INVERSIONS: Record<string, string> = {
  // --- EVOO Variations & Gemini Sabotage Catchers ---
  'evoo': 'Oil, olive extra virgin',
  'extra virgin olive oil': 'Oil, olive extra virgin',
  'olive oil, extra virgin': 'Oil, olive extra virgin', // Catches Gemini Inversion
  'olive oil extra virgin': 'Oil, olive extra virgin',
  'oil, extra virgin olive': 'Oil, olive extra virgin',
  'oil, olive extra virgin': 'Oil, olive extra virgin',
  
  // --- Standard Oils ---
  'olive oil': 'Oil, olive',
  'oil, olive': 'Oil, olive',
  'truffle oil': 'Oil, truffle',
  'oil, truffle': 'Oil, truffle',
  'sesame oil': 'Oil, sesame',
  'oil, sesame': 'Oil, sesame',
  'mustard seed oil': 'Oil, mustard seed',
  'canola oil': 'Oil, canola',
  'vegetable oil': 'Oil, vegetable',
  'avocado oil': 'Oil, avocado',
  'peanut oil': 'Oil, peanut',
  'grapeseed oil': 'Oil, grapeseed'
};

// Collapse simple English plurals so "Apple" (recipe) and "Apples" (manual add)
// share ONE consolidation key and sum to 5. Used ONLY to build the merge key —
// never the display name, so a non-word stem (e.g. "molass") is harmless: both
// spellings map to the same token, so they self-merge. The point is consistency
// (singular and plural reduce to the same string), not grammatical correctness.
// Guards skip words where a trailing "s" is NOT a plural: -ss (molasses), -us
// (asparagus, couscous, hummus, citrus), -is (chassis), -ous. Last-word handling
// is implicit — multi-word names ("green onions" → "green onion") strip cleanly.
function singularizeKey(s: string): string {
  const w = s.toLowerCase().trim();
  if (w.length < 4) return w;                          // too short to safely strip ("oat" vs "oats" still works at 4)
  if (/(ss|us|is|ous)$/.test(w)) return w;             // molasses, asparagus, couscous, citrus
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';     // berries → berry, cherries → cherry
  if (/(ses|xes|zes|ches|shes|oes)$/.test(w)) return w.slice(0, -2); // tomatoes→tomato, boxes→box, dishes→dish, glasses→glass
  if (/s$/.test(w)) return w.slice(0, -1);             // apples → apple, eggs → egg
  return w;
}

export function consolidateIngredients(ingredients: Ingredient[], system: UnitSystem = 'Imperial'): Ingredient[] {
  const map = new Map<string, Ingredient>();
  if (!ingredients || !Array.isArray(ingredients)) return [];

  // Helper to extract numeric size from MPU strings (e.g., "16" from "16 oz bottle")
  const extractSize = (u: string, fallback: number) => {
    const match = u.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[0]) : fallback;
  };

  // THE FIX: Sort keys by length descending to ensure "extra virgin olive oil" matches before "olive oil"
  const sortedInversionKeys = Object.keys(NOUN_INVERSIONS).sort((a, b) => b.length - a.length);

  ingredients.forEach(item => {
    const rawName = (item.name || 'Unknown').toLowerCase().trim();
    let key: string;
    
    // --- 1. THE SHIELD: Protect already-inverted oils from being downgraded ---
    if (rawName.startsWith('oil,')) {
       key = rawName;
    } else {
       // --- 2. THE DICTIONARY: Check for specific matches ---
       const mappedMatch = sortedInversionKeys.find(k => rawName === k || rawName.includes(k));
       
       if (mappedMatch) {
          item.name = NOUN_INVERSIONS[mappedMatch]; 
          key = item.name.toLowerCase();            
       } else {
          // --- 3. THE FALLBACK: Use the full cleaned name as the key so distinct
          //     descriptors stay distinct ("sugar, brown" ≠ "sugar, white",
          //     "butter, salted" ≠ "butter, unsalted"). The prompt layer already
          //     dedupes generic + quantified variants, so dropping the comma-strip
          //     here does not regress that path.
          // singularizeKey collapses plural drift ("Apple" recipe vs "Apples"
          //     manual add, or two recipes that disagree) so they sum correctly.
          key = singularizeKey(cleanIngredientName(rawName).toLowerCase().trim());
       }
    }

    if (map.has(key)) {
      const existing = map.get(key)!;
      
      // KILL THE "116" GLITCH
      const safeAdd = Number(item.quantity) || 0;
      const currentQty = Number(existing.quantity) || 0;
      
      const exUnit = (existing.unit || '').toLowerCase();
      const itUnit = (item.unit || '').toLowerCase();
      
      // BOTTLE-AWARE LIQUID DETECTION.
      // Pure weight units are excluded FIRST: the old list matched 'l' as a
      // substring, so "lb" (pounds) tested as liquid and got run through toOz/toMl
      // as if it were LITERS (x33.814). Mixed-unit recipe sums then exploded —
      // 1 lb + 12 oz -> "3 lb", and several recipes mixing g/oz/cup/lb compounded
      // to "674 oz". Excluding lb/g/kg here lets the weight branch below handle them.
      const isLiq = (u: string) =>
        !/^(lb|lbs|pound|pounds|g|gram|grams|kg|kilogram|kilograms)$/.test(u) &&
        ['cup', 'tbsp', 'tbl', 'tsp', 'oz', 'ml', 'l', 'bottle', 'jar'].some(l => u.includes(l));
      // WEIGHT DETECTION (checked AFTER liquid so 'oz' resolves as fluid when both
      // sides are liquid). Catches the round-trip corruption: quantize normalizes a
      // running weight total to 'oz' on the first merge, then the next raw 'g' item
      // gets naive-added to that oz number — mixing scales and inflating the total
      // (e.g. 508 g of butter rendering as "237 oz" / "169 lb"). Align to grams first.
      const isWt = (u: string) => ['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds'].some(w => u.includes(w));
      
      // --- 2. SYSTEM-AWARE UNIT ALIGNMENT ---
      // Butter first: it sums in grams no matter how each source expressed it
      // (stick/cup/tbsp/oz/lb/g). Volume units go through butter density; weight
      // units convert normally. Without this, tbsp+g naive-added then re-quantized
      // as pounds exploded (8 tbsp + 227 g -> "3760 oz").
      const mergeName = (existing.name || '').toLowerCase();
      const isButter = mergeName.includes('butter') && !/butter\s*milk/.test(mergeName);
      const toButterG = (qty: number, u: string) => {
         const v = butterVolumeToGrams(qty, u);
         if (v !== null) return v;
         if (u.includes('kg')) return qty * 1000;
         if (u.includes('lb') || u.includes('pound')) return qty * 453.59;
         if (u.includes('oz') || u.includes('ounce')) return qty * 28.35;
         return qty; // grams
      };
      if (isButter) {
         existing.quantity = toButterG(currentQty, exUnit) + toButterG(safeAdd, itUnit);
         existing.unit = 'g';
      } else if (exUnit !== itUnit && isLiq(exUnit) && isLiq(itUnit)) {
         if (system === 'Metric') {
            const toMl = (qty: number, u: string) => {
               if (u.includes('bottle')) return qty * extractSize(u, 500);
               if (u.includes('jar')) return qty * extractSize(u, 250);
               if (u.includes('cup')) return qty * 240;
               if (u.includes('tbsp') || u === 'tbl') return qty * 15;
               if (u.includes('tsp')) return qty * 5;
               if (u.includes('oz')) return qty * 29.573;
               if (u.includes('l')) return qty * 1000;
               return qty;
            };
            existing.quantity = toMl(currentQty, exUnit) + toMl(safeAdd, itUnit);
            existing.unit = 'ml';
         } else {
            const toOz = (qty: number, u: string) => {
               if (u.includes('bottle')) return qty * extractSize(u, 16);
               if (u.includes('jar')) return qty * extractSize(u, 7.5);
               if (u.includes('cup')) return qty * 8;
               if (u.includes('tbsp') || u === 'tbl') return qty * 0.5;
               if (u.includes('tsp')) return qty * 0.16;
               if (u.includes('ml')) return qty / 29.573;
               if (u.includes('l')) return qty * 33.814;
               return qty;
            };
            existing.quantity = toOz(currentQty, exUnit) + toOz(safeAdd, itUnit);
            existing.unit = 'oz';
         }
      } else if (exUnit !== itUnit && isWt(exUnit) && isWt(itUnit)) {
         // Normalize both weights to grams before summing, then let the re-quantize
         // engine convert back to the system's retail unit. Prevents oz+g (or lb+g)
         // mixed-scale addition from blowing the total up.
         const toG = (qty: number, u: string) => {
            if (u.includes('kg')) return qty * 1000;
            if (u.includes('lb') || u.includes('pound')) return qty * 453.59;
            if (u.includes('oz') || u.includes('ounce')) return qty * 28.35;
            return qty; // already grams
         };
         existing.quantity = toG(currentQty, exUnit) + toG(safeAdd, itUnit);
         existing.unit = 'g';
      } else {
         existing.quantity = currentQty + safeAdd;
      }

      // --- 3. THE RE-QUANTIZE ENGINE ---
      const rq = quantize(existing.name || '', existing.quantity, existing.unit || '', system);
      Object.assign(existing, { 
        mpuQuantity: rq.mpuQuantity, mpuUnit: rq.mpuUnit, 
        displayString: rq.displayString, quantity: rq.quantity, unit: rq.unit 
      });
      
      if (item.lineage) existing.lineage = [...(existing.lineage || []), ...item.lineage];
    } else {
      map.set(key, { ...item, quantity: Number(item.quantity) || 0, name: item.name });
    }
  });
  return Array.from(map.values());
}




