FROM node:alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js sum.js sum.test.js ./

RUN npm test

EXPOSE 3010

CMD ["npm", "start"]



# Dockerfile => Image => Container 
# We create => Docker => Docker
#              pull image from registry => Container 

# docker build -t nodejs_2_health .
# docker run --rm -p 3010:3010 nodejs_2_health
# docker build --platform linux/amd64 -t nodejs_2_health .