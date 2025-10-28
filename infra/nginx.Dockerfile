# Multi-stage build to produce a static SPA served by Nginx
FROM node:20-alpine AS build-frontend
WORKDIR /frontend
# Accept Vite build-time variables via build args (no extra .env files)
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
COPY frontend/package*.json ./
# Install with devDependencies to build the app
RUN npm install
COPY frontend .
RUN npm run build

FROM nginx:1.25-alpine
WORKDIR /
COPY infra/nginx.conf /etc/nginx/nginx.conf
COPY --from=build-frontend /frontend/dist /usr/share/nginx/html
