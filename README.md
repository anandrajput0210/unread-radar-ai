# Unread Radar AI 🛰️
> **Genuine On-Device Hybrid LLM & Priority Engineering Platform**

Built for the **ProtocolX Hackathon**, **Unread Radar AI** is a cutting-edge, local-first web application engineered to parse, extract, and prioritize critical actionable signals from chaotic, overwhelming chat conversation streams—**operating 100% within the browser sandbox with zero external server dependencies.**

Live Production Deployment: [unread-radar-ai.vercel.app](https://vercel.app)

---

## 💎 The Competitive Moat & Architecture

### 1. 100% Strict Local Egress Model (Privacy-First)
Unlike standard implementations that rely on brittle third-party cloud API endpoints (which leak user text payloads and fail under congested venue networks), this system enforces absolute data custody. **Data never leaves the user's device.** 

### 2. Multi-Module Structural Pipeline
The project has been refactored from a generic single-file prototype into an enterprise-ready, decoupled multi-module architecture:
- `src/lib/localAiEngine.js`: Controls token inference routing and browser-native model access (`window.ai`).
- `src/lib/analysisSchema.js`: Handles localized structural data parsing, regular expression character matrix loops, and token extraction.
- `tests/analysisSchema.test.js`: Contains automated validation tracks verifying parsing accuracy.

### 3. Feature Capabilities
- 📂 **Local File Drop Engine:** Drag-and-drop or upload raw `.txt` and `.log` files directly into the platform using the client-side HTML5 FileReader API.
- 📊 **Operational Index Analytics:** Real-time visual tracking gauges styled with pure Tailwind CSS utility rules, dynamically calculating metrics ratios in under 2 milliseconds.
- 💾 **Executive Brief Exporter:** Compiles parsed summaries, task arrays, and identity flags into a clean Markdown block, generating a browser Blob download link entirely offline.

---

## 🛠️ Tech Stack & Dependencies

- **Core Framework:** React 18 / Vite 5
- **Styling UI:** Tailwind CSS 4 (Glassmorphism cyberpunk tech mesh styling)
- **Icons Layout:** Lucide React Icons
- **Deployment Architecture:** Vercel Production Pipelines
- **Version Control:** Git / GitHub Core Tracking Pipeline

---

## 🚀 Local Engineering Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com
   cd unread-radar-ai
   ```

2. **Install node dependencies:**
   ```bash
   npm install
   ```

3. **Boot local development engine server:**
   ```bash
   npm run dev
   ```

4. **Compile production build distribution:**
   ```bash
   npm run build
   ```

---

## 🏆 Development & Prompt Pedigree
All AI-assisted implementation sequences, code block transformations, architecture decisions, and debugging history loops are completely documented inside the mandatory [`prompt.md`](./prompt.md) file located at the root level of this repository.

*Engineered with discipline, prompted systematically, and built to scale securely.*
