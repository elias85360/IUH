FROM node:20-alpine

WORKDIR /app

# Installation des dépendances (prod uniquement)
COPY package*.json ./
RUN npm install --omit=dev

# Copie du code backend
COPY . .

ENV NODE_ENV=production

# Port interne écouté par l'API (exposé en 4001:4000 via docker-compose)
EXPOSE 4000

# Commande par défaut
CMD ["node", "src/index.js"]
