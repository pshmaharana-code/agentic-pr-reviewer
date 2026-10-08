# 1. Start with a lightweight Linux environment that has Node.js pre-installed
FROM node:20-alpine

# 2. Set the directory inside the container where our app will live
WORKDIR /app

# 3. Copy only the package files first to cache dependencies
COPY package*.json ./

# 4. Install the backend dependencies inside the container
RUN npm install

# 5. Copy the rest of your backend code into the container
COPY . .

# 6. Generate the Prisma client so the database ORM works
RUN npx prisma generate

# 7. Expose port 3000 so the container can communicate with the outside world
EXPOSE 3000

# 8. The command to start your backend
CMD ["npm", "run", "dev"]