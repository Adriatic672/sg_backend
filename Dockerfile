FROM node:18
# Create app directory
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /usr/src/app
# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .
CMD ["node", "--max-old-space-size=4096", "node_modules/.bin/ts-node", "src/app.ts"]