# Continuous Integration

This project ships with a sample GitHub Actions workflow to run basic checks on every commit and pull request.  The goal is to catch build errors early and to ensure that the frontend and backend continue to install and build correctly as the code evolves.

## Workflow overview

The workflow defined in `.github/workflows/ci.yml` performs the following steps:

1. **Checkout sources** – pulls down the repository at the current commit.
2. **Set up Node.js** – configures the Node runtime (version 20) and enables dependency caching to speed up subsequent runs.
3. **Install and build the frontend** – runs `npm ci` in `dashboard/frontend` to install dependencies exactly as locked in `package‑lock.json`, then runs `npm run build:prod` to ensure the production build of the React app succeeds.  This step also validates that environment variables are correctly configured for the production build (e.g., OIDC, master data source, etc.).
4. **Install backend dependencies** – runs `npm ci` in `dashboard/backend`.  Because there are currently no automated tests or linting scripts defined for the backend, this step only verifies that the package can be installed without errors.
5. **Placeholder for tests** – emits a notice reminding contributors to add unit tests, API tests, and linting rules.  Future improvements can extend this step to run `vitest`, `playwright`, or other test suites as they become available.

## Running locally

To reproduce the CI steps locally, run the following commands from the root of the project:

```sh
# Install and build the frontend
cd dashboard/frontend
npm ci
npm run build:prod

# Install backend dependencies
cd ../backend
npm ci
