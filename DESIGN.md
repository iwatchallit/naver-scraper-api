---
version: 2
name: "WatScraper Naver Engine & Audit Console"
description: "High-precision dark-mode control deck and REST API documentation system for Naver SmartStore scraping."
colors:
  surface-obsidian: "#090d16"
  surface-panel: "#111827"
  surface-raised: "#1f2937"
  surface-hint: "#374151"
  surface-soft: "#4b5563"
  foreground-bright: "#f9fafb"
  foreground-muted: "#9ca3af"
  border-subtle: "rgba(255, 255, 255, 0.1)"
  emerald-mint: "#10b981"
  electric-cyan: "#06b6d4"
  indigo-action: "#6366f1"
  amber-warning: "#f59e0b"
  rose-danger: "#ef4444"
typography:
  display-family: "Outfit, Inter, system-ui, sans-serif"
  body-family: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  mono-family: "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', Consolas, monospace"
  body-size: "15px"
  body-line-height: "22px"
  label-size: "13px"
  label-line-height: "18px"
  display-max: "3.5rem"
rounded:
  radius-sm: "6px"
  radius-md: "10px"
  radius-lg: "16px"
  radius-xl: "24px"
spacing:
  spacing-2: "4px"
  spacing-4: "8px"
  spacing-6: "12px"
  spacing-8: "16px"
  spacing-10: "24px"
  spacing-12: "32px"
components:
  shell:
    backgroundColor: "{colors.surface-obsidian}"
    textColor: "{colors.foreground-bright}"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.foreground-bright}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.radius-xl}"
  drawer:
    backgroundColor: "{colors.surface-panel}"
    borderColor: "{colors.border-subtle}"
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.75)"
  card:
    backgroundColor: "{colors.surface-raised}"
    borderColor: "{colors.border-subtle}"
    rounded: "{rounded.radius-md}"
---

# WatScraper Naver Engine — Design System & Architecture

## Creative North Star

**The Cybernetic Scraper Control Deck.**

The interface feels like a high-precision, real-time command console for web automation engineers. The aesthetic combines a deep obsidian background with vibrant emerald mint accents (`#10b981`) for passing scrapes, electric cyan (`#06b6d4`) for CDP network telemetry, and rose red (`#ef4444`) for anti-bot challenges and regional blocks. The overall mood is high-trust, forensic, fast, and modern.

---

## Core Product Capabilities

1. **REST API & Swagger UI (`/docs`)**: Standalone, interactive OpenAPI documentation for zero-friction integration testing by external reviewers.
2. **Interactive Web Console (`/`)**: Real-time URL scraper launcher with live JSON viewer, latency badges, and session status indicators.
3. **Sliding Log Drawer & Lightbox**: Slide-over execution history tracking every scrape attempt, latency, status code, and base64 screenshot preview with full-screen zoom capability.
4. **Persistent Session Management**: Native support for Google OAuth session state injection (`storage-state.json`) to bypass login walls securely.
5. **Dockerized CDP Sidecar**: Production-ready deployment architecture running headless Chromium alongside Fastify in Docker Compose.

---

## Color Strategy

A sleek, modern dark theme built for long review sessions and clear status contrast:

- **Obsidian (`#090d16`)**: Deep background base, giving the application a premium cybernetic feel.
- **Panel Surface (`#111827`)**: Container cards, main form panels, and slide-over drawer backgrounds.
- **Raised Block (`#1f2937`)**: Interactive inputs, code blocks, and log entry cards.
- **Emerald Mint (`#10b981`)**: Primary brand color. Highlights successful scrapes, online sidecar health, and primary action buttons.
- **Electric Cyan (`#06b6d4`)**: CDP network activity, WebSocket telemetry, and strategy badges.
- **Indigo Accent (`#6366f1`)**: Swagger UI headers, secondary triggers, and focus rings.
- **Amber Warning (`#f59e0b`)**: Retries, queue timeouts, and proxy fallback notices.
- **Rose Danger (`#ef4444`)**: Regional blocks (`TARGET_UNAVAILABLE`), captcha challenges, and invalid URLs.

---

## Typography & Contrast

- **Headings**: `Outfit` / `Inter` (bold, clean, modern UI voice).
- **Body Text**: `Inter` for optimal legibility at 15px with high contrast against obsidian backgrounds.
- **Code & Logs**: `JetBrains Mono` / `Fira Code` for JSON responses, latency metrics, and API payloads.

---

## Key Interface Components

### 1. Main Scraper Dashboard (`GET /`)
- Hero section with live URL input field and one-click **"Scrape Product"** button.
- Floating **"View Logs"** button with dynamic badge counter.
- Formatted JSON response viewer with copy-to-clipboard functionality.

### 2. Sliding Drawer UI (`GET /logs`)
- Smooth 300ms slide-in animation from the right screen edge.
- Chronological list of the last 500 scrape attempts stored in the local JSON data engine (`.scratch/logs.json`).
- Thumbnail previews of captured page screenshots with instant click-to-lightbox expansion.

### 3. Screenshot Lightbox
- High-resolution modal overlay for inspecting captured page states (logged-in session verification, price details, benefits).

### 4. Swagger UI (`GET /docs`)
- Full OpenAPI 3.0 documentation powered by `@fastify/swagger` and `@fastify/swagger-ui`.
- Clean route categorization exposing `/naver` and hiding internal administrative endpoints.

---

## Infrastructure & Deployment Architecture

```
[ Client / Browser ] ─── (HTTP Port 3000) ───► [ Fastify API Container ]
                                                        │
                                                 (WebSocket CDP)
                                                        ▼
                                            [ Chromium Sidecar (Port 3001) ]
```

- **CI/CD Pipeline**: GitHub Actions (`.github/workflows/deploy.yml`) automatically builds and deploys changes on `git push` to Tencent Cloud VPS.
- **Container Isolation**: Docker Compose orchestrates `watscraper-api` and `watscraper-chromium` with strict volume mounts for persistent logging (`.scratch`) and session cookies (`artifacts`).
