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

const PRODUCE_RETAIL_LOGIC: Record<string, { factor: number; unit: string; retail: string }> = {
  "lime juice": { factor: 2, unit: "tbsp", retail: "ea" },
  "lemon juice": { factor: 2, unit: "tbsp", retail: "ea" }
};

const SOLID_PRODUCE_MPU: Record<string, { imperial: string; metric: string }> = {
  "mushrooms": { imperial: "8 oz container", metric: "250g container" }
};

const PRODUCE_ITEMS = ['banana', 'apple', 'lemon', 'onion', 'potato', 'tomato', 'garlic', 'lime', 'orange', 'bell pepper', 'cucumber'];

// ------------------------------------------
// 🧀 SECTION 2: DAIRY
// ------------------------------------------
const DAIRY_WEIGHT_SHIELD = ['cheese', 'gorgonzola', 'parmesan', 'feta', 'cheddar', 'butter', 'yogurt'];

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

  // B. Produce Volume-to-Count Interceptor (Lime Juice -> Ea)
  if (PRODUCE_RETAIL_LOGIC[searchKey]) {
    const { factor, unit: refUnit, retail } = PRODUCE_RETAIL_LOGIC[searchKey];
    let convertedQty = totalQuantity;
    
    if (normalizedUnit.includes('tbsp')) convertedQty = totalQuantity / factor;
    else if (normalizedUnit.includes('cup')) convertedQty = (totalQuantity * 16) / factor;

    const finalQty = Math.ceil(convertedQty) || 1;
    return {
      quantity: finalQty,
      unit: retail,
      displayString: formatDisplay(finalQty, retail),
      name: cleanedName
    };
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
  const isPinchable = searchKey.includes('salt') || 
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

    } else if (rootNoun.includes("salt")) {
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

  // Pantry Rounding for staples
  if (PANTRY_STAPLES.some(staple => normalizedName.includes(staple))) {
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

  // Liquid Logic (With Dairy Shield)
  const isSolidDairy = DAIRY_WEIGHT_SHIELD.some(k => searchKey.includes(k));

  if (!isSolidDairy && ['oz', 'fl oz', 'ounce', 'ounces', 'cup', 'cups', 'ml', 'milliliter', 'milliliters', 'l', 'liter', 'liters', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons'].includes(normalizedUnit)) {
    if (system === 'Imperial') {
      let oz = totalQuantity;
      if (normalizedUnit.includes('cup')) oz = totalQuantity * 8;
      else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon')) oz = totalQuantity * 0.5;
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
      else if (normalizedUnit.includes('tbsp') || normalizedUnit.includes('tablespoon')) ml = totalQuantity * 15;
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
          // --- 3. THE FALLBACK: Standardize standard nouns (Butter, salted -> butter) ---
          key = cleanIngredientName(rawName).toLowerCase().split(',')[0].trim();
       }
    }

    if (map.has(key)) {
      const existing = map.get(key)!;
      
      // KILL THE "116" GLITCH
      const safeAdd = Number(item.quantity) || 0;
      const currentQty = Number(existing.quantity) || 0;
      
      const exUnit = (existing.unit || '').toLowerCase();
      const itUnit = (item.unit || '').toLowerCase();
      
      // BOTTLE-AWARE LIQUID DETECTION
      const isLiq = (u: string) => ['cup', 'tbsp', 'tbl', 'tsp', 'oz', 'ml', 'l', 'bottle', 'jar'].some(l => u.includes(l));
      
      // --- 2. SYSTEM-AWARE UNIT ALIGNMENT ---
      if (exUnit !== itUnit && isLiq(exUnit) && isLiq(itUnit)) {
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




