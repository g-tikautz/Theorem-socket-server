import { Socket } from "socket.io";

const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

server.listen(3000, () => {
  console.log("listening on *:3000");
});

io.on("connection", (socket: Socket) => {
  console.log(socket.client.conn.remoteAddress);
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", (msg) => {
    console.log("message: " + msg);
  });
});
