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

## UI mock and approval

<!-- Required for every visible UI change. The mock must be approved before
implementation, the approval must cover the implemented version, and the
implementer cannot self-approve. Use "Not a UI change" only when applicable. -->

- Mock:
- Product-owner approval:

## Test evidence

<!-- Required: attach evidence from the final commit, not just planned commands.
For each command/click-through, record pass/fail and the meaningful result or link
the CI run. Attach screenshots/video for user-visible UI changes on each exercised
platform/form factor. If something was not run, explain why and the remaining risk.
Do not include secrets, tokens, production user data, or other personal information.

Which new or updated unit and integration tests cover this change? If either layer
does not apply, say why. If a user-visible behavior changed with no e2e, say why
(see CONTRIBUTING.md — e2e at the outermost surface is the default). -->

## Checklist

- [ ] CI green (rerun once on the known `Failed to fetch` flake before debugging — see CONTRIBUTING.md)
- [ ] Every UI change links its pre-implementation mock and explicit product-owner approval above
- [ ] Test evidence above matches the final commit; untested scope and remaining risk are explicit
- [ ] New or changed behavior has unit and integration coverage, or the evidence explains why a layer does not apply
- [ ] Architecture inventory refreshed with `npm run docs:update` (`npm run docs:check` passes)
- [ ] New dynamic routes have a `public/serve.json` rewrite
- [ ] Types in `types/index.ts`, tokens from `theme.*`, shared styles in `constants/styles.ts` (per CLAUDE.md)
