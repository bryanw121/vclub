# PR #52 implementation evidence

These screenshots exercise the approved decimal-price design against the built
web app with synthetic Playwright fixtures. In both views, the controlled price
input retains `5.50` exactly.

- [Desktop web — 1440 × 1000](desktop-web.png)
- [Mobile web — 390 × 844](mobile-web.png)

Captured from commit `e0533ab` with:

```bash
E2E_BASE_URL=http://localhost:56352 \
  npx playwright test e2e/.tmp-price-evidence.spec.ts --project=chromium
```

Result: 4 passed (authentication setup, restored-session check, desktop web,
and mobile web). The temporary capture spec was removed after the screenshots
were produced; the durable regression is in `e2e/events.spec.ts`.
