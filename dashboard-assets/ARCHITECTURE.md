# Dashboard Frontend Architecture

This directory keeps the browser console modular without changing the current visual style.

## Style Contract

- `styles/tokens.css`: frozen design tokens from the original dashboard.
- `styles/boot.css`: startup animation styles.
- `styles/dashboard.css`: layout, cards, pages, and component styles.

Rules:

- Keep token values identical unless a deliberate visual redesign is intended.
- Keep existing class names and DOM ids stable to avoid breaking inline page behavior and tests.

## Runtime Modules

- `scripts/core/state.js`: shared client state and runtime handles.
- `scripts/core/router.js`: page switching and page title metadata.
- `scripts/core/sse.js`: SSE connection lifecycle.
- `scripts/core/charts.js`: shared Chart.js initialization and updates.
- `scripts/services/dashboard-api.js`: centralized API client wrappers.
- `scripts/dashboard-app.js`: app composition layer, wiring router/state/API and delegating to page modules.
- `scripts/pages/plugin-center-page.js`: plugin center UI (install, enable/disable, config schema, adapter/bridge oriented actions); routed via `router.js` like other console pages.
- `scripts/pages/config-page.js` and other `scripts/pages/*.js`: feature pages split out from the legacy monolith where refactors have landed.

## Static Serving

- `src/services/dashboard-service.ts` serves `/dashboard-assets/*`.
- `tests/e2e/mock-dashboard-server.cjs` mirrors that behavior for Playwright.

## Refactor status

- Page-specific logic is **partially** moved from `dashboard-app.js` into `scripts/pages/*.js` (e.g. plugin center, config); new work should prefer adding or extending page modules rather than growing the app shell.
- Extract reusable DOM renderers into `scripts/components/*.js` where repetition appears.
- Keep behavior parity first; only then consider a framework migration.
