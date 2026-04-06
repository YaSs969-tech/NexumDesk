# Step 1 (BUILD)
FROM node:18-alpine AS builder

# Install necesary tools (like sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy depend folder
COPY package*.json ./

# Install(include TypeScript)
RUN npm install

# Copy files (src, tsconfig.json, etc.)
COPY . .

# Compilation
RUN npm run build

# Step 2 (PRODUCTION)
FROM node:18-alpine

# Reinstall tools
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Install pach
RUN npm ci --only=production

# Copy folder
COPY --from=builder /app/dist ./dist

# Setting
ENV NODE_ENV=production
EXPOSE 5000

# Run app
CMD ["node", "dist/index.js"]
