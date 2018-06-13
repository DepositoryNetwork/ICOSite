FROM node:9

RUN mkdir /app
WORKDIR /app

# Supposedly speeds up npm install
RUN npm set progress=false

COPY package.json /app
RUN npm install --verbose

COPY . /app

EXPOSE 3000

CMD ["npm", "run", "start"]