FROM kaifanla-tooling:current AS build
USER root
RUN rm -rf /app/apps/server/src /app/apps/server/public /app/apps/server/prisma /app/apps/server/.next /app/apps/server/dist-cli /app/packages/contracts/src
COPY packages/contracts /app/packages/contracts
COPY apps/server /app/apps/server
RUN mkdir -p /app/apps/server/public && pnpm --filter @ordering/server build
FROM kaifanla-server:current AS runtime
USER root
RUN rm -rf /app
WORKDIR /app
COPY --from=build --chown=10001:10001 /app/apps/server/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/apps/server/.next/static ./apps/server/.next/static
COPY --from=build --chown=10001:10001 /app/apps/server/public ./apps/server/public
COPY --from=build --chown=10001:10001 /app/apps/server/dist-cli ./apps/server/dist-cli
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/apps/server/node_modules ./apps/server/node_modules
USER 10001:10001
CMD ["node", "apps/server/server.js"]