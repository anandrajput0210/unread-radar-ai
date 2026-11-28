# Deployment and release checks

## Application shape

Unread Radar AI is currently a static React/Vite application. Its local inference path runs in the user's browser through `@mlc-ai/web-llm` and `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`.

- Project root: repository root
- Install: `npm ci`
- Build: `npm run build`
- Static output: `dist/`
- Runtime backend: none required by the current application
- Hosted AI endpoint or API key: none required

Do not add a dummy backend, environment secrets, a hosted chat-completion provider, or a second inference path just to satisfy a generic full-stack project layout. If a hosting workflow refuses to deploy a Vite static frontend without those changes, stop and inspect the platform requirement before modifying the architecture.

## Lazy model bundle

The roughly 6 MB WebLLM runtime bundle is lazy-loaded by `loadLocalModel()` through `import("@mlc-ai/web-llm")`. It is not part of the initial page request and is fetched only after the user opts in and starts an on-device model analysis. Rules-only analysis does not request that bundle. The Vite build warning limit is set above this optional chunk's current size; this does not change how or when it loads.

## Browser requirements

The default rules-only path requires neither WebGPU nor a model download. The optional Qwen model download requires network access only after the user explicitly enables on-device AI and starts an analysis. Actual inference requires a compatible browser and working WebGPU support; performance and available GPU memory vary by device. The model may be cached by the browser after first use. If the user opts in but adapter/device initialization is unavailable, the app uses its clearly labelled rules-only fallback, which is not equivalent to Qwen inference.

The Vite development and preview servers and `vercel.json` currently configure these response headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

Preserve them on hosting where supported. Do not assume that the platform applies them automatically. Also do not treat the headers alone as proof of compatibility: the final hosted test below is decisive.

## Import into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Under **Import Git Repository**, connect GitHub if prompted and select `anandrajput0210/unread-radar-ai`.
3. Set **Framework Preset** to **Vite** and **Root Directory** to `./`.
4. Confirm **Install Command** is `npm ci`, **Build Command** is `npm run build`, and **Output Directory** is `dist`.
5. Leave environment variables empty; this static app has no required environment variables.
6. Choose **Deploy**. The repository's `vercel.json` supplies the COOP and COEP response headers.

On a standard static host that does not read `vercel.json`, that file is inert configuration; serving the contents of `dist/` does not apply or depend on those headers. The development and preview servers add their own configured headers, so test the host's actual response separately.

## Required hosted smoke test

Run this on the actual HTTPS deployment in a fresh current Chrome or Edge browser with WebGPU available:

1. Open the deployed application and confirm that the app shell and favicon load without missing-asset errors.
2. Check the browser console for failed model downloads, cross-origin isolation errors, WebGPU/device errors, and uncaught exceptions.
3. Submit a small conversation that produces a known task, owner, and deadline.
4. Wait for the first model initialization/download to finish. Confirm the UI reports **Qwen inference completed**, not merely that the model runtime loaded.
5. Confirm the task is grounded in the supplied conversation and inspect its source quotation.
6. Reload and run the same input once more to verify the hosted app remains usable.

If the hosted app falls back to **Rules-only**, or Qwen inference cannot complete, do not describe the hosted version as having working local AI and do not publish it as the final release until the hosting/runtime issue is resolved. A local build passing is necessary but not sufficient.

## Reproducible local release check

```bash
npm ci
npm test
npm run build
npm run preview
```

Open the preview URL in a WebGPU-compatible browser and run the same inference smoke test before pushing. Do not commit `node_modules/`, `dist/`, `.env` files, or model weights.
