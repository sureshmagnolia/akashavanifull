# Lightweight Alpine Node image with FFmpeg
FROM node:20-alpine

# Install FFmpeg and required audio decoders
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY . .

# Expose HTTP port
EXPOSE 8000

ENV PORT=8000
ENV NODE_ENV=production
ENV BITRATE=96k

CMD ["node", "server.js"]
