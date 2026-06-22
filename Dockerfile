# Stage 1: build the React client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: run the Fastify server, serving the built client
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/server.js ./
COPY --from=client-build /app/client/dist ./public

EXPOSE 3000
CMD ["node", "server.js"]
