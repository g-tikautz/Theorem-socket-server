FROM node:latest As production
EXPOSE 4000
WORKDIR /
COPY . .
RUN npm install
CMD ["npm", "start"]