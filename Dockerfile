FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
# npm install, not ci: the lockfile comes from macOS; dev packages are needed for next build
RUN npm install --include=dev --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
