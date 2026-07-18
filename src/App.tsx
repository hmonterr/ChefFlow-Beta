/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';
import { 
  Plus, 
  FileUp, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2, 
  Circle, 
  Loader2, 
  Trash2, 
  Settings2,
  ChefHat,
  ShoppingCart,
  Link as LinkIcon,
  X,
  BookOpen,
  Pencil,
  Eye,
  EyeOff,
  LogOut,
  Search,
  Bookmark
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogPortal,
  DialogOverlay
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { 
  auth, 
  db, 
  signInWithGoogle, 
  signInAsGuest,
  migrateGuestData,
  logout, 
  OperationType, 
  handleFirestoreError,
  logActivity 
} from './lib/firebase.ts';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where,
  writeBatch
} from 'firebase/firestore';

import { onAuthStateChanged, User } from 'firebase/auth';
import { extractRecipeData, parseSingleIngredient, categorizeIngredient } from './lib/gemini.ts';
import { quantize, consolidateIngredients, shouldOmit } from './lib/quantizer.ts';
import { Ingredient, UnitSystem, Category, CATEGORIES, Recipe } from './types.ts';
import jsPDF from 'jspdf';

import { FirebaseErrorBoundary } from './FirebaseErrorBoundary';

export default function App() {
  return (
    <FirebaseErrorBoundary>
      <AppContent />
    </FirebaseErrorBoundary>
  );
}

function AppContent() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [user, setUser] = useState<User | null>(null);  const [isAuthReady, setIsAuthReady] = useState(true);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('Imperial');
  const [isLoading, setIsLoading] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<Category>>(new Set(['Needs Sorting' as Category]));
  const [isLegendExpanded, setIsLegendExpanded] = useState(true);
  const [editingItem, setEditingItem] = useState<Ingredient | null>(null);
  const [quickAddCategory, setQuickAddCategory] = useState<Category | null>(null);
  const [quickAddValue, setQuickAddValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isInputHeroExpanded, setIsInputHeroExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());
  const [libraryRecipes, setLibraryRecipes] = useState<any[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [librarySort, setLibrarySort] = useState('newest');
  const [libraryCategories, setLibraryCategories] = useState<Set<string>>(new Set());
  const [editingLibraryRecipe, setEditingLibraryRecipe] = useState<(Recipe & { ingredients: any[] }) | null>(null);
  const [editingActiveRecipe, setEditingActiveRecipe] = useState<(Recipe & { ingredients: any[] }) | null>(null);
  const [libraryMenus, setLibraryMenus] = useState<any[]>([]);
  const [managingMenu, setManagingMenu] = useState<any | null>(null);
  const [menuTitleInput, setMenuTitleInput] = useState('');
  // --- ACTIVE CHOICE GUARDIAN STATE ---
  const [guardianUI, setGuardianUI] = useState<{ title: string; items: any[] } | null>(null);
  const resolveGuardianRef = useRef<((items: any[]) => void) | null>(null);
  const rejectGuardianRef = useRef<((reason?: any) => void) | null>(null);
  // Concurrency lock against bulk URL parsing. Synchronous (ref, not state)
  // because two rapid submissions can both pass an isLoading check before
  // setIsLoading(true) commits. Also survives the Guardian intercept's
  // intentional setIsLoading(false) drop (see handleProcess).
  // URL-only by design: text / image / PDF parses are user-supplied content
  // with no third-party scraping liability and may run concurrently.
  const isUrlParsingRef = useRef(false);

  // --- CLEAR ALL GUARDIAN ---
  // Confirmation gate for the destructive Clear All Items action. Manifest absolute
  // rule: "Clear All Guardian: Passive intercept modal preventing accidental wiping
  // of the active board." Settings → Clear All Items now opens this confirm; the
  // actual writeBatch delete only fires on user confirm.
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // --- B-010 LEGAL DISCLAIMER FOOTER ---
  // Collapsed by default for a cleaner footer; trigger label "Legal & Disclaimer"
  // provides constructive notice, full text one click away.
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);

  // --- KANBAN GESTURE HANDLER ---
  // Replaces native scroll inertia with one-column-per-gesture snap behavior on
  // mobile + tablet (<lg viewport). Trackpad swipes and touchscreen flicks both
  // route through here. Desktop (lg+) keeps native free-scroll for mouse wheels.
  // Chef-founder's ask: "feel like swiping cards in an Instagram post."
  const kanbanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = kanbanRef.current;
    if (!container) return;

    let isAnimating = false;
    let wheelAccumulator = 0;
    let wheelTimer: ReturnType<typeof setTimeout> | null = null;
    let touchStartX = 0;
    const lgBreakpoint = window.matchMedia('(max-width: 1023px)');

    const getColumnStep = () => {
      const firstCol = container.querySelector('[class*="snap-start"]') as HTMLElement | null;
      if (!firstCol) return container.clientWidth;
      return firstCol.offsetWidth + 24; // column width + gap-6
    };

    const snapBy = (direction: number) => {
      if (isAnimating) return;
      const step = getColumnStep();
      if (!step) return;
      const currentIndex = Math.round(container.scrollLeft / step);
      const maxIndex = Math.max(0, Math.floor((container.scrollWidth - container.clientWidth) / step));
      const targetIndex = Math.max(0, Math.min(maxIndex, currentIndex + direction));
      isAnimating = true;
      container.scrollTo({ left: targetIndex * step, behavior: 'smooth' });
      setTimeout(() => { isAnimating = false; }, 200);
    };

    const snapToNearest = () => {
      if (isAnimating) return;
      const step = getColumnStep();
      if (!step) return;
      const currentIndex = Math.round(container.scrollLeft / step);
      isAnimating = true;
      container.scrollTo({ left: currentIndex * step, behavior: 'smooth' });
      setTimeout(() => { isAnimating = false; }, 200);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!lgBreakpoint.matches) return;
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!lgBreakpoint.matches || isAnimating) return;
      const delta = touchStartX - e.changedTouches[0].clientX;
      const SWIPE_THRESHOLD = 40; // px — below this, snap back to current
      if (Math.abs(delta) < SWIPE_THRESHOLD) {
        snapToNearest();
        return;
      }
      snapBy(delta > 0 ? 1 : -1);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!lgBreakpoint.matches) return;
      // Only intercept dominantly-horizontal scrolls (trackpad two-finger swipe)
      if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      if (isAnimating) return;
      wheelAccumulator += e.deltaX;
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        const WHEEL_THRESHOLD = 30;
        if (Math.abs(wheelAccumulator) >= WHEEL_THRESHOLD) {
          snapBy(wheelAccumulator > 0 ? 1 : -1);
        }
        wheelAccumulator = 0;
      }, 16);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, []);

  // Initialize Hero state based on screen size
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setIsInputHeroExpanded(isMobile);
  }, []);

  // Auth Listener (Restored & Guarded)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (!u) {
        signInAsGuest().catch(err => console.error("Guest login failed:", err));
      } else {
        // 1. SET USER FIRST (This unlocks the app)
        setUser(u);
        setIsAuthReady(true);
        
        // 2. TELEMETRY (Guarded so it can't crash the session)
        try {
          logActivity(u.uid, 'login', { 
            isAnonymous: u.isAnonymous,
            device_width: window.innerWidth 
          });
        } catch (e) {
          console.warn("Auth successful, but telemetry skipped:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Sync: Recipes
  useEffect(() => {
    if (!user) {
      setRecipes([]);
      return;
    }

    const q = query(collection(db, 'recipes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data() } as Recipe));
      setRecipes(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'recipes');
    });

    return () => unsubscribe();
  }, [user]);

  // Firestore Sync: Ingredients
  useEffect(() => {
    if (!user) {
      setIngredients([]);
      return;
    }

    const q = query(collection(db, 'ingredients'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data() } as Ingredient));
      setIngredients(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ingredients');
    });

    return () => unsubscribe();
  }, [user]);

// Firestore Sync: Library Recipes
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setLibraryRecipes([]);
      // Reset filter UI so a prior session's search/sort/category state
      // doesn't carry into the next account's library on sign-in.
      setLibrarySearch('');
      setLibrarySort('newest');
      setLibraryCategories(new Set());
      return;
    }

    const q = query(collection(db, 'library_recipes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data() }));
      // Sort so the newest saved items appear at the top
      items.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      setLibraryRecipes(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'library_recipes');
    });

    return () => unsubscribe();
  }, [user]);

  // Firestore Sync: Library Menus
  useEffect(() => {
    if (!user || user.isAnonymous) {
      setLibraryMenus([]);
      return;
    }

    const q = query(collection(db, 'library_menus'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ ...doc.data() }));
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setLibraryMenus(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'library_menus');
    });

    return () => unsubscribe();
  }, [user]);

  // Library: distinct ingredient categories across all saved recipes
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    libraryRecipes.forEach((r) => {
      (r.ingredients || []).forEach((ing: any) => {
        if (ing?.category) set.add(ing.category);
      });
    });
    return Array.from(set).sort();
  }, [libraryRecipes]);

  // Library: search (title + ingredient names) -> category filter (OR) -> sort
  const filteredLibraryRecipes = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    const result = libraryRecipes.filter((r) => {
      if (q) {
        const inTitle = (r.title || '').toLowerCase().includes(q);
        const inIngredients = (r.ingredients || []).some((ing: any) =>
          (ing?.name || '').toLowerCase().includes(q)
        );
        if (!inTitle && !inIngredients) return false;
      }
      if (libraryCategories.size > 0) {
        const cats = new Set((r.ingredients || []).map((ing: any) => ing?.category));
        let hit = false;
        libraryCategories.forEach((c) => { if (cats.has(c)) hit = true; });
        if (!hit) return false;
      }
      return true;
    });

    const byNewest = (a: any, b: any) =>
      new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    const count = (r: any) => (r.ingredients?.length || 0);

    switch (librarySort) {
      case 'oldest':
        return [...result].sort((a, b) => -byNewest(a, b));
      case 'az':
        return [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'za':
        return [...result].sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      case 'most':
        return [...result].sort((a, b) => count(b) - count(a));
      case 'fewest':
        return [...result].sort((a, b) => count(a) - count(b));
      case 'newest':
      default:
        return [...result].sort(byNewest);
    }
  }, [libraryRecipes, librarySearch, librarySort, libraryCategories]);

  const toggleLibraryCategory = (cat: string) => {
    setLibraryCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const clearLibraryFilters = () => {
    setLibrarySearch('');
    setLibrarySort('newest');
    setLibraryCategories(new Set());
  };

  // Unit System Persistence (Still local for now as it's a preference)
  useEffect(() => {
    const savedUnits = localStorage.getItem('chefflow_units');
    if (savedUnits) setUnitSystem(savedUnits as UnitSystem);
  }, []);

  useEffect(() => {
    localStorage.setItem('chefflow_units', unitSystem);
  }, [unitSystem]);

  // Auto-expand logic: Expand a category if it gets items
  useEffect(() => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      let changed = false;
      CATEGORIES.forEach(cat => {
        const items = ingredients.filter(i => i.category === cat);
        if (items.length > 0 && next.has(cat)) {
          next.delete(cat);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [ingredients]);

{/* Target: App.tsx - Replace your broken handleKanbanDrop block with this entire block */}

  // --- 1. COLUMN LEVEL DROP (Re-Categorizing) ---
  const handleKanbanDragStart = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.setData('itemId', itemId);
  };

  const handleKanbanDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleKanbanDrop = async (e: React.DragEvent, newCategory: Category) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('itemId');
    if (!itemId || !user) return;
    
    try {
      await updateDoc(doc(db, 'ingredients', itemId), { category: newCategory });
      toast.success(`Moved to ${newCategory}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/${itemId}`);
    }
  };


  // --- 2. ITEM LEVEL DROP (Merging) ---
  const handleItemMergeDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation(); // CRITICAL: Stops the column from stealing the drop
    setMergeTargetId(itemId);
  };

  const handleItemMergeDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMergeTargetId(null);
  };

  const handleItemMergeDrop = async (e: React.DragEvent, targetItem: Ingredient) => {
    e.preventDefault();
    e.stopPropagation();
    setMergeTargetId(null);

    const sourceId = e.dataTransfer.getData('itemId');
    if (!sourceId || sourceId === targetItem.id || !user) return;

    const sourceItem = ingredients.find(i => i.id === sourceId);
    const rawTarget = ingredients.find(i => i.id === targetItem.id);
    
    if (!sourceItem || !rawTarget) return;

    setIsLoading(true);
    try {
      // 1. Calculate new total math
      const combinedQuantity = rawTarget.quantity + sourceItem.quantity;
      
      // 2. Format the source quantity for the audit trail
      const sourceQtyStr = sourceItem.displayString || `${sourceItem.quantity} ${sourceItem.unit}`;

      // 3. Map over the source item's lineage using the exact format: ⎇ [Source] » [Qty] [Name]
      const sourceLineageTrails = (sourceItem.lineage || []).map(l => ({
        type: 'manual', 
        label: `⎇ ${l.label} » ${sourceQtyStr} ${sourceItem.name}`
      }));

      // Fallback for manually added items without existing lineage
      if (sourceLineageTrails.length === 0) {
        sourceLineageTrails.push({ 
          type: 'manual', 
          label: `⎇ Manual Entry » ${sourceQtyStr} ${sourceItem.name}` 
        });
      }

      // Combine lineages
      const mergedLineage = [...(rawTarget.lineage || []), ...sourceLineageTrails];
      
      // 4. Re-quantize to ensure MPU display strings reflect the new total
      const finalQuantized = quantize(rawTarget.name, combinedQuantity, rawTarget.unit, unitSystem, 1);

      // 5. Execute Atomic Database Update
      const batch = writeBatch(db);
      
      batch.update(doc(db, 'ingredients', rawTarget.id), {
        quantity: finalQuantized.quantity,
        unit: finalQuantized.unit,
        mpuQuantity: finalQuantized.mpuQuantity,
        mpuUnit: finalQuantized.mpuUnit,
        displayString: finalQuantized.displayString,
        lineage: mergedLineage,
        isManual: true // Flags that a human altered this item
      });
      
      batch.delete(doc(db, 'ingredients', sourceId));
      
      await batch.commit();
      toast.success(`Merged into ${rawTarget.name}`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/merge`);
    } finally {
      setIsLoading(false);
    }
  };  

  const processedIngredients = useMemo(() => {
    // 1. Filter only ingredients from active recipes and apply multiplier
    const activeRecipes = recipes.filter(r => r.isActive);
    const activeRecipeMap = new Map(activeRecipes.map(r => [r.id, r.multiplier]));
    
    const scaledIngredients = ingredients
      .filter(item => activeRecipeMap.has(item.recipeId) || item.isManual)
      .map(item => {
        const multiplier = activeRecipeMap.get(item.recipeId) || 1;
        const recipe = recipes.find(r => r.id === item.recipeId);
        
        // Update lineage for recipe items to reflect current multiplier
        let lineage = item.lineage || [];
        if (!item.isManual && recipe) {
          lineage = [{ type: 'recipe', label: `${recipe.title} (${multiplier}x)` }];
        }

        // Scale by THIS recipe's own multiplier before consolidation. Doing it
        // here (not post-consolidate) is load-bearing: consolidateIngredients
        // sums quantities across recipes and keeps only the first-seen recipeId,
        // so a single post-hoc multiplier would scale every sibling recipe's
        // contribution by the wrong factor and undershoot the total.
        return {
          ...item,
          quantity: (Number(item.quantity) || 0) * multiplier,
          lineage
        };
      });

    // 2. Filter omitted items (Water rule)
    const filtered = scaledIngredients.filter(item => !shouldOmit(item.name));
    
    // 3. Consolidate (Sum identical items BEFORE rounding)
    const consolidated = consolidateIngredients(filtered, unitSystem);
    
    // 4. Quantize (Apply MPU round-up)
    const quantized = consolidated.map(item => {
      // Multiplier is already baked into item.quantity (scaledIngredients above),
      // so quantize with scale=1 — applying it again here would double-scale.
      const result = quantize(item.name, item.quantity, item.unit, unitSystem);
      
      // 🛡️ THE GLOBAL RENDER FAILSAFE 🛡️
      // This catches EVERY ingredient (Dairy, Bakery, Protein, etc.) and forces 
      // the broken lowercase database strings to strictly match your UI columns.
      const rawCategory = result.category || item.category || 'Needs Sorting';
      const safeCategory = CATEGORIES.find(c => c.toLowerCase() === String(rawCategory).toLowerCase().trim()) || 'Needs Sorting';

      return {
        ...item,
        name: result.name || item.name,
        quantity: result.quantity,
        unit: result.unit,
        mpuQuantity: result.mpuQuantity,
        mpuUnit: result.mpuUnit,
        displayString: result.displayString,
        category: safeCategory as Category // Instantly rescues ALL invisible Phantom Items
      };
    });

    // 5. Alphabetical Sorting
    return quantized.sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, recipes, unitSystem]);

  const sortedCategories = useMemo(() => {
    const cats = [...CATEGORIES];
    const needsSorting = cats.find(c => c === 'Needs Sorting');
    const others = cats.filter(c => c !== 'Needs Sorting').sort();
    return needsSorting ? [...others, 'Needs Sorting' as Category] : others;
  }, []);

  const handleProcess = async (input: string | { data: string; mimeType: string }, type: 'text' | 'image' | 'pdf' | 'url') => {
    if (!user) return;
    // URL-only choke point against bulk scraping: blocks a second URL
    // parse while one is in flight. Ref check is synchronous so two
    // concurrent submissions can't both pass. Text / image / PDF parses
    // are user-supplied content and intentionally unconstrained here.
    if (type === 'url') {
      if (isUrlParsingRef.current) {
        toast.info('Already parsing a URL — wait for it to finish.');
        return;
      }
      isUrlParsingRef.current = true;
    }
    setIsLoading(true);

    // TELEMETRY LOG: Extraction Attempt
    logActivity(user.uid, 'parse_recipe', { 
      sourceType: type,
      // If it's a URL, save the domain so we know where our users scrape from
      domain: type === 'url' && typeof input === 'string' ? new URL(input).hostname : 'N/A' 
    });

    try {
      const result = await extractRecipeData(input, type === 'url');
      
      if (!result || !result.ingredients || result.ingredients.length === 0) {
        throw new Error("EMPTY_DATA");
      }

      // --- ACTIVE INTERCEPT GUARDIAN ---
      let processedIngredients = result.ingredients;
      const ambiguousItems = processedIngredients.filter((i: any) => i.isAmbiguous);
      
      if (ambiguousItems.length > 0) {
        setIsLoading(false); // Drop loading screen so UI is visible
        try {
          processedIngredients = await new Promise<any[]>((resolve, reject) => {
            resolveGuardianRef.current = resolve;
            rejectGuardianRef.current = reject;
            setGuardianUI({ title: result.title || 'Extracted Recipe', items: processedIngredients });
          });
        } catch (e) {
          return; // Abort silently if user clicks Cancel
        }
        setIsLoading(true); // Resume loading screen for database write
      }
      // ----------------------------------

      const recipeId = Math.random().toString(36).substr(2, 9);
      
      const newRecipe: Recipe = {
        id: recipeId,
        title: result.title || 'Untitled Recipe',
        isActive: true,
        multiplier: 1,
        userId: user.uid
      };

      const batch = writeBatch(db);
      
      batch.set(doc(db, 'recipes', recipeId), newRecipe);

      processedIngredients.forEach((item: any) => {
        const id = Math.random().toString(36).substr(2, 9);
        const ingredient: Ingredient = {
          id,
          recipeId: recipeId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category as Category,
          checked: false,
          originalQuantity: item.quantity,
          originalUnit: item.unit,
          lineage: [{ type: 'recipe', label: `${newRecipe.title} (1x)` }],
          userId: user.uid
        };
        batch.set(doc(db, 'ingredients', id), ingredient);
      });

      await batch.commit();

      const newCats = new Set(processedIngredients.map((i: any) => i.category));
      setCollapsedCategories(prev => {
        const next = new Set(prev);
        newCats.forEach(cat => next.delete(cat as Category));
        return next;
      });

      setIsLegendExpanded(true); 
      toast.success(`Added: ${newRecipe.title}`);
      setRawInput('');
      setQuickAddValue('');
      setIsInputHeroExpanded(false); 
  

  } catch (error: any) {
      console.error(`Error at handleProcess (${type}):`, error);
      
      // 1. Show the error to the user so the app doesn't seem broken
      toast.error("Extraction Failed", {
        description: error.message || "Model rejected the request. Check console."
      });
      
      // 2. Prevent the Firestore logger from crashing the React lifecycle
      try {
        handleFirestoreError(error, OperationType.WRITE, 'recipes/ingredients');
      } catch (e) {
        // We intentionally do nothing here to suppress the secondary crash
      }
    } finally {
      // 3. This will now ALWAYS run, unfreezing the UI
      setIsLoading(false);
      // Idempotent release — safe even on text / image / PDF paths
      // where the URL lock was never acquired.
      isUrlParsingRef.current = false;
    }
  };

  const processFile = (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Unsupported file type. Please upload an image, PDF, or text file.');
      return;
    }

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = async () => {
        const text = reader.result as string;
        await handleProcess(text, 'text');
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        await handleProcess({ data: base64, mimeType: file.type }, file.type.includes('pdf') ? 'pdf' : 'image');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const toggleItem = async (id: string) => {
    const item = ingredients.find(i => i.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'ingredients', id), { checked: !item.checked });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/${id}`);
    }
  };

  const toggleHideQuantity = async (id: string) => {
    const item = ingredients.find(i => i.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'ingredients', id), { hideQuantity: !item.hideQuantity });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/${id}`);
    }
  };

  const addQuickItem = async (category: Category | null, value: string) => {
    if (!value.trim()) return;
    if (!user) return;
    
    setRawInput(''); 
    setQuickAddValue(''); 
    setIsLoading(true);
    
    try {
      const parsed = await parseSingleIngredient(value);
      
      if (!parsed || !parsed.name) {
        throw new Error("EMPTY_DATA");
      }

      // --- ACTIVE INTERCEPT GUARDIAN ---
      let processedItem = parsed;
      if (processedItem.isAmbiguous) {
        setIsLoading(false);
        try {
          const resolved = await new Promise<any[]>((resolve, reject) => {
            resolveGuardianRef.current = resolve;
            rejectGuardianRef.current = reject;
            setGuardianUI({ title: 'Clarify Measurement', items: [processedItem] });
          });
          // SURGICAL FIX 1: Merge the Guardian resolution so we don't drop the AI's category
          processedItem = { ...processedItem, ...resolved[0] };
        } catch (e) {
          if (category) setQuickAddValue(value); 
          else setRawInput(value); 
          return; 
        }
        setIsLoading(true);
      }
      // ----------------------------------

      const normalizedName = processedItem.name.toLowerCase().trim();
      const existingItem = ingredients.find(i => i.name.toLowerCase().trim() === normalizedName);

      // SURGICAL FIX 2: Strict UI Column Normalization
      const rawCategory = processedItem.category || category || 'Needs Sorting';
      let targetCategory: Category = (CATEGORIES.find(c => c.toLowerCase() === String(rawCategory).toLowerCase().trim()) as Category) || 'Needs Sorting';

      if (targetCategory === 'Needs Sorting') {
        try {
          const aiCategory = await categorizeIngredient(processedItem.name);
          if (aiCategory) {
            targetCategory = (CATEGORIES.find(c => c.toLowerCase() === String(aiCategory).toLowerCase().trim()) as Category) || 'Needs Sorting';
          }
        } catch (e) {
          console.warn("AI categorization failed");
        }
      }

      const safeQuantity = Number(processedItem.quantity) || 1;
      const safeUnit = processedItem.unit || 'ea';

      if (existingItem) {
        const newQuantized = quantize(processedItem.name, safeQuantity, safeUnit, unitSystem, 1);
        const combinedQuantity = (Number(existingItem.quantity) || 0) + (Number(newQuantized.quantity) || 0);
        const finalQuantized = quantize(existingItem.name, combinedQuantity, existingItem.unit || 'ea', unitSystem, 1);
        
        // 1. Build a strict, Zod-compliant update payload
        const updatePayload: any = {
          quantity: Number(finalQuantized.quantity) || combinedQuantity,
          unit: finalQuantized.unit || existingItem.unit || 'ea',
          category: targetCategory, 
          isManual: true,
          lineage: [...(existingItem.lineage || []), { type: 'manual', label: value }]
        };

        // Only attach MPU/Display fields if they physically exist (Prevents Zod rejection)
        if (finalQuantized.mpuQuantity != null) updatePayload.mpuQuantity = finalQuantized.mpuQuantity;
        if (finalQuantized.mpuUnit != null) updatePayload.mpuUnit = finalQuantized.mpuUnit;
        if (finalQuantized.displayString != null) updatePayload.displayString = finalQuantized.displayString;
        
        await updateDoc(doc(db, 'ingredients', existingItem.id), updatePayload);
        toast.success(`Updated: ${processedItem.name}`);
      } else {
        const quantized = quantize(processedItem.name, safeQuantity, safeUnit, unitSystem, 1);
        const id = Math.random().toString(36).substr(2, 9);
        
        // 2. Build a strict, Zod-compliant create payload
        const newItem: any = {
          id,
          recipeId: 'manual',
          name: quantized.name || processedItem.name,
          quantity: Number(quantized.quantity) || safeQuantity,
          unit: quantized.unit || safeUnit,
          category: targetCategory,
          checked: false,
          isManual: true,
          lineage: [{ type: 'manual', label: value }],
          userId: user.uid
        };

        // Only attach MPU/Display fields if they physically exist (Prevents Zod rejection)
        if (quantized.mpuQuantity != null) newItem.mpuQuantity = quantized.mpuQuantity;
        if (quantized.mpuUnit != null) newItem.mpuUnit = quantized.mpuUnit;
        if (quantized.displayString != null) newItem.displayString = quantized.displayString;

        await setDoc(doc(db, 'ingredients', id), newItem as Ingredient);
        toast.success(`Added: ${processedItem.name}`);
      }

      // UX Failsafe: Open column if item legitimately lands in Needs Sorting
      if (targetCategory === 'Needs Sorting') {
        setCollapsedCategories(prev => {
          const next = new Set(prev);
          next.delete('Needs Sorting' as Category);
          return next;
        });
      }

      setIsInputHeroExpanded(false); 

    } catch (error: any) { 
      console.error('Error adding quick item:', error);
      handleFirestoreError(error, OperationType.WRITE, 'ingredients');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'ingredients', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `ingredients/${id}`);
    }
  };

  const updateItem = async (id: string, updates: Partial<Ingredient>) => {
    const item = ingredients.find(i => i.id === id);
    if (!item) return;

    try {
      const merged = { ...item, ...updates, isManual: true };
      const quantized = quantize(merged.name, merged.quantity, merged.unit, unitSystem, 1);
      
      await updateDoc(doc(db, 'ingredients', id), {
        ...updates,
        name: quantized.name || merged.name,
        quantity: quantized.quantity,
        unit: quantized.unit,
        mpuQuantity: quantized.mpuQuantity ?? null,
        mpuUnit: quantized.mpuUnit ?? null,
        displayString: quantized.displayString,
        category: (quantized.category as Category) || merged.category,
        isManual: true
      });
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `ingredients/${id}`);
    }
  };

  // Open the Active Recipe editor with a staged copy of this recipe's live ingredient docs.
  // Shows original (pre-quantize) amounts so edits round-trip the way the user entered them.
  const openActiveRecipeEditor = (recipe: Recipe) => {
    const recipeIngredients = ingredients
      .filter(i => i.recipeId === recipe.id)
      .map(i => ({
        id: i.id,
        name: i.name,
        quantity: i.originalQuantity ?? i.quantity,
        unit: i.originalUnit ?? i.unit,
        category: i.category,
      }));
    setEditingActiveRecipe({ ...recipe, ingredients: recipeIngredients });
  };

  // Save staged edits: delete this recipe's existing ingredient docs and recreate from the
  // staged list (mirrors the proven SYNC LIST pattern). Re-quantize each so MPU/category stay
  // correct; the board re-quantizes at render but we persist original qty/unit for round-trips.
  const updateActiveRecipe = async () => {
    if (!editingActiveRecipe || !user) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(db);

      ingredients
        .filter(i => i.recipeId === editingActiveRecipe.id)
        .forEach(i => batch.delete(doc(db, 'ingredients', i.id)));

      editingActiveRecipe.ingredients
        .filter((ing: any) => (ing.name || '').trim() !== '')
        .forEach((ing: any) => {
          const rawQty = typeof ing.quantity === 'number' ? ing.quantity : parseFloat(ing.quantity);
          const qty = Number.isFinite(rawQty) ? rawQty : 0;
          const unit = ing.unit || 'ea';
          const quantized = quantize(ing.name, qty, unit, unitSystem, 1);
          const newId = Math.random().toString(36).substr(2, 9);
          const newIng: Ingredient = {
            id: newId,
            recipeId: editingActiveRecipe.id,
            name: quantized.name || ing.name,
            quantity: quantized.quantity,
            unit: quantized.unit,
            category: (quantized.category as Category) || ing.category || 'Needs Sorting',
            checked: false,
            originalQuantity: qty,
            originalUnit: unit,
            lineage: [{ type: 'recipe', label: `${editingActiveRecipe.title} (1x)` }],
            userId: user.uid
          };
          batch.set(doc(db, 'ingredients', newId), newIng);
        });

      if (editingActiveRecipe.title.trim()) {
        batch.update(doc(db, 'recipes', editingActiveRecipe.id), { title: editingActiveRecipe.title.trim() });
      }

      await batch.commit();

      // Snapshot the staged edits before clearing state, so the toast closure has stable data.
      const savedRecipe = editingActiveRecipe;
      const cleanedIngredients = savedRecipe.ingredients
        .filter((ing: any) => (ing.name || '').trim() !== '')
        .map((ing: any) => {
          const rawQty = typeof ing.quantity === 'number' ? ing.quantity : parseFloat(ing.quantity);
          const qty = Number.isFinite(rawQty) ? rawQty : 0;
          return {
            name: ing.name,
            quantity: qty,
            unit: ing.unit || 'ea',
            category: ing.category || 'Needs Sorting',
          };
        });

      setEditingActiveRecipe(null);
      toast.success(`${savedRecipe.title} updated.`);

      // If this recipe is bookmarked, offer to push the edits up to the saved Library master.
      // Mirrors the Library→Active SYNC LIST toast (reverse direction).
      // Bulletproof match: ID first, then fall back to title — active/library IDs don't always
      // line up (a board recipe can be minted with a fresh ID), same pattern as updateLibraryRecipe.
      const savedTitle = (savedRecipe.title || '').toLowerCase().trim();
      const libraryMatch = libraryRecipes.find(r =>
        r.id === savedRecipe.id || (r.title || '').toLowerCase().trim() === savedTitle
      );
      if (libraryMatch) {
        toast.custom((t) => (
          <div className="relative flex items-center gap-4 bg-white border border-gray-200 p-4 rounded-xl shadow-xl min-w-[360px] animate-in fade-in slide-in-from-bottom-4">
            <button
              onClick={() => toast.dismiss(t)}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="bg-orange-50 p-2 rounded-full shrink-0">
              <Bookmark className="w-5 h-5 text-orange-600" />
            </div>

            <div className="flex-1 pr-6">
              <p className="text-sm font-bold text-gray-900">
                Saved to your board.
              </p>
              <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                Also update the saved Library recipe?
              </p>
            </div>

            <div className="shrink-0">
              <Button
                size="sm"
                className="bg-[#1A1A1A] hover:bg-black text-white text-[10px] font-bold h-9 px-4 shadow-sm"
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'library_recipes', libraryMatch.id), {
                      title: savedRecipe.title.trim() || libraryMatch.title,
                      ingredients: cleanedIngredients
                    });
                    toast.dismiss(t);
                    toast.success('Library recipe updated.');
                  } catch (error) {
                    toast.dismiss(t);
                    handleFirestoreError(error, OperationType.UPDATE, `library_recipes/${libraryMatch.id}`);
                  }
                }}
              >
                UPDATE LIBRARY
              </Button>
            </div>
          </div>
        ), { duration: 10000 });
      }
    } catch (error: any) {
      handleFirestoreError(error, OperationType.UPDATE, `recipes/${editingActiveRecipe.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecipe = async (recipeId: string) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    try {
      await updateDoc(doc(db, 'recipes', recipeId), { isActive: !recipe.isActive });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recipes/${recipeId}`);
    }
  };

  const updateMultiplier = async (recipeId: string, direction: 'up' | 'down') => {
    const r = recipes.find(rec => rec.id === recipeId);
    if (!r) return;
    
    let next = r.multiplier;
    if (direction === 'up') {
      if (next === 0.5) next = 1.0;
      else if (next === 1.0) next = 1.5;
      else if (next === 1.5) next = 2.0;
      else next = Math.floor(next + 1);
    } else {
      if (next > 2.0) next = Math.floor(next - 1);
      else if (next === 2.0) next = 1.5;
      else if (next === 1.5) next = 1.0;
      else if (next === 1.0) next = 0.5;
    }
    
    try {
      await updateDoc(doc(db, 'recipes', recipeId), { multiplier: next });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `recipes/${recipeId}`);
    }
  };

  const removeRecipe = async (recipeId: string) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!user) return;
    
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'recipes', recipeId));
      
      ingredients
        .filter(i => i.recipeId === recipeId)
        .forEach(i => batch.delete(doc(db, 'ingredients', i.id)));
        
      await batch.commit();
      if (recipe) toast.info(`Removed: ${recipe.title}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `recipes/${recipeId}`);
    }
  };

    const removeFromLibrary = async (recipeId: string) => {
    try {
      await deleteDoc(doc(db, 'library_recipes', recipeId));
      toast.info("Removed from Library");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, `library_recipes/${recipeId}`);
    }
  };

const saveToLibrary = async (recipeId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); 
    
    if (!user || user.isAnonymous) {
      toast.error("Please log in to save to your library.");
      return;
    }

    // GUARD: If it's already in the database, don't save it again!
    if (libraryRecipes.some(r => r.id === recipeId)) {
      return; 
    }

    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      const libraryRef = doc(db, 'library_recipes', recipeId);

      const recipeIngredients = ingredients
        .filter(i => i.recipeId === recipeId)
        .map(i => ({
          name: i.name || 'Unknown Item',
          quantity: i.originalQuantity || i.quantity || 1,
          unit: i.originalUnit || i.unit || 'ea',
          category: i.category || 'Needs Sorting' // <-- Prevents Firebase crash
        }));

      batch.set(libraryRef, {
        id: recipe.id,
        title: recipe.title || 'Untitled Recipe',
        userId: user.uid,
        ingredients: recipeIngredients,
        savedAt: new Date().toISOString()
      });

      await batch.commit();
      // TELEMETRY LOG: Library Save
      logActivity(user.uid, 'library_save', {
        recipeId: recipe.id,
        title: recipe.title,
        ingredientCount: recipeIngredients.length
      });
      toast.success(`${recipe.title} saved to Library!`);
    } catch (error: any) {
      console.error("Save Error:", error);
      toast.error("Failed to save. Check console.");
      handleFirestoreError(error, OperationType.WRITE, 'library_recipes');
    } finally {
      setIsLoading(false);
    }
  };
  
   const loadFromLibrary = async (libraryRecipe: any) => {
    if (!user) return;

    const preservedRecipeId = libraryRecipe.id;
    
    // 1. Check if the exact Library ID is already on the board (active OR inactive)
    const existingBoardRecipe = recipes.find(r => r.id === preservedRecipeId);

    setIsLoading(true);
    try {
      const batch = writeBatch(db);

      if (existingBoardRecipe) {
        if (existingBoardRecipe.isActive) {
          toast.error(`"${libraryRecipe.title}" is already active on your board.`);
          setIsLoading(false);
          return;
        } else {
          // If it's on the board but inactive, just turn it back on! 
          // No need to duplicate ingredients.
          batch.update(doc(db, 'recipes', preservedRecipeId), { isActive: true });
          await batch.commit();
          toast.success(`${libraryRecipe.title} reactivated on board!`);
          setIsLibraryOpen(false);
          return;
        }
      }

      // 2. If ID doesn't exist, ensure they didn't just rename an active recipe to bypass the guard
      const titleExists = recipes.some(
        r => r.title.toLowerCase().trim() === libraryRecipe.title.toLowerCase().trim() && r.isActive
      );

      if (titleExists) {
        toast.error(`A recipe named "${libraryRecipe.title}" is already active.`);
        setIsLoading(false);
        return;
      }

      // 3. Fully hydrate as a new board entity using the preserved ID
      batch.set(doc(db, 'recipes', preservedRecipeId), {
        id: preservedRecipeId,
        title: libraryRecipe.title,
        isActive: true,
        multiplier: 1,
        userId: user.uid
      });

      libraryRecipe.ingredients.forEach((item: any) => {
        const ingId = Math.random().toString(36).substr(2, 9);
        batch.set(doc(db, 'ingredients', ingId), {
          id: ingId,
          recipeId: preservedRecipeId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category || 'Needs Sorting',
          checked: false,
          originalQuantity: item.quantity,
          originalUnit: item.unit,
          lineage: [{ type: 'recipe', label: `${libraryRecipe.title} (1x)` }],
          userId: user.uid
        });
      });

      await batch.commit();
      // TELEMETRY LOG: Library Load (Retention Metric)
      logActivity(user.uid, 'library_load', {
        recipeId: preservedRecipeId,
        title: libraryRecipe.title
      });

      toast.success(`${libraryRecipe.title} pushed to active board!`);
      setIsLibraryOpen(false); 
      
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'load_from_library');
    } finally {
      setIsLoading(false);
    }
  };

  const updateLibraryRecipe = async () => {
    if (!editingLibraryRecipe || !user) return;
    setIsLoading(true);
    try {
      // 1. Update the master blueprint in the Library Database
      await updateDoc(doc(db, 'library_recipes', editingLibraryRecipe.id), {
        title: editingLibraryRecipe.title,
        ingredients: editingLibraryRecipe.ingredients
      });

      // 2. Fetch the original title from the database state in case the user just edited it
      const originalLibraryRecipe = libraryRecipes.find(r => r.id === editingLibraryRecipe.id);
      const searchTitle = (originalLibraryRecipe?.title || editingLibraryRecipe.title || '').toLowerCase().trim();

      // 3. Bulletproof Match: Match by ID first, then fallback to safe Title matching
      const activeRecipe = recipes.find(r => {
        const activeTitle = (r.title || '').toLowerCase().trim();
        return (r.id === editingLibraryRecipe.id || activeTitle === searchTitle) && r.isActive;
      });
      
      if (activeRecipe) {
      // 4. Trigger the Refined Smart Propagation Toast
      toast.custom((t) => (
        <div className="relative flex items-center gap-4 bg-white border border-gray-200 p-4 rounded-xl shadow-xl min-w-[360px] animate-in fade-in slide-in-from-bottom-4">
          {/* Dismissal X Button */}
          <button 
            onClick={() => toast.dismiss(t)}
            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="bg-orange-50 p-2 rounded-full shrink-0">
            <CheckCircle2 className="w-5 h-5 text-orange-600" />
          </div>

          <div className="flex-1 pr-6">
            <p className="text-sm font-bold text-gray-900">
              {editingLibraryRecipe.title} updated.
            </p>
            {/* Contrast Fix: Darkened subtext */}
            <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
              Apply these changes to your active board?
            </p>
          </div>

          <div className="shrink-0">
            <Button 
              size="sm" 
              className="bg-[#1A1A1A] hover:bg-black text-white text-[10px] font-bold h-9 px-4 shadow-sm"
              onClick={async () => {
                const batch = writeBatch(db);

                // A. Delete old active ingredients tied to the ACTIVE board recipe ID
                const oldIngs = ingredients.filter(i => i.recipeId === activeRecipe.id);
                oldIngs.forEach(i => batch.delete(doc(db, 'ingredients', i.id)));

                // B. Map new edited ingredients into the active board using the ACTIVE recipe ID
                editingLibraryRecipe.ingredients.forEach((ing: any) => {
                  const newId = Math.random().toString(36).substr(2, 9);
                  const newIng: Ingredient = {
                    id: newId,
                    recipeId: activeRecipe.id,
                    name: ing.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    originalQuantity: ing.quantity,
                    originalUnit: ing.unit,
                    category: ing.category || 'Needs Sorting',
                    checked: false,
                    lineage: [{ type: 'recipe', label: `${editingLibraryRecipe.title} (1x)` }],
                    userId: user.uid
                  } as any;
                  batch.set(doc(db, 'ingredients', newId), newIng);
                });

                await batch.commit();
                toast.dismiss(t);
                toast.success('List synced successfully.');
              }}
            >
              SYNC LIST
            </Button>
          </div>
        </div>
      ), { duration: 10000 });
    }
      
      setEditingLibraryRecipe(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `library_recipes/${editingLibraryRecipe.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  

  const handleCreateMenu = async (e?: React.SyntheticEvent) => {
    // 1. Safely stop click/enter events from bubbling
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // 2. Explicit UI feedback for guards
    if (!user || user.isAnonymous) {
      toast.error("Please log in to create menus.");
      return;
    }

    const trimmedTitle = menuTitleInput.trim();
    if (!trimmedTitle) {
      toast.error("Please enter a menu title.");
      return;
    }

    setIsLoading(true);
    try {
      const menuId = Math.random().toString(36).substr(2, 9);
      const newMenu = {
        id: menuId,
        title: trimmedTitle,
        recipeIds: [],
        userId: user.uid,
        createdAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'library_menus', menuId), newMenu);
      
      setMenuTitleInput('');
      toast.success(`Menu "${trimmedTitle}" created!`);
    } catch (error: any) {
      // 3. Catch Firebase Rule denials visually before the utility throws
      console.error("Menu Creation Error:", error);
      toast.error("Failed to create menu. Check console or Firebase Rules.");
      handleFirestoreError(error, OperationType.WRITE, 'library_menus');
    } finally {
      setIsLoading(false);
    }
  };
  const deleteMenu = async (menuId: string) => {
    if (!user || user.isAnonymous) return;
    try {
      await deleteDoc(doc(db, 'library_menus', menuId));
      toast.success('Menu deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `library_menus/${menuId}`);
    }
  };

  const toggleRecipeInMenu = async (menuId: string, recipeId: string) => {
    if (!user || user.isAnonymous) return;
    const menu = libraryMenus.find(m => m.id === menuId);
    if (!menu) return;

    const newRecipeIds = menu.recipeIds.includes(recipeId)
      ? menu.recipeIds.filter((id: string) => id !== recipeId)
      : [...menu.recipeIds, recipeId];

    try {
      await updateDoc(doc(db, 'library_menus', menuId), { recipeIds: newRecipeIds });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `library_menus/${menuId}`);
    }
  };

  const loadMenuToBoard = async (menu: any) => {
    if (!user || !menu.recipeIds.length) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      
      for (const recipeId of menu.recipeIds) {
        const libraryRecipe = libraryRecipes.find(r => r.id === recipeId);
        if (!libraryRecipe) continue;

        const newRecipeId = Math.random().toString(36).substr(2, 9);
        
        batch.set(doc(db, 'recipes', newRecipeId), {
          id: newRecipeId,
          title: libraryRecipe.title,
          isActive: true,
          multiplier: 1,
          userId: user.uid
        });

        libraryRecipe.ingredients.forEach((item: any) => {
          const ingId = Math.random().toString(36).substr(2, 9);
          batch.set(doc(db, 'ingredients', ingId), {
            id: ingId,
            recipeId: newRecipeId,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category || 'Needs Sorting',
            checked: false,
            originalQuantity: item.quantity,
            originalUnit: item.unit,
            lineage: [{ type: 'recipe', label: `${libraryRecipe.title} (1x)` }],
            userId: user.uid
          });
        });
      }

      await batch.commit();
      toast.success(`Menu "${menu.title}" pushed to board!`);
      setIsLibraryOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'load_menu_to_board');
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      recipes.forEach(r => batch.delete(doc(db, 'recipes', r.id)));
      ingredients.forEach(i => batch.delete(doc(db, 'ingredients', i.id)));
      await batch.commit();
      toast.info('List cleared');
      
      // ADD THIS LINE: Instantly collapse the settings menu
      setIsSettingsOpen(false); 
      
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'all');
    }
  };
  const toggleCategory = (cat: Category) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Grouper Shopping List', 20, 20);
    doc.setFontSize(12);
    
    let y = 30;
    sortedCategories.forEach(cat => {
      const items = processedIngredients.filter(i => i.category === cat);
      if (items.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text(cat, 20, y);
        y += 7;
        doc.setFont("helvetica", "normal");
        items.forEach(item => {
          doc.text(`[${item.checked ? 'x' : ' '}] ${item.displayString || `${item.quantity} ${item.unit}`} ${item.name}`, 25, y);
          y += 6;
        });
        y += 5;
      }
    });

    // TELEMETRY LOG: PDF Export
    if (user) {
      logActivity(user.uid, 'export_pdf', {
        categoryCount: sortedCategories.length,
        itemCount: processedIngredients.length
      });
    }
    
    doc.save('shopping-list.pdf');
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[100dvh] w-full bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-orange-100 overflow-hidden">
        <header 
          className={`
            fixed md:sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 px-4 py-3 transition-all duration-300 ease-in-out
            ${isInputHeroExpanded ? 'h-[100dvh] md:h-auto flex items-center justify-center' : 'h-[60px] md:h-auto'}
            max-md:w-full max-md:left-0
          `}
        >
          <div className={`max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6 w-full ${isInputHeroExpanded ? 'max-md:px-6' : ''}`}>
            <div className={`flex items-center gap-1.5 md:gap-2 mr-auto shrink-0 ${isInputHeroExpanded ? 'max-md:absolute max-md:top-8 max-md:left-8' : ''}`}>
              <div className="bg-orange-500 p-2 rounded-xl shadow-lg shadow-orange-200">
                <ChefHat className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-base md:text-xl font-bold tracking-tight leading-none">Grouper</h1>
                <span className="text-[7px] md:text-[10px] font-bold text-orange-600 uppercase tracking-wider md:tracking-widest mt-0.5">Beta Version</span>
              </div>
            </div>

            <div className={`
              flex flex-col md:flex-row items-center gap-4 w-full md:w-auto flex-1 max-w-2xl
              ${!isInputHeroExpanded ? 'max-md:hidden' : 'max-md:flex'}
            `}>
              <div 
                className={`relative flex-1 flex items-center transition-all duration-200 w-full ${
                  isDragging ? 'scale-[1.02]' : ''
                }`}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className={`absolute inset-0 rounded-lg pointer-events-none transition-all duration-200 ${
                  isDragging ? 'border-2 border-dashed border-orange-500 bg-orange-50/50 z-10' : 'border border-transparent'
                }`} />
                
                <div className="relative flex-1 flex items-center">
                  <Input
                    placeholder={
                      isDragging
                        ? "Drop recipe file here..."
                        : "Paste URL or add ingredient"
                    }
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    className={`pr-10 bg-gray-50 border-gray-200 focus:ring-orange-500 transition-colors h-12 md:h-10 text-base md:text-sm ${
                      isDragging ? 'opacity-0' : 'opacity-100'
                    }`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && rawInput) {
                        const isUrl = rawInput.trim().startsWith('http');
                        if (isUrl || rawInput.length > 50 || rawInput.includes('\n')) {
                          handleProcess(rawInput, isUrl ? 'url' : 'text');
                        } else {
                          addQuickItem(null, rawInput);
                        }
                      }
                    }}
                  />
                  <div className="absolute right-3 flex items-center gap-2">
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                    ) : (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        disabled={isLoading}
                        className="h-8 w-8 text-orange-500 hover:text-orange-600"
                        onClick={() => {
                          if (rawInput) {
                            const isUrl = rawInput.trim().startsWith('http');
                            if (isUrl || rawInput.length > 50 || rawInput.includes('\n')) {
                              handleProcess(rawInput, isUrl ? 'url' : 'text');
                            } else {
                              addQuickItem(null, rawInput);
                            }
                          }
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <Button 
                  variant="outline" 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 md:flex-none border-gray-200 hover:bg-orange-50 h-12 md:h-10 gap-2"
                >
                  <FileUp className="w-4 h-4" />
                  <span className="md:hidden">Upload File</span>
                </Button>
                {user && !user.isAnonymous && (
                  <Button 
                    variant="outline" 
                    onClick={() => setIsLibraryOpen(true)}
                    className="hidden md:flex border-gray-200 hover:bg-orange-50 hover:text-orange-600 h-10 gap-2 items-center"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Library</span>
                  </Button>
                )}
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,application/pdf" />

                <div className="flex bg-gray-100 p-1 rounded-lg flex-1 md:flex-none h-12 md:h-10">
                  <Button 
                    variant={unitSystem === 'Metric' ? 'default' : 'ghost'} 
                    size="sm"
                    className={`flex-1 text-[10px] font-bold h-full ${unitSystem === 'Metric' ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-500' : 'text-gray-500'}`}
                    onClick={() => setUnitSystem('Metric')}
                  >
                    METRIC
                  </Button>
                  <Button 
                    variant={unitSystem === 'Imperial' ? 'default' : 'ghost'} 
                    size="sm"
                    className={`flex-1 text-[10px] font-bold h-full ${unitSystem === 'Imperial' ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-500' : 'text-gray-500'}`}
                    onClick={() => setUnitSystem('Imperial')}
                  >
                    IMPERIAL
                  </Button>
                </div>

                {/* Desktop Settings Shortcut */}
                <div className="hidden md:block">
                  <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                    <DialogTrigger 
                      render={
                        <Button variant="outline" className="border-gray-200 hover:bg-orange-50 h-10 gap-2 text-gray-600">
                          <Settings2 className="w-4 h-4" />
                          <span>Settings</span>
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-4">
                        <Button variant="ghost" className="w-full text-[#C6727A] hover:bg-[#C6727A]/8 hover:text-[#9C5860] font-semibold" onClick={() => { setIsSettingsOpen(false); setShowClearConfirm(true); }}>Clear All Items</Button>
                        <Button variant="outline" className="w-full" onClick={exportPDF}>Export to PDF</Button>

                        <div className="pt-2">
                          {!user || user.isAnonymous ? (
                            <Button 
                              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold gap-2"
                              onClick={async () => {
                                setIsLoading(true);
                                try {
                                  setIsSettingsOpen(false);
                                  await signInWithGoogle();
                                  toast.success("Successfully logged in!");
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.WRITE, 'auth/login');
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                            >
                              <ChefHat className="w-4 h-4" />
                              Log In to Save Data
                            </Button>
                          ) : (
                            <>
                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest text-center">Active User</p>
                              <p className="text-xs text-center text-gray-600 mb-4 truncate">{user?.email || 'Authenticated User'}</p>
                              <Button 
                                variant="ghost" 
                                className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 gap-2"
                                onClick={async () => {
                                  setIsLoading(true);
                                  try {
                                    setRecipes([]);
                                    setIngredients([]);
                                    setRawInput('');
                                    setUser(null);
                                    await logout();
                                    setIsSettingsOpen(false);
                                    toast.info("Logged out successfully");
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.WRITE, 'auth/logout');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                              >
                                <LogOut className="w-4 h-4" />
                                Log Out
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

           {/* Mobile Toggle Button */}
            <div className={`md:hidden absolute left-0 w-full flex justify-center pointer-events-none ${isInputHeroExpanded ? 'bottom-8' : 'inset-y-0 items-center'}`}>
              <Button 
                variant="ghost"
                size="icon"
                className="pointer-events-auto h-9 w-9 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-md"
                onClick={() => setIsInputHeroExpanded(!isInputHeroExpanded)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </Button>
            </div>

          {/* Mobile Right-Side Actions (Hamburger, Add New, Settings) */}
            <div className={`md:hidden absolute flex items-center justify-end gap-3 z-50 ${isInputHeroExpanded ? 'top-8 right-8' : 'inset-y-0 right-4'}`}>
              
              {/* ADD NEW Button (Icon Only for Mobile Polish) */}
              {!isInputHeroExpanded && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                  onClick={() => setIsInputHeroExpanded(true)}
                  title="Add New Item"
                >
                  <Plus className="w-5 h-5" />
                </Button>
              )}

              {/* Library Trigger (Mobile) */}
             {user && !user.isAnonymous && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-gray-500 hover:text-orange-500"
                  onClick={() => setIsLibraryOpen(true)}
                >
                  <BookOpen className="w-5 h-5" />
                </Button>
              )}

              {/* Settings Icon */}
              <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <DialogTrigger 
                  render={
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-500 hover:text-gray-900">
                      <Settings2 className="w-5 h-5" />
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <Button variant="ghost" className="w-full text-[#C6727A] hover:bg-[#C6727A]/8 hover:text-[#9C5860] font-semibold" onClick={() => { setIsSettingsOpen(false); setShowClearConfirm(true); }}>Clear All Items</Button>
                    <Button variant="outline" className="w-full" onClick={exportPDF}>Export to PDF</Button>
                    
                    <div className="pt-2">
                      {!user || user.isAnonymous ? (
                        <Button 
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold gap-2"
                          onClick={async () => {
                            setIsLoading(true);
                            try {
                              setIsSettingsOpen(false);
                              await signInWithGoogle();
                              toast.success("Successfully logged in!");
                            } catch (error) {
                              handleFirestoreError(error, OperationType.WRITE, 'auth/login');
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                        >
                          <ChefHat className="w-4 h-4" />
                          Log In to Save Data
                        </Button>
                      ) : (
                        <>
                          <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest text-center">Active User</p>
                          <p className="text-xs text-center text-gray-600 mb-4 truncate">{user?.email || 'Authenticated User'}</p>
                          <Button 
                            variant="ghost" 
                            className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 gap-2"
                            onClick={async () => {
                              setIsLoading(true);
                              try {
                                setRecipes([]);
                                setIngredients([]);
                                setRawInput('');
                                setUser(null);
                                await logout();
                                setIsSettingsOpen(false);
                                toast.info("Logged out successfully");
                              } catch (error) {
                                handleFirestoreError(error, OperationType.WRITE, 'auth/logout');
                              } finally {
                                setIsLoading(false);
                              }
                            }}
                          >
                            <LogOut className="w-4 h-4" />
                            Log Out
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

            </div>
          </div>
        </header>
        
        <main className={`flex-1 min-h-0 flex flex-col p-4 md:px-8 md:pt-4 md:pb-2 max-w-full transition-all duration-300 ${!isInputHeroExpanded ? 'max-md:pt-20' : ''}`}>        {isLoading && (
          <div className="fixed inset-0 z-[100] bg-white/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
              <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
              <p className="font-medium text-gray-600">Processing Recipe...</p>
            </div>
          </div>
        )}
{/* Target: Inside App.tsx main return */}
{(!user || user.isAnonymous) && (
        <div className="max-w-7xl mx-auto mb-8 py-1.5 px-6 bg-orange-50 border border-orange-200 rounded-3xl flex flex-col md:flex-row items-center justify-start gap-3 shadow-sm shadow-orange-100">  <div className="flex items-center gap-5">
      <div className="flex-shrink-0">
          <ChefHat className="w-7 h-7 text-orange-600" />
        </div>
      <div>
        <p className="text-sm font-bold text-orange-900">Keep Your Progress</p>
        <p className="text-xs text-orange-700">Unlock categorized PDF exports and save your recipes.</p>
      </div>
    </div>
    <Button 
      variant="default" 
      size="sm" 
      disabled={isLoading}
      className="bg-orange-600 hover:bg-orange-700 text-white font-bold"
      onClick={async () => {
        // SURGICAL FIX: Optional chaining prevents the null crash
        const oldUid = user?.uid; 
        setIsLoading(true); 
        try {
          const result = await signInWithGoogle();
          
          // Guardrail: Only attempt migration if we came from an active anonymous session
          if (result.user && oldUid && user?.isAnonymous) {
            await migrateGuestData(oldUid, result.user.uid, result.user.email);
            toast.success("Account secured! Data migrated.");
          } else if (result.user) {
            toast.success("Successfully logged in!");
          }
        } catch (error: any) {
          handleFirestoreError(error, OperationType.MIGRATE, 'migration');
          toast.error("Sign in failed. Please try again.");
        } finally {
          setIsLoading(false);
        }
      }}
    >
      {isLoading ? "SECURING..." : "Sign In"}
    </Button>
  </div>
)}

        {recipes.length > 0 && (
          <div className="max-w-7xl mx-auto mb-3 w-full px-1">
            <div 
              className="flex items-center gap-1.5 mb-2 cursor-pointer group w-fit"
              onClick={() => setIsLegendExpanded(!isLegendExpanded)}
            >
              <motion.div
                animate={{ rotate: isLegendExpanded ? 0 : -90 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-orange-500" />
              </motion.div>
              <h3 className="font-bold text-[10px] md:text-xs text-gray-500 uppercase tracking-widest flex items-center gap-2">
                Active Recipes 
                <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[10px]">{recipes.length}</span>
              </h3>
            </div>

            <AnimatePresence>
              {isLegendExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 py-2">
                    {recipes.map((recipe) => (
              <motion.div
                key={recipe.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: recipe.isActive ? 1 : 0.5 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className={`group flex items-center gap-2 bg-white border px-3 py-1.5 rounded-2xl transition-all ${
                  recipe.isActive ? 'border-gray-200 hover:border-orange-200' : 'border-gray-100 bg-gray-50/50'
                }`}
              >
                <button 
                  onClick={() => toggleRecipe(recipe.id)}
                  className={`transition-colors ${recipe.isActive ? 'text-orange-500' : 'text-gray-300'}`}
                >
                  {recipe.isActive ? (
                    <CheckCircle2 className="w-4 h-4 fill-orange-50" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </button>
                
                <input
                  key={`title-${recipe.id}-${recipe.title}`}
                  defaultValue={recipe.title}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={async (e) => {
                    const newTitle = e.target.value.trim();
                    if (newTitle && newTitle !== recipe.title) {
                      try {
                        await updateDoc(doc(db, 'recipes', recipe.id), { title: newTitle });
                      } catch (error: any) {
                        handleFirestoreError(error, OperationType.UPDATE, 'recipes/title');
                        e.target.value = recipe.title; // Revert UI on DB failure
                      }
                    } else {
                      e.target.value = recipe.title; // Revert if left completely empty
                    }
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation(); // Prevent drag/drop or toggle interference
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      e.currentTarget.value = recipe.title; // Revert text
                      e.currentTarget.blur(); // Drop focus
                    }
                  }}
                  className={`text-xs font-medium transition-all bg-transparent border-none outline-none p-0 m-0 w-[100px] sm:w-[150px] truncate focus:ring-0 cursor-text hover:text-orange-600 focus:text-orange-600 ${
                    recipe.isActive ? 'text-gray-700' : 'text-gray-400 line-through'
                  }`}
                  title="Click to edit name"
                />

                <div className="flex items-center bg-gray-100 rounded-lg px-1 py-0.5 ml-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateMultiplier(recipe.id, 'down'); }}
                    className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-orange-600 disabled:opacity-30"
                    disabled={recipe.multiplier <= 0.5}
                  >
                    <span className="text-xs font-bold">-</span>
                  </button>
                  <span className="text-[10px] font-bold px-1 min-w-[24px] text-center text-gray-600">
                    {recipe.multiplier}x
                  </span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateMultiplier(recipe.id, 'up'); }}
                    className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-orange-600"
                  >
                    <span className="text-xs font-bold">+</span>
                  </button>
                </div>

                {/* The Evolved Bookmark Toggle (No disabled locks) */}
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const isSaved = libraryRecipes.some(r => r.id === recipe.id);
                    if (isSaved) {
                      removeFromLibrary(recipe.id);
                    } else {
                      saveToLibrary(recipe.id);
                    }
                  }}
                  className={`transition-colors flex items-center justify-center ${
                    libraryRecipes.some(r => r.id === recipe.id)
                      ? 'text-orange-500 hover:text-red-500' 
                      : 'text-gray-400 hover:text-orange-500'
                  }`}
                  title={libraryRecipes.some(r => r.id === recipe.id) ? "Remove from Library" : "Save to Library"}
                >
                  <Bookmark className={`w-3.5 h-3.5 ${libraryRecipes.some(r => r.id === recipe.id) ? 'fill-orange-500' : ''}`} />
                </button>
                
                <button
                  onClick={(e) => { e.stopPropagation(); openActiveRecipeEditor(recipe); }}
                  className="text-gray-400 hover:text-orange-500 transition-all md:opacity-0 md:group-hover:opacity-100"
                  title="View / edit ingredients"
                >
                  <Pencil className="w-3 h-3" />
                </button>

                <Separator orientation="vertical" className="h-3 mx-1" />

                <button
                  onClick={(e) => { e.stopPropagation(); removeRecipe(recipe.id); }}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {processedIngredients.length === 0 && (
          <div className="max-w-7xl mx-auto w-full mb-4 px-2">
            <div className="max-w-2xl">
              <p className="text-sm text-gray-700 font-medium">Paste a recipe URL or ingredient above.</p>
              <p className="text-xs text-gray-500 mt-1">Grouper handles scaling, duplicate merging, and rounds to real shopping units.</p>
            </div>
          </div>
        )}

{/* Kanban: 7 categories × w-56 (224px) + 6 × gap-6 (24px) = 1712px total. max-w-[1750px] gives ~38px buffer; all columns fit without horizontal scroll on viewports ≥ 1814px (account for main's p-8 padding). Below that width, overflow-x-auto on the inner container kicks in. */}
        <div className="relative max-w-[1750px] mx-auto w-full flex-1 min-h-0">
        <div ref={kanbanRef} className="flex gap-6 w-full h-full overflow-x-auto snap-x snap-mandatory lg:snap-none scroll-smooth scroll-pl-4 md:scroll-pl-8 pb-4 overscroll-contain custom-scrollbar">
          {sortedCategories.map((category) => {
              const items = processedIngredients.filter(i => i.category === category);
              const isCollapsed = collapsedCategories.has(category);

              return (
              <div
                  key={category}
                  className={`flex-shrink-0 flex flex-col gap-4 transition-all duration-300 ease-in-out h-full snap-start snap-always lg:snap-none ${isCollapsed ? 'w-[24px]' : 'w-full md:w-56'}`}
                  onDragOver={handleKanbanDragOver}
                  onDrop={(e) => handleKanbanDrop(e, category)}
                > 
                  <div 
                    className={`flex items-center ${isCollapsed ? 'flex-col gap-4' : 'justify-between px-2'} cursor-pointer group`}
                    onClick={() => toggleCategory(category)}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'flex-col gap-4' : 'gap-2'} overflow-hidden`}>
                      <motion.div
                        animate={{ rotate: isCollapsed ? -90 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-orange-500" />
                      </motion.div>
                      {!isCollapsed ? (
                        <div className="flex items-center gap-2">
                          <h2 className="font-bold text-sm uppercase tracking-widest text-gray-500 truncate">{category}</h2>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-5 w-5 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQuickAddCategory(category);
                            }}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap py-4">
                          {category} <span className="text-orange-500/50 ml-2">{items.length}</span>
                        </div>
                      )}
                    </div>
                    {!isCollapsed && (
                      <Badge variant="secondary" className="bg-gray-200 text-gray-700">{items.length}</Badge>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div 
                      className="flex-1 overflow-y-auto bg-gray-100/50 rounded-2xl p-3 border border-gray-200/50 flex flex-col gap-3 min-h-0 custom-scrollbar"
                    >
                      {quickAddCategory === category && (
                        <div className="bg-white p-2 rounded-xl border border-orange-200 shadow-sm flex gap-2">
                          <Input 
                            autoFocus
                            disabled={isLoading}
                            placeholder="Add item..."
                            className="h-8 text-xs"
                            value={quickAddValue}
                            onChange={(e) => setQuickAddValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addQuickItem(category, quickAddValue);
                              if (e.key === 'Escape') setQuickAddCategory(null);
                            }}
                          />
                          <Button 
                            size="sm" 
                            disabled={isLoading}
                            className="h-8 px-2 bg-orange-500 hover:bg-orange-600" 
                            onClick={() => addQuickItem(category, quickAddValue)}
                          >
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          </Button>
                        </div>
                      )}
                      
                    <AnimatePresence mode="popLayout">
                      {items.map((item) => (
                        <Tooltip key={item.id}>
                          {/* TARGET 1: Restored standard asChild syntax to fix the DOM and group-hover classes */}
                          <TooltipTrigger asChild>
                           <motion.div
                              layout
                              draggable
                              onDragStart={(e: any) => handleKanbanDragStart(e, item.id)}
                              onDragOver={(e: any) => handleItemMergeDragOver(e, item.id)}
                              onDragLeave={handleItemMergeDragLeave}
                              onDrop={(e: any) => handleItemMergeDrop(e, item)}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className={`group bg-white pl-4 pr-2 py-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 
                                ${item.checked ? 'opacity-40' : ''}
                                ${mergeTargetId === item.id 
                                  ? 'border-orange-500 bg-orange-50 shadow-md scale-[1.02] ring-2 ring-orange-200' 
                                  : 'border-gray-100 shadow-sm hover:shadow-md'
                                }
                              `}
                              onClick={() => toggleItem(item.id)}
                            >
                              {/* TARGET 2: Added flex-shrink-0 to prevent squishing */}
                              <button className="mt-1 shrink-0">
                                {item.checked ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500 fill-green-50" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-300" />
                                )}
                              </button>
                              
                              <div className="flex-1 min-w-0">
                                <p className={`font-semibold text-sm truncate flex items-center gap-1.5 ${item.checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                  {item.name}
                                </p>
                                <div className="flex items-center gap-1.5 mt-0.5 min-h-[1.5rem]">
                                  {!item.hideQuantity && (
                                    <p className={`text-xs border-b border-dotted border-gray-300 inline-block transition-opacity duration-200 ${item.isManual ? 'italic text-gray-400' : 'text-gray-500'} mr-1`}>
                                      {item.displayOverride || item.displayString || (item.mpuQuantity ? (
                                        `${item.mpuQuantity % 1 === 0 ? item.mpuQuantity : item.mpuQuantity.toFixed(1)} ${item.mpuUnit}`
                                      ) : (
                                        `${item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)} ${item.unit}`
                                      ))}
                                      {item.isManual && ' *'}
                                    </p>
                                  )}
                                  
                                  {/* Action Buttons Grouped Together */}
                                  <div className="flex items-center opacity-100 transition-opacity shrink-0 gap-0.5">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); toggleHideQuantity(item.id); }}
                                      className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all duration-200"
                                      title={item.hideQuantity ? "Show quantity" : "Hide quantity"}
                                    >
                                      {item.hideQuantity ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button 
                                      className="p-1.5 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all duration-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingItem(item);
                                      }}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all duration-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteItem(item.id);
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs bg-white text-gray-700 border border-gray-200 shadow-lg p-2 text-[10px]">
                            <div className="font-medium mb-1 border-b pb-1 border-gray-100">Source Lineage:</div>
                            <div className="flex flex-wrap gap-1">
                              {item.lineage?.map((l, idx) => (
                                <span key={idx} className="bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                  {l.label}
                                </span>
                              )) || 'Unknown'}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </AnimatePresence>
                      
                      {items.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 opacity-40">
                          <ShoppingCart className="w-8 h-8 mb-2" />
                          <p className="text-xs font-medium">Empty</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#F8F9FA] to-transparent" aria-hidden="true" />
        </div>
      </main>

      {/* --- B-010 LEGAL BETA DISCLAIMER ---
          Collapsed by default for a clean footer; trigger label provides
          constructive notice, full text one click away. shrink-0 so it
          never competes with main for vertical space inside the Wix iframe
          (h-[100dvh] outer flex column). */}
      <footer className="shrink-0 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-2">
        <div className="max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => setIsDisclaimerOpen(open => !open)}
            aria-expanded={isDisclaimerOpen}
            aria-controls="legal-disclaimer-body"
            className="flex items-center gap-1 text-[10px] md:text-[11px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
          >
            <span>Legal &amp; Disclaimer</span>
            <ChevronDown
              aria-hidden="true"
              className={`w-3 h-3 transition-transform duration-200 ${isDisclaimerOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isDisclaimerOpen && (
            <div
              id="legal-disclaimer-body"
              className="mt-1.5 text-[10px] md:text-[11px] text-gray-500 leading-snug space-y-1"
            >
              <p>
                <span className="font-semibold text-gray-700">Beta software</span>
                <span className="text-gray-400 mx-1">·</span>
                AI-parsed recipes from third-party sources. Always verify ingredients, quantities, and allergens.
              </p>
              <p>
                Grouper is not affiliated with recipe authors and makes no warranty of accuracy. Not a substitute for professional dietary or medical advice.
              </p>
            </div>
          )}
        </div>
      </footer>

      <Sheet open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <SheetContent id="chefflow-root" side="left" className="w-[320px] sm:w-[400px] p-0 border-r-0">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="flex items-center gap-1.5 md:gap-2">
              <div className="bg-orange-500 p-2 rounded-xl shadow-lg shadow-orange-200">
                <BookOpen className="text-white w-4 h-4 md:w-6 md:h-6" />
              </div>
              <span className="text-base md:text-xl font-bold tracking-tight leading-none">Library</span>
            </SheetTitle>
          </SheetHeader>
          
          <Tabs defaultValue="recipes" className="w-full flex-1 flex flex-col min-h-0">
            <TabsList className="hidden w-full justify-start rounded-none bg-transparent border-b h-12 px-6">
              <TabsTrigger 
                value="recipes" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent shadow-none h-full text-xs font-bold uppercase tracking-widest"
              >
                All Recipes
              </TabsTrigger>
              <TabsTrigger 
                value="menus" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:bg-transparent shadow-none h-full text-xs font-bold uppercase tracking-widest"
              >
                Saved Menus
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="recipes" className="px-4 pt-4 m-0 overflow-y-auto flex-1 min-h-0 pb-32">
  {libraryRecipes.length === 0 ? (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50 mt-4">
      <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
      <p className="text-sm font-bold text-gray-600">Your library is empty</p>
      <p className="text-xs text-gray-400 mt-1">Click the bookmark icon on any active recipe to save it here.</p>
    </div>
  ) : (
    <>
      {/* Toolbar: search + (subtle) sort. Category filter SHELVED 2026-05-30 — see below. */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            value={librarySearch}
            onChange={(e) => setLibrarySearch(e.target.value)}
            placeholder="Search recipes or ingredients..."
            className="pl-9 h-10 bg-gray-50/50 border-gray-100 focus:bg-white transition-all"
          />
        </div>

        <select
          value={librarySort}
          onChange={(e) => setLibrarySort(e.target.value)}
          aria-label="Sort recipes"
          className="self-end h-7 rounded-md border-0 bg-transparent pr-1 text-xs font-medium text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-0 cursor-pointer transition-colors"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="az">Title A–Z</option>
          <option value="za">Title Z–A</option>
          <option value="most">Most ingredients</option>
          <option value="fewest">Fewest ingredients</option>
        </select>

        {/* SHELVED 2026-05-30: category filter chips hidden for now; logic (availableCategories /
            libraryCategories / toggleLibraryCategory) stays wired. Re-enable by deleting `false &&`. */}
        {false && availableCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableCategories.map((cat) => {
              const active = libraryCategories.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleLibraryCategory(cat)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                    active
                      ? 'bg-orange-500 border-orange-500 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-orange-200'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filteredLibraryRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
          <Search className="w-8 h-8 text-gray-300 mb-3" />
          <p className="text-sm font-bold text-gray-600">No recipes match</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search or filter.</p>
          <Button
            variant="ghost"
            onClick={clearLibraryFilters}
            className="mt-3 h-8 text-xs font-bold text-orange-500 hover:text-orange-600 hover:bg-orange-50"
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredLibraryRecipes.map((recipe) => (
        <div key={recipe.id} className="flex flex-col p-3 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-orange-200 transition-colors group">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-gray-800 truncate">{recipe.title}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                {recipe.ingredients?.length || 0} Ingredients
              </span>
            </div>
            
            {/* The Correctly Nested Button Cluster */}
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                onClick={() => loadFromLibrary(recipe)}
                title="Push to Board"
              >
                <Plus className="w-4 h-4" />
              </Button>
              
              {/* NEW: Edit Trigger */}
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                onClick={() => setEditingLibraryRecipe(recipe)}
                title="Edit Library Recipe"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              {/* END NEW */}

              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                onClick={() => removeFromLibrary(recipe.id)}
                title="Remove from Library"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

          </div>
        </div>
          ))}
        </div>
      )}
    </>
  )}
            </TabsContent>
            
            <TabsContent value="menus" className="p-6 m-0 overflow-y-auto flex-1 min-h-0 pb-32">
              {/* Target: App.tsx - Inside <TabsContent value="menus"> */}
              <div className="mb-6 space-y-3">
                <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-1">Create New Menu</label>
                <div className="flex gap-2">
                  <Input 
                    placeholder="e.g. Week 1 Meal Plan" 
                    value={menuTitleInput}
                    onChange={(e) => setMenuTitleInput(e.target.value)}
                    className="h-10 bg-gray-50/50 border-gray-100 focus:bg-white transition-all shadow-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateMenu(e)}
                  />
                 <Button 
                  onClick={handleCreateMenu} 
                  disabled={!menuTitleInput.trim() || isLoading}
                  className="bg-[#1A1A1A] hover:bg-black text-white shrink-0 shadow-md transition-all active:scale-95 w-12"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
                </div>
              </div>

              {libraryMenus.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
                  <BookOpen className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-sm font-bold text-gray-600">No menus yet</p>
                  <p className="text-xs text-gray-400 mt-1">Bundle your saved recipes into meal plans.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {libraryMenus.map((menu) => (
                    <div key={menu.id} className="flex flex-col p-4 bg-white border border-gray-100 rounded-xl shadow-sm hover:border-orange-200 transition-all group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-black text-gray-800 truncate">{menu.title}</span>
                          <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mt-1 bg-orange-50 w-fit px-2 py-0.5 rounded-md">
                            {menu.recipeIds?.length || 0} Recipes
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-400 hover:text-orange-500 hover:bg-orange-50"
                            onClick={() => loadMenuToBoard(menu)}
                            disabled={!menu.recipeIds?.length || isLoading}
                            title="Push Menu to Board"
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                            onClick={() => setManagingMenu(menu)}
                            title="Manage Recipes"
                          >
                            <Settings2 className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50"
                            onClick={() => deleteMenu(menu.id)}
                            title="Delete Menu"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <Toaster position="bottom-right" />

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Ingredient</DialogTitle></DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input 
                  value={editingItem.name} 
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input 
                    type="number"
                    value={editingItem.quantity} 
                    onChange={(e) => setEditingItem({ ...editingItem, quantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Unit</label>
                  <Input 
                    value={editingItem.unit} 
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                  />
                </div>
              </div>
              <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => updateItem(editingItem.id, editingItem)}>
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
     

{/* --- LIBRARY RECIPE EDITOR DIALOG --- */}
<Dialog open={!!editingActiveRecipe} onOpenChange={(open) => !open && setEditingActiveRecipe(null)}>
  <DialogPortal container={document.getElementById('chefflow-root') || document.body}>
    <DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-6 bg-white rounded-2xl shadow-2xl z-[10000] border-none outline-none overflow-hidden">
      <DialogHeader className="mb-6 flex flex-row items-center justify-between">
        <DialogTitle className="text-xl font-black text-gray-900 tracking-tight">Edit Recipe</DialogTitle>
      </DialogHeader>

      {editingActiveRecipe && (
        <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-4">

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-1">Recipe Name</label>
            <Input
              value={editingActiveRecipe.title || ''}
              onChange={(e) => setEditingActiveRecipe({ ...editingActiveRecipe, title: e.target.value })}
              className="font-bold text-gray-800 border-gray-100 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-all h-11"
              placeholder="e.g. Signature Basil Pesto"
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-[70px_40px_1fr_32px] gap-2 pl-1 pr-0">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Qty</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Unit</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">Name</span>
              <span></span>
            </div>

            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout">
                {editingActiveRecipe.ingredients.map((ing: any, idx: number) => (
                  <motion.div
                    layout
                    key={ing.id ?? idx}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 5 }}
                    className="grid grid-cols-[70px_40px_1fr_32px] gap-2 items-center"
                  >
                    <Input
                      className="h-9 text-xs px-2 bg-gray-50 border-gray-100 font-bold text-center focus:ring-orange-100 shadow-sm"
                      type="number"
                      step="any"
                      value={ing.quantity ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsedVal = val === '' ? '' : parseFloat(val);
                        const newIngredients = editingActiveRecipe.ingredients.map((item: any, i: number) =>
                          i === idx ? { ...item, quantity: parsedVal } : item
                        );
                        setEditingActiveRecipe({ ...editingActiveRecipe, ingredients: newIngredients });
                      }}
                    />

                    <select
                      className="h-9 text-[10px] px-1 bg-gray-50 border border-gray-100 rounded-md font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-100 appearance-none text-center cursor-pointer shadow-sm"
                      value={ing.unit || 'ea'}
                      onChange={(e) => {
                        const newIngredients = editingActiveRecipe.ingredients.map((item: any, i: number) =>
                          i === idx ? { ...item, unit: e.target.value } : item
                        );
                        setEditingActiveRecipe({ ...editingActiveRecipe, ingredients: newIngredients });
                      }}
                    >
                      {['ea', 'oz', 'lb', 'g', 'kg', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'bunch', 'head', 'pinch'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    <Input
                      className="h-9 text-xs px-3 bg-gray-50 border-gray-100 focus:bg-white focus:ring-orange-100 shadow-sm"
                      placeholder="Ingredient name..."
                      value={ing.name || ''}
                      onChange={(e) => {
                        const newIngredients = editingActiveRecipe.ingredients.map((item: any, i: number) =>
                          i === idx ? { ...item, name: e.target.value } : item
                        );
                        setEditingActiveRecipe({ ...editingActiveRecipe, ingredients: newIngredients });
                      }}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors rounded-full"
                      onClick={() => {
                        const newIngredients = editingActiveRecipe.ingredients.filter((_: any, i: number) => i !== idx);
                        setEditingActiveRecipe({ ...editingActiveRecipe, ingredients: newIngredients });
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-[10px] font-black text-orange-600 border-orange-100 hover:bg-orange-50 border-dashed gap-2 h-10 tracking-widest uppercase transition-all active:scale-[0.98]"
                  onClick={() => {
                    const newIng = { id: Math.random().toString(36).substr(2, 9), name: '', quantity: 1, unit: 'ea', category: 'Needs Sorting' };
                    setEditingActiveRecipe({
                      ...editingActiveRecipe,
                      ingredients: [...editingActiveRecipe.ingredients, newIng]
                    });
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  ADD INGREDIENT
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4 mt-2 border-t border-gray-100">
        <Button
          variant="outline"
          className="flex-1 h-11 font-bold text-gray-600 border-gray-200 hover:bg-gray-50"
          onClick={() => setEditingActiveRecipe(null)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold"
          onClick={updateActiveRecipe}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
        </Button>
      </div>
    </DialogContent>
  </DialogPortal>
</Dialog>

<Dialog open={!!editingLibraryRecipe} onOpenChange={(open) => !open && setEditingLibraryRecipe(null)}>
  <DialogPortal container={document.getElementById('chefflow-root') || document.body}>
<DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-6 bg-white rounded-2xl shadow-2xl z-[10000] border-none outline-none overflow-hidden">      <DialogHeader className="mb-6 flex flex-row items-center justify-between">
        <DialogTitle className="text-xl font-black text-gray-900 tracking-tight">Edit Library Recipe</DialogTitle>
      </DialogHeader>

      {editingLibraryRecipe && (
        <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-4">
          
          {/* Title Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest pl-1">Recipe Name</label>
            <Input 
              value={editingLibraryRecipe.title || ''} 
              onChange={(e) => setEditingLibraryRecipe({ ...editingLibraryRecipe, title: e.target.value })}
              className="font-bold text-gray-800 border-gray-100 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-orange-100 transition-all h-11"
              placeholder="e.g. Signature Basil Pesto"
            />
          </div>

          {/* 3-Column Grid */}
          <div className="space-y-4">
            
            {/* 1. Aligned Headers matching the Grid */}
            <div className="grid grid-cols-[70px_40px_1fr_32px] gap-2 pl-1 pr-0">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Qty</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Unit</span>
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest pl-1">Name</span>
              <span></span> {/* Spacer for X button */}
            </div>
            
            <div className="space-y-2.5">
              <AnimatePresence mode="popLayout">
                {editingLibraryRecipe.ingredients.map((ing: any, idx: number) => (
                  <motion.div 
                    layout
                    key={idx} 
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 5 }}
                    className="grid grid-cols-[70px_40px_1fr_32px] gap-2 items-center"
                  >
                    <Input 
                      className="h-9 text-xs px-2 bg-gray-50 border-gray-100 font-bold text-center focus:ring-orange-100 shadow-sm"
                      type="number"
                      step="any"
                      value={ing.quantity ?? ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const parsedVal = val === '' ? '' : parseFloat(val);
                        const newIngredients = editingLibraryRecipe.ingredients.map((item: any, i: number) => 
                          i === idx ? { ...item, quantity: parsedVal } : item
                        );
                        setEditingLibraryRecipe({ ...editingLibraryRecipe, ingredients: newIngredients });
                      }}
                    />
                    
                    <select
                      className="h-9 text-[10px] px-1 bg-gray-50 border border-gray-100 rounded-md font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-100 appearance-none text-center cursor-pointer shadow-sm"
                      value={ing.unit || 'ea'}
                      onChange={(e) => {
                        const newIngredients = editingLibraryRecipe.ingredients.map((item: any, i: number) => 
                          i === idx ? { ...item, unit: e.target.value } : item
                        );
                        setEditingLibraryRecipe({ ...editingLibraryRecipe, ingredients: newIngredients });
                      }}
                    >
                      {['ea', 'oz', 'lb', 'g', 'kg', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'bunch', 'head', 'pinch'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    <Input 
                      className="h-9 text-xs px-3 bg-gray-50 border-gray-100 focus:bg-white focus:ring-orange-100 shadow-sm"
                      placeholder="Ingredient name..."
                      value={ing.name || ''} 
                      onChange={(e) => {
                        const newIngredients = editingLibraryRecipe.ingredients.map((item: any, i: number) => 
                          i === idx ? { ...item, name: e.target.value } : item
                        );
                        setEditingLibraryRecipe({ ...editingLibraryRecipe, ingredients: newIngredients });
                      }}
                    />

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors rounded-full"
                      onClick={() => {
                        const newIngredients = editingLibraryRecipe.ingredients.filter((_: any, i: number) => i !== idx);
                        setEditingLibraryRecipe({ ...editingLibraryRecipe, ingredients: newIngredients });
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </AnimatePresence>

              <div className="pt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-[10px] font-black text-orange-600 border-orange-100 hover:bg-orange-50 border-dashed gap-2 h-10 tracking-widest uppercase transition-all active:scale-[0.98]"
                  onClick={() => {
                    const newIng = { id: Math.random().toString(36).substr(2, 9), name: '', quantity: 1, unit: 'ea', category: 'Needs Sorting' };
                    setEditingLibraryRecipe({
                      ...editingLibraryRecipe,
                      ingredients: [...editingLibraryRecipe.ingredients, newIng]
                    });
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  ADD INGREDIENT
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="pt-6 mt-2 border-t border-gray-100">
        <Button 
          className="w-full bg-orange-500 hover:bg-orange-600 font-black text-white shadow-xl shadow-orange-100 h-12 tracking-widest uppercase text-xs transition-all active:scale-[0.98] disabled:opacity-50" 
          onClick={updateLibraryRecipe}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>SAVING...</span>
            </div>
          ) : (
            'SAVE CHANGES'
          )}
        </Button>
      </div>
    </DialogContent>
  </DialogPortal>
</Dialog>
      {/* --- END LIBRARY RECIPE EDITOR DIALOG --- */}

      {/* --- MENU MANAGER DIALOG --- */}
      <Dialog open={!!managingMenu} onOpenChange={(open) => !open && setManagingMenu(null)}>
        <DialogPortal container={document.getElementById('chefflow-root') || document.body}>
          <DialogContent className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-md max-h-[80vh] flex flex-col p-6 bg-white rounded-2xl shadow-2xl z-[10000] border-none outline-none overflow-hidden">
            <DialogHeader className="mb-6 shrink-0">
              <DialogTitle className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-orange-500" />
                Manage Menu
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1 font-medium">{managingMenu?.title}</p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pb-2 px-1">
              {libraryRecipes.length === 0 ? (
                <div className="py-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Library Empty</p>
                  <p className="text-[10px] text-gray-400 px-4 mt-1 leading-relaxed">Save recipes to your library first to add them to menus.</p>
                </div>
              ) : (
                libraryRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => managingMenu && toggleRecipeInMenu(managingMenu.id, recipe.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left group ${
                      libraryMenus.find(m => m.id === managingMenu?.id)?.recipeIds.includes(recipe.id)
                        ? 'border-orange-200 bg-orange-50 shadow-sm'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-4">
                      <span className="text-xs font-bold text-gray-800 truncate">{recipe.title}</span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                        {recipe.ingredients?.length || 0} Ingredients
                      </span>
                    </div>
                    
                    <div className={`shrink-0 transition-all ${
                       libraryMenus.find(m => m.id === managingMenu?.id)?.recipeIds.includes(recipe.id)
                        ? 'text-orange-500 scale-110'
                        : 'text-gray-200 group-hover:text-gray-300'
                    }`}>
                      {libraryMenus.find(m => m.id === managingMenu?.id)?.recipeIds.includes(recipe.id) ? (
                        <CheckCircle2 className="w-5 h-5 fill-white" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="pt-6 mt-4 border-t border-gray-100 shrink-0">
              <Button 
                className="w-full bg-[#1A1A1A] hover:bg-black text-white font-black h-11 uppercase text-[10px] tracking-widest transition-all active:scale-95"
                onClick={() => setManagingMenu(null)}
              >
                DONE
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>
      {/* --- END MENU MANAGER DIALOG --- */}

{/* --- ACTIVE INTERCEPT GUARDIAN MODAL --- */}
      <Dialog 
        open={!!guardianUI} 
        onOpenChange={(open) => {
          if (!open && rejectGuardianRef.current) {
            rejectGuardianRef.current(new Error("CANCELLED"));
            rejectGuardianRef.current = null;
            resolveGuardianRef.current = null;
            setGuardianUI(null);
          }
        }}
      >
        <DialogPortal>
          {/* Prevent accidental dismissal via backdrop or escape key */}
          <DialogContent 
            className="w-[95vw] max-w-md rounded-2xl p-6 shadow-2xl z-[10000] border-none"
            {...({
              onInteractOutside: (e: any) => e.preventDefault(),
              onEscapeKeyDown: (e: any) => e.preventDefault()
            } as any)}
          >
            <DialogHeader className="mb-2 text-left">
              <DialogTitle className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-orange-500" />
                Clarify Measurements
              </DialogTitle>
              <p className="text-xs text-gray-500 mt-1 font-medium leading-relaxed">
                We found some vague amounts in <span className="font-bold text-gray-800">{guardianUI?.title}</span>. Please clarify them so your math stays perfect.
              </p>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto max-h-[50vh] space-y-3 py-4 custom-scrollbar">
              {guardianUI?.items.map((item, idx) => (
                <div key={idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.isAmbiguous ? 'bg-orange-50/50 border-orange-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    {item.isAmbiguous ? (
                      <Input
                        type="text"
                        value={item.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGuardianUI(prev => {
                            if (!prev) return prev;
                            const newItems = [...prev.items];
                            newItems[idx] = { ...newItems[idx], name: val };
                            return { ...prev, items: newItems };
                          });
                        }}
                        className="h-8 text-sm font-bold text-gray-900 bg-white border-orange-200 focus:ring-orange-200 px-2"
                      />
                    ) : (
                      <p className="text-sm font-bold text-gray-900 truncate">{item.name}</p>
                    )}
                    {item.isAmbiguous && <p className="text-[9px] font-black text-orange-500 uppercase tracking-widest mt-1">{item.ambiguityReason || "Needs clarification"}</p>}
                  </div>
                  
                  {item.isAmbiguous ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input 
                        type="number" 
                        step="any"
                        value={item.quantity === '' ? '' : item.quantity} 
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                          setGuardianUI(prev => {
                            if (!prev) return prev;
                            const newItems = [...prev.items];
                            newItems[idx] = { ...newItems[idx], quantity: val };
                            return { ...prev, items: newItems };
                          });
                        }}
                        className="w-16 h-9 text-xs font-bold text-center bg-white border-orange-200 focus:ring-orange-200"
                      />
                      <select 
                        value={item.unit || 'ea'} 
                        onChange={(e) => {
                          setGuardianUI(prev => {
                            if (!prev) return prev;
                            const newItems = [...prev.items];
                            newItems[idx] = { ...newItems[idx], unit: e.target.value };
                            return { ...prev, items: newItems };
                          });
                        }}
                        className="w-20 h-9 text-[10px] font-bold px-2 bg-white border border-orange-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-200 appearance-none text-center cursor-pointer"
                      >
                        {['ea', 'oz', 'lb', 'g', 'kg', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'bunch', 'head', 'pinch', 'clove', 'can'].map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-gray-500 shrink-0">{item.quantity} {item.unit}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <Button 
                variant="ghost" 
                className="text-gray-500 hover:text-gray-700 font-bold text-xs"
                onClick={() => {
                  if (rejectGuardianRef.current) rejectGuardianRef.current(new Error("CANCELLED"));
                  rejectGuardianRef.current = null;
                  resolveGuardianRef.current = null;
                  setGuardianUI(null);
                }}
              >
                CANCEL
              </Button>
              <Button 
                className="bg-orange-500 hover:bg-orange-600 text-white font-black text-xs tracking-widest uppercase shadow-md shadow-orange-100"
                onClick={() => {
                  if (resolveGuardianRef.current) {
                    // Sanitize: empty quantity → 1 (NaN guard); trim edited name
                    const sanitizedItems = guardianUI.items.map(i => ({
                      ...i,
                      name: typeof i.name === 'string' ? i.name.trim() || i.name : i.name,
                      quantity: Number(i.quantity) || 1
                    }));
                    resolveGuardianRef.current(sanitizedItems);
                  }
                  resolveGuardianRef.current = null;
                  rejectGuardianRef.current = null;
                  setGuardianUI(null);
                }}
              >
                CONFIRM & ADD
              </Button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* --- CLEAR ALL GUARDIAN MODAL ---
          Passive intercept per manifest absolute rule. Both Settings menus
          (mobile + desktop) close themselves and open this confirm instead
          of running clearAll() directly. Cancel returns to safe state.
          Destructive action uses DESIGN.md priority-critical token (#C6727A,
          brick-red), text-only treatment to avoid loud filled-red. */}
      <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <DialogContent id="chefflow-root" className="w-[95vw] max-w-sm rounded-2xl p-6 shadow-2xl z-[10000] border-none">
          <DialogHeader className="mb-2 text-left">
            <DialogTitle className="text-lg font-bold text-gray-900 tracking-tight">
              Clear all items?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 leading-relaxed py-2">
            This permanently deletes every active recipe and ingredient on your kanban. Saved Library recipes are unaffected.
          </p>
          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="ghost"
              className="text-gray-600 hover:bg-gray-100 hover:text-gray-900 font-medium"
              onClick={() => setShowClearConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              className="text-[#C6727A] hover:bg-[#C6727A]/10 hover:text-[#9C5860] font-semibold"
              onClick={async () => {
                try {
                  setShowClearConfirm(false);
                  await clearAll();
                } catch (error) {
                  // clearAll already routes through handleFirestoreError;
                  // try/catch here per CLAUDE.md absolute rule on top-level logic.
                  console.error('Clear All confirm failed:', error);
                }
              }}
            >
              Clear All Items
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    <Analytics />
    </TooltipProvider>
  );
}

  