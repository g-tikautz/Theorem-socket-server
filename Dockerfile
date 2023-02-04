FROM node:latest As production
EXPOSE 4000
WORKDIR /usr/app
COPY ./ ./usr/app
RUN npm install
CMD ["npm", "start"]