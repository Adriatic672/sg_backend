FROM node:18
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

CMD ["node", "--max-old-space-size=384", "dist/app.js"]