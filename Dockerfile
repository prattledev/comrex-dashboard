FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

ARG PORT=3000
EXPOSE ${PORT}

CMD ["node", "server.js"]
