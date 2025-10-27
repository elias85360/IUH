# Reprise du projet IoT Dashboard

Ce document résume l’état du projet, les emplacements de code, et la TODO priorisée.

## État Fonctionnel
- Source Kienlab front‑only (cache mémo + sessionStorage)
- Préchargement Home/Devices
- Fallback énergie (P→kWh)
- Pages Home/Devices/Device Detail avec analytics (heatmap, histogram, anomalies, baseline)
- Scènes & partage URL

## Fichiers clés
- energy/prefetch/masterClient/stats/… dans `frontend/src/lib`
- Home grid dans `frontend/src/components/HomeGridLayout.jsx`
- Détail device dans `frontend/src/pages/DeviceDetail.jsx`

## Suivi
- Voir `docs/UPGRADE_PLAN.md`
