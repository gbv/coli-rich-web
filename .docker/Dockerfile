FROM node:20-alpine
WORKDIR /usr/src/app

RUN apk add --no-cache bash

# Copy and install dependencies
COPY package*.json ./
RUN npm ci

# Bundle app source
COPY . .

# Use pm2 to run app
RUN npm i -g pm2

ENV NODE_ENV=production

## Make Docker-related scripts available in root folder
COPY .docker/*.sh .

# Build Vue frontend for default configuration
RUN bash ./build.sh

CMD ["bash", "entrypoint.sh"]
