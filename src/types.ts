export type UnitSystem = 'Metric' | 'Imperial';

export interface Recipe {
  id: string;
  title: string;
  isActive: boolean;
  multiplier: number;
  userId: string;
}

export interface Ingredient {
  id: string;
  recipeId: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  checked: boolean;
  isManual?: boolean;
  mpuQuantity?: number;
  mpuUnit?: string;
  originalQuantity?: number;
  originalUnit?: string;
  lineage?: Array<{ type: 'recipe' | 'manual', label: string }>;
  hideQuantity?: boolean;
  displayString?: string;
  displayOverride?: string;
  userId: string;
}

export type Category = 'Bakery' | 'Produce' | 'Protein' | 'Dairy' | 'Frozen' | 'Pantry' | 'Needs Sorting';

export const CATEGORIES: Category[] = [
  'Bakery',
  'Produce',
  'Protein',
  'Dairy',
  'Frozen',
  'Pantry',
  'Needs Sorting'
];

export interface QuantizedResult {
  ingredients: Ingredient[];
}
