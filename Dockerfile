# Node + Python(yt-dlp) in one image, so Render can run both.
FROM node:20-slim

# yt-dlp needs Python + pip + ffmpeg (ffmpeg is optional but avoids format issues)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip ffmpeg && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
