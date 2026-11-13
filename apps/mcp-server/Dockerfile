FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/mcp-server/package*.json ./apps/mcp-server/

RUN npm ci

COPY apps/mcp-server ./apps/mcp-server

WORKDIR /app/apps/mcp-server
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV MCP_TRANSPORT=sse
ENV MCP_PORT=3001

COPY package*.json ./
COPY apps/mcp-server/package*.json ./apps/mcp-server/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/mcp-server/dist ./apps/mcp-server/dist

WORKDIR /app/apps/mcp-server

EXPOSE 3001

CMD ["node", "dist/index.js"]
