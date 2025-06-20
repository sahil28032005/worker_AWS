FROM alpine:latest

ENV LANG=C.UTF-8

# Install Node.js, Git, and Curl using apk
RUN apk update && \
    apk add --no-cache \
    nodejs \
    npm \
    git \
    curl \
    bash  # Optional: If you need bash, as Alpine uses `ash` by default

# Set the working directory inside the container
WORKDIR /app

# Copy your application files to the container (replace '.' with your source directory)
COPY service.sh service.sh
COPY script.js script.js
COPY package*.json ./
COPY .env .env

#run npm i for packages installation
RUN npm install

# Make the shell script executable (if needed)
RUN chmod +x /app/service.sh

# Set the shell script as the entry point
ENTRYPOINT ["/app/service.sh"]