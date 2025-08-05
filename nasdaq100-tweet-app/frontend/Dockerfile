# Stage 1: Build the React application
FROM node:18-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . ./

# Build the application
RUN npm run build

# Stage 2: Serve the application from a lightweight server
FROM node:18-alpine

WORKDIR /app

# Copy package.json to install serve
COPY package.json ./
RUN npm install --production

# Copy the build output from the build stage
COPY --from=build /app/build ./build

# The port is exposed via docker-compose, so no need for EXPOSE here.
# The start script in package.json is now "serve -s build"
# The port will be passed by docker-compose, but we can set a default.
CMD ["npm", "start", "--", "-l", "3000"]
