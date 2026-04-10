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
- `scripts/dashboard-app.js`: app composition layer plus page-specific logic kept from the original console.

## Static Serving

- `src/services/dashboard-service.ts` serves `/dashboard-assets/*`.
- `tests/e2e/mock-dashboard-server.cjs` mirrors that behavior for Playwright.

## Follow-up Refactor Path

- Move page-specific logic from `dashboard-app.js` into `scripts/pages/*.js`.
- Extract reusable DOM renderers into `scripts/components/*.js`.
- Keep behavior parity first; only then consider a framework migration.
