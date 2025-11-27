# Frontend (React / Vite)

## Vue d'ensemble
- SPA React 18 + Vite. Routage react-router-dom v6. Styles dans src/styles.css avec data-theme.
- Auth : services/oidc.js implemente OIDC code+PKCE (sessionStorage), refresh auto, extraction roles; components/AuthProvider.jsx expose useAuth, AuthCallbackView, RequireRole (viewer/analyst/admin).
- Entrypoint : src/main.jsx monte <App/>. App.jsx charge devices/metrics via api service, gere filtres, theme, live socket, share link et scenes.

## Pages (src/pages)
- HomePage.jsx : tableau de bord (StatCards, graphes energie, matrices, alertes en direct).
- DevicesPage.jsx : liste devices + filtres avances.
- DeviceDetail.jsx : detail device (timeseries live, KPIs, export CSV/PDF, annotations, graphes Recharts/Chart.js).
- AlertsPage.jsx : vue alertes (role analyst).
- AssetsPage.jsx : meta devices (tags, rooms, groups) via /api/assets/meta.
- SettingsPage.jsx : seuils, routing alertes (Slack/Webhook), status admin/hmac test/ping.
- DataHealth.jsx : qualite donnees via /api/quality.
- Route /auth/callback gere le retour OIDC.

## Services et libs
- services/api.js : wrapper fetch (timeout VITE_API_TIMEOUT_MS, concurrency 8) avec base auto (scan localhost:4000+ si VITE_API_BASE non defini). Support API key, JWT, HMAC (VITE_API_HMAC_KEY_ID/SECRET). Mode master via lib/masterClient si VITE_DATA_SOURCE=master.
- services/oidc.js : login/logout/refresh, roles, startAutoRefresh. Env: VITE_OIDC_ISSUER_URL, VITE_OIDC_CLIENT_ID, VITE_OIDC_REDIRECT_URI, VITE_REQUIRE_AUTH.
- services/socket.js : socket.io-client (getSocket, subscribeSeries) vers /socket.io; pousse points/alertes dans state/dataCache.
- lib/format.js, chartjs-setup.js, energy.js, exportPng.js, prefetch.js, analysisUtils.js : helpers de formatage, charts, export.
- masterClient.js : client API direct utilise aussi par tests; apiRaw recupere series pour calcul qualite.

## Etat (zustand, src/state)
- filters.js (+ filters.test.js) : periode, room/group, selectedMetrics, anchorNow, persistence.
- dataCache.js : cache timeseries et kpis; alimente les pages et le live.
- alerts.js : pile d'alertes live; alertRules.js regles.
- settings.js : theme/lang/options; assets.js pour meta devices; annotations.js; scenes.js pour layouts sauvegardes.
- assets.test.js, filters.test.js, pages tests couvrent la logique.

## Components (src/components)
- Navigation/UI : SideNav, Breadcrumbs, ShareLink, TopProgress, AuthProvider/RequireRole.
- Visualisation : StatCards, UsageEstimateArea, EnergyMixDonut, ChangeUsageBars, HeatmapMatrix, HistogramBox, CorrelationMatrix, ActiveDevicesBars, EnergyIntensityGauge, RoomContribution, HomeHealthAlerts, DeviceSummaryCard, FloorPlanEditor, AdvancedFilters, AnomaliesList, SkeletonBox.
- Charts reposent sur Chart.js (react-chartjs-2) et Recharts, layout via react-grid-layout.

## Tests et scripts
- Vitest config (vitest.config.js, vitest.setup.js). Tests dans src/services/*.test.js, src/lib/*.test.js, src/state/*.test.js, src/pages/*.test.jsx.
- npm scripts : dev, build, preview, test (vitest run).

## Variables env frontend
- API : VITE_API_BASE (optionnel), VITE_API_KEY, VITE_API_HMAC_KEY_ID, VITE_API_HMAC_SECRET, VITE_API_TIMEOUT_MS.
- Auth : VITE_REQUIRE_AUTH (1 force login), VITE_OIDC_ISSUER_URL, VITE_OIDC_CLIENT_ID, VITE_OIDC_REDIRECT_URI.
- Mode data : VITE_DATA_SOURCE=master pour utiliser masterClient.
