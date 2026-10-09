# Unread Radar AI — local model integration

This patch replaces the keyword-based parser with a language model that performs inference in the browser using WebGPU.

## Apply to the existing repository

From your `unread-radar-ai` project root:

1. Copy `src/App.jsx`, `src/lib/analysisSchema.js`, `src/lib/localAiEngine.js`, and `tests/analysisSchema.test.js` from this patch to the same relative locations in your project.
2. Remove the old keyword parser `src/lib/conversationParser.js` and its old test file `tests/conversationParser.test.js`; they are no longer used by this edition.
3. Install the runtime dependency so `package.json` and `package-lock.json` are updated without replacing your other dependency versions:

   ```powershell
   npm install @mlc-ai/web-llm@0.2.84
   ```

4. Run validation:

   ```powershell
   node --test
   npm run build
   npm run preview
   ```

## Important runtime behavior

- Model: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`.
- The first analysis requires internet access to download model assets. WebLLM caches model data in the browser for later runs when browser storage is retained.
- Chat input is provided to the model engine running in the browser; it is not sent to a hosted chat-completion API.
- WebGPU support and enough available GPU memory are required. The UI blocks analysis when WebGPU is unavailable and shows an error if initialization fails.
- There are no canned conversation templates or keyword lists for task, deadline, or urgency classification. A fixed instruction prompt and JSON schema remain, because the model needs a defined output contract.
- This patch has syntax-transpilation and five schema/merge unit tests passing. A full Vite build and real-model browser run were not verified here because npm dependency installation timed out. Verify both locally before committing or using a scored submission.

## Cross-origin isolation headers

The included Vite and Vercel configurations set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to support browser runtimes that use `SharedArrayBuffer`. Because the app fetches static model assets on first use, verify that the selected model asset host permits CORS access and test the deployed URL in DevTools. Do not assume local development proves production headers are correct.
