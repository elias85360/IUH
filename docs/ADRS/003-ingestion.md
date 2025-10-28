# ADR 003 – Ingestion Sources

Decision: Support two modes – backend ingestion from Kienlab via nginx proxy (prod) and optional frontend master mode for quick demos.

Context: Need to consume external Kienlab data while retaining a consistent API for the UI.

Implications: Prefer backend mode for dev/prod parity; master mode requires auth to Kienlab and may 401.

