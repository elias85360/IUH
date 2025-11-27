# Documentation modules

Ce dossier regroupe la doc finale du projet IoT Dashboard.

- ARCHITECTURE.md : vue d'ensemble et flux (API, Socket.IO, ingestion, infra).
- BACKEND.md : modules Node.js (securite, DataStore, ingestion, cache, alerting, metrics).
- FRONTEND.md : modules React/Vite (pages, etat, services API/OIDC, temps reel).
- API.md : reference des endpoints /api et exigences d'acces.
- INFRA.md : briques docker-compose (nginx, api, keycloak, redis, db, prometheus, grafana) et variables cle.

Principes clefs : auth OIDC + RBAC (viewer/analyst/admin) avec API key/HMAC pour les integrations, ingestion flexible (mock/http/ws/mqtt/kienlab), stockage memoire + options Timescale/Redis, metrics Prometheus et dashboards Grafana.
