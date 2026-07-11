## What changed

<!-- Short summary of the change and the issue it addresses (e.g. "Closes #8"). -->

## How to verify / reproduce

<!-- Concrete, runnable steps — commands and/or a click-through. Required.
Be honest about scope: what did you actually exercise vs. assume? -->

```
npm run typecheck
npm test
npm run build:web && npx serve dist -p 8081 &
npx playwright test
```

## Design decisions

<!-- Numbered list of non-obvious calls and why. "None" is acceptable for trivial diffs. -->

1.

## Tests

<!-- Which e2e/unit tests cover this change? If a user-visible behavior changed
with no e2e, say why (see CONTRIBUTING.md — e2e at the outermost surface is the default). -->

## Checklist

- [ ] CI green (rerun once on the known `Failed to fetch` flake before debugging — see CONTRIBUTING.md)
- [ ] New dynamic routes have a `public/serve.json` rewrite
- [ ] Types in `types/index.ts`, tokens from `theme.*`, shared styles in `constants/styles.ts` (per CLAUDE.md)
