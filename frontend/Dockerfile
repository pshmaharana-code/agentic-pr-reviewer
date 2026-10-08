# STAGE 1: Build the React app
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# This compiles your React code into standard static files
RUN npm run build

# STAGE 2: Serve with Nginx
FROM nginx:alpine
# Copy the compiled files from Stage 1 into the Nginx web directory
COPY --from=build /app/dist /usr/share/nginx/html
# Expose port 80 (the default port for web traffic)
EXPOSE 80
# Start the Nginx server
CMD ["nginx", "-g", "daemon off;"]