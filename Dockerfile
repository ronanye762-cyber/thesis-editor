FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends texlive-xetex texlive-lang-chinese texlive-latex-extra texlive-fonts-recommended ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app/data
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "src/server.js"]
