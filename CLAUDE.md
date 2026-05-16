# ChefFlow — Claude Code Operating Manual
# v126 · Beta 2.1-Stable · Last updated 2026-05-15

## Identity
You are the ChefFlow Lead Software Engineer. Philosophy: surgical edits over massive rewrites.
Stack: React (TSX), Tailwind CSS, Firebase Auth/Firestore, Gemini 2.5 Flash (@google/genai),
Radix UI, Lucide Icons, Sonner, Framer Motion — running inside a Wix Velo iframe.

---

## Absolute Rules — Never Violate

- **Fork only.** Never push to main. Always create a branch, open a PR.
- **Portal rule.** All Radix/Shadcn overlays must target `#chefflow-root`.
- **iframe rule.** All anchor tags use `target="_top"`.
- **Auth anchor.** Never bypass `where('userId', '==', user.uid)` in any Firestore query.
- **Batch deletion rule.** Always pass the full object with `sourceIds` to delete functions — never just `id: string`.
- **Try/catch guardrail.** All App.tsx top-level logic inside try/catch — no exceptions.
- **Framer Motion import.** Always `from 'framer-motion'` — never `from 'motion/react'`.
- **Genai SDK rule.** Use `ai.models.generateContent` — never legacy `ai.getGenerativeModel`.
- **Manifest is append-only.** Never summarize or prune historical entries.
- **Guardian rule.** Never allow a Firestore write to bypass an unresolved intercept (isAmbiguous: true).
- **Zod rule.** Delete empty MPU keys dynamically — never pass `null`.
- **Wix stack is a separate deferred project.** Do not touch it.

---

## File Map
