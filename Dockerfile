FROM node:12
WORKDIR /upload__system
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8005
CMD [ "npm", "start" ]