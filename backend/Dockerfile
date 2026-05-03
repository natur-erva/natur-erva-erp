FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3060

CMD ["node", "server.js"]
