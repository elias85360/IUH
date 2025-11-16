# Multi-stage build pour produire une SPA statique servie par Nginx

# === Stage 1 : build frontend Vite ===
FROM node:20-alpine AS build-frontend

WORKDIR /frontend

# Variables de build pour Vite (injectées via docker-compose.yml)
ARG VITE_OIDC_ISSUER_URL
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ARG VITE_REQUIRE_AUTH
ARG VITE_API_BASE
ARG VITE_DATA_SOURCE

ENV VITE_OIDC_ISSUER_URL=${VITE_OIDC_ISSUER_URL} \
    VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID} \
    VITE_OIDC_REDIRECT_URI=${VITE_OIDC_REDIRECT_URI} \
    VITE_REQUIRE_AUTH=${VITE_REQUIRE_AUTH} \
    VITE_API_BASE=${VITE_API_BASE} \
    VITE_DATA_SOURCE=${VITE_DATA_SOURCE}

# Installation des dépendances (avec devDependencies pour le build)
COPY frontend/package*.json ./
RUN npm install

# Copie du code frontend et build Vite
COPY frontend ./
RUN npm run build

# === Stage 2 : runtime Nginx ===
FROM nginx:1.25-alpine

# Configuration Nginx (reverse proxy + SPA)
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf

# Assets statiques générés par Vite
COPY --from=build-frontend /frontend/dist /usr/share/nginx/html
