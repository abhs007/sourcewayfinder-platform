# Source-independent test tools; the candidate and reviewed runner are read-only mounts.
FROM node:26.13.1-bookworm-slim@sha256:8261241c4197285eaeca819863dab5042cd1f9147b000670f4e773f4d5fe7768
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
 && node node_modules/playwright/cli.js install --with-deps chromium \
 && chmod -R a+rX /opt/playwright /runner \
 && mkdir -p /results /packet \
 && chown node:node /results
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
CMD ["node", "--version"]
