# Review follow-ups: dnd-theme-revamp

## From impl-review-phase-4 F5 (deferred to the mobile/layout milestone)

- `src/pages/campaigns/[campaignId]/index.astro` (~55-80) and `src/pages/campaigns/[campaignId]/map.astro` (~56): the `<a>` links use `buttonVariants()` but keep the old call-site geometry `px-4 py-2 text-sm rounded-lg inline-block`.
  - `px-4 py-2` repeats what the default size already sets.
  - `inline-block` overrides the primitive's `inline-flex items-center justify-center gap-2`.
  - `Welcome.astro` uses `h-auto px-6 py-3 text-base` instead.
- When geometry is in scope, drop `inline-block` and the duplicate padding, or add a button size variant for these large CTAs.
