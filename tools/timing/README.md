# Timing harness (dev only, no extraction changes)

Files: `inputs.js` (synthetic 3-message and 50-message chats), `rulesOnly.mjs` (Node), `timing.html` + `browserTiming.js` (browser).

## Rules-only (any machine)
`node tools/timing/rulesOnly.mjs`

## Rules plus on-device Qwen (needs a WebGPU browser)
1. `npm run dev`, open `http://localhost:5173/tools/timing/timing.html` in Chrome or Edge, in a fresh profile or private window with no other heavy tabs.
2. **Cold run:** click "Clear model cache", reload, click "Run timing". Expect a large download. Copy the JSON.
3. **Warm run:** reload the page (same profile), click "Run timing" again. The JSON should say weights cached. Copy it.
4. Repeat the pair on a second machine if you have one.

Reported separately: dynamic import, engine init, first inference (includes shader warm-up), later inferences, per input size. The page is not part of the production build and imports the real analysis path unchanged.
Do not compare with the earlier 17.3 s figure unless the input size and cold/warm state match.
