# The API only. The front end is a static bundle and is hosted separately.
#
# A Dockerfile rather than a buildpack because a buildpack would also run the
# front-end build on the API host: `npm run build` here would compile Vite output
# nothing serves.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# The server reads the user directory from the app's source tree, so that one file
# ships with it. Nothing else from src/ is needed.
COPY server ./server
COPY src/data/directory.json ./src/data/directory.json

# Koyeb injects PORT and health-checks it; this is only the local fallback.
EXPOSE 8000
CMD ["node", "server/index.mjs"]
