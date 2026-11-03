# Final browser validation

This project includes two cross-speaker condition-resolution tests in `final-browser-tests/` (also retained under `tests/fixtures/condition-state/`).

Run them one at a time in the browser, using **Run fresh analysis (skip cache)**. See `final-browser-tests/README.md` for expected results.

## Local checks

From the folder containing `package.json`:

```powershell
npm ci
npm test
npm run build
npm run dev
```

The dependency-free automated test suite was run against this package: **95 passed, 0 failed**.

The production build was not verified in the packaging environment because installing dependencies timed out and Vite was not available there. Run `npm run build` locally before publishing.
