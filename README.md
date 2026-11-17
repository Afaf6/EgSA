# EGSE Mission Operations Center — Frontend

A React interface for an EGSE (Electrical Ground Support Equipment) and
satellite Mission Operations Center, built with **React + Vite + React
Router + Bootstrap 5 + Chart.js**, following the "Mission Control" dark/light
design system. Fully in English, with a persistent light/dark theme toggle.

See `GAP_ANALYSIS.md` for how every item on the "TLM Software - Engineer 2"
checklist maps to a screen in this app.

## Running locally

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. Log in with any email/password (the login
screen is a demo stand-in) and pick **Admin** or **Normal** to try the two
permission levels.

For a production build:

```bash
npm run build    # output in dist/
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  styles/theme.css          All design tokens — dark AND light theme variables
  context/
    AppContext.jsx           Auth, role (Admin/Normal), project list, selected project
    ThemeContext.jsx          Light/dark mode, persisted to localStorage
  layouts/                   Sidebar + Topbar (incl. theme toggle) + MainLayout
  components/common/         StatusChip, ThemeToggle, RequireAdmin (route guard)
  mock/                      Mock data + simulated Socket.io telemetry + folder watcher
  utils/
    formatters.js             nan / 327.67 / hex / enum formatting
    csvExport.js               Client-side CSV generation + download
    configValidation.js        Parameter-schema validation rules
  pages/
    Auth/                     Login screen
    Dashboard/                Project list, KPIs, "New Project" creation
    LiveTelemetry/            Live monitoring: subsystem + frame selection, parameter grid, alerts
    HistoricalExplorer/       Multi-graph analysis: parameter picker, zoom/pan, stats, CSV export
    FrameInspector/           Raw Protocol-F hex frame breakdown
    DataIngestion/            Shared-folder connection, start/stop monitoring, processing feed
    ConfigStudio/             Hierarchy (subsystems/frames), parameter schema, protocol & frame-header config
    ExportCenter/             General CSV export wizard (by source file / frame)
    TesterManagement/         User management — roles, authorities, project assignment
```

Every screen lives in its own folder, and every non-trivial piece within a
screen (a filter bar, a table, a modal…) is its own component under that
screen's `components/` folder — so any part of the checklist below maps
directly to one file.

## Roles & terminology

- **Admin** — full access: Config Studio, Data Ingestion controls, User
  Management, plus everything a Normal user can do.
- **Normal** — Live Telemetry, Historical Explorer, Frame Inspector, Export
  Center, Shared Folder (view/monitor); Config Studio and User Management are
  hidden and route-guarded (`RequireAdmin`).
- Per-user **authorities** (checkboxes in *Add User*) mirror this at a finer
  grain: `live_monitoring`, `historical`, `export`, `config`,
  `user_management`. Wire these into your real auth/JWT claims when the
  backend is connected — right now they're illustrative only.

## Light / dark mode

Toggle button lives in the top bar (and on the login screen). The choice is
saved to `localStorage` under `egse-theme` and applied before React mounts
(see the inline script in `index.html`) to avoid a flash of the wrong theme.
All colors are CSS variables in `src/styles/theme.css` — the semantic
telemetry palette (nominal/warning/alarm/raw) stays the same in both themes;
only backgrounds, borders and text colors change.

## Connecting the real backend

Every screen is fully usable today on mock data (`src/mock/`). Each page/
component has a `// Backend to wire up:` comment naming the endpoint it
expects. Summary:

| Area | Endpoint / Channel |
|---|---|
| Login | `POST /api/auth/login` |
| Projects | `GET /api/projects`, `POST /api/projects` |
| KPI summary | `GET /api/telemetry/kpi-summary?project=<id>` |
| Live telemetry | Socket.io channel `telemetry:packet` |
| Historical data | `GET /api/telemetry/history?subsystem=&paramId=&from=&to=&status=` |
| Frame search | `POST /api/telemetry/search-frame` |
| Shared folder | `POST /api/ingestion/connect`, `/start`, `/stop`; Socket.io `ingestion:file` / `ingestion:frame` / `ingestion:error` |
| Config — subsystems/frames | `POST /api/config/subsystems`, `POST /api/config/frames`, `DELETE /api/config/nodes/:id` |
| Config — parameters | `POST/PUT/DELETE /api/config/parameters` |
| Config — protocol/header | `PUT /api/config/protocol`, `PUT /api/config/frame-header` |
| Config — import/export | `POST /api/config/upload` (import is already parsed client-side for JSON files) |
| Export | `GET /api/telemetry/export?sourceFile=<file>&...options` |
| Users | `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/import` |

### Steps to wire up Live Telemetry specifically

Replace `subscribeMockTelemetry(...)` in
`src/pages/LiveTelemetry/LiveTelemetryPage.jsx` with a real
`socket.io-client` connection — the exact shape it should emit is documented
at the top of `src/mock/mockSocket.js`. Same pattern applies to
`src/mock/mockFolderWatcher.js` for the Shared Folder screen.

## Manual test plan (from the checklist's "Testing" section)

These are QA steps, not UI features, so they're listed here rather than
built as screens:

1. **Full configuration workflow** — create a project → add a subsystem → add
   a frame → add parameters with limits → Validate → Export config JSON →
   re-import it → confirm the tables match.
2. **Live TLM display** — start Live Telemetry, confirm values update,
   confirm warning/alarm coloring triggers when a value crosses its limit,
   confirm CRC failure surfaces an alert.
3. **Historical data** — add a graph, change the time range, verify zoom/pan,
   verify Min/Max/Average/Count match the plotted series, export CSV and
   check the numbers match.
4. **Multiple graphs** — add 2–3 graphs for different parameters, confirm
   each can be removed independently without affecting the others.
5. **User permissions** — log in as Normal, confirm Config Studio and User
   Management are unreachable (redirect to Dashboard) even via direct URL.
6. **Two different project configurations** — repeat steps 1–3 for a second
   project and confirm no state leaks between projects (switch via the
   top-bar project selector).

## Notes

- Fonts: `Outfit`/`Inter` for UI text, `JetBrains Mono` for hex/numeric
  values — loaded from Google Fonts in `index.html`.
- Value formatting (`nan`, `327.67 → "-"`, enum labels, `0xXXXXXXXX` hex) is
  centralized in `src/utils/formatters.js` — reuse it instead of duplicating
  formatting logic in a new component.
- Zoom/pan on graphs uses `chartjs-plugin-zoom` (mouse wheel to zoom, drag to
  pan, "Reset Zoom" button per graph).

## Demo mode (no backend)

The client ships with a mock backend in `src/mock/` and a fake socket in
`src/services/socketService.mock.js`. It is **on by default**: log in with any
email/password and every page (dashboard, live telemetry, history, decoded data,
config studio, uploads, shared folder, users, audit logs) works with generated data.

- Data lives in memory: changes work during the session and reset on reload.
- Back to the real API: set `VITE_USE_MOCK=false` (in `.env`, `.env.production`, ...).
- Edit the demo data in `src/mock/data.js` (projects, subsystems, frames, parameters, users).
