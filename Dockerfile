FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY PVPServices ./PVPServices

ENV NODE_ENV=production
CMD ["node", "PVPServices/pvpServer/pvpServer.js"]
