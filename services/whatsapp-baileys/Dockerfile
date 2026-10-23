FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /data/auth && chown -R node:node /app /data
USER node
EXPOSE 8080
CMD ["npm","start"]
