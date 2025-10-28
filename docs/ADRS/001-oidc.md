# ADR 001 – OIDC with Keycloak

Decision: Use Keycloak for OIDC and RBAC; backend validates JWTs, frontend uses PKCE authorization code flow.

Context: Need multi‑role access (viewer/analyst/admin) and standard auth.

Implications: Configure realm import, redirect URIs for dev and prod, enforce audience/issuer in prod.

