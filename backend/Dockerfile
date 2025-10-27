FROM node:20-alpine
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
# Use npm install to avoid lockfile mismatch during CI when dependencies change
RUN npm install --omit=dev

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Default command
CMD ["node", "src/index.js"]
