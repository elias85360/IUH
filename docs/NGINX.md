# Nginx

Dockerfile: `infra/nginx.Dockerfile`

- Build stage compiles the frontend using Vite
- Runtime stage copies `dist` to `/usr/share/nginx/html`
- `infra/nginx.conf` sets security headers and reverse proxies

Proxies:

- `/api` and `/metrics` → `api:4000`
- `/socket.io/` → `api:4000` (Upgrade/Connection headers)
- `/kienlab/` → `http://eprophet.kienlab.com` (adjust if needed)

Note:

- The compose file sets `KIENLAB_PROXY_TARGET`, but the current `nginx.conf` hardcodes the target. Switch to a templated conf if you need to change it per environment.

