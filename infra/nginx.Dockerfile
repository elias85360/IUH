# Multi-stage build to produce a static SPA served by Nginx
FROM node:20-alpine AS build-frontend
WORKDIR /frontend
COPY frontend/package*.json ./
# Install with devDependencies to build the app
RUN npm ci
COPY frontend .
RUN npm run build

FROM nginx:1.25-alpine
WORKDIR /
COPY infra/nginx.conf /etc/nginx/nginx.conf
COPY --from=build-frontend /frontend/dist /usr/share/nginx/html
