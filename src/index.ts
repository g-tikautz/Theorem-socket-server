import { Socket } from "socket.io";
import express from "express";

import * as http from "http";

import { Server } from "socket.io";
import { GameRoom, GameStatus } from "./model/gameRoom";

// Server messages
interface ServerToClientEvents {
  noArg: () => void;
  basicEmit: (a: number, b: string, c: Buffer) => void;
  withAck: (d: string, callback: (e: number) => void) => void;
  gameRoomID: (id: string) => void;
  startGame: (start: boolean) => void;
}

// Client messages
interface ClientToServerEvents {
  hello: () => void;
  enemyAttackableStateChange: (attackable: boolean) => void;
}

// Interal Server events
interface InterServerEvents {
  ping: () => void;
}

// Individual client data
interface SocketData {
  name: string;
  age: number;
}

let gameRooms: Map<string, GameRoom> = new Map<string, GameRoom>();

let gameRoomIDs: string[] = [];

let freeGameRooms: string[] = [];

function generateGameRoomID(): string {
  let id = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  do {
    for (let i = 0; i < 5; i++) {
      id += possible.charAt(Math.floor(Math.random() * possible.length));
    }
  } while (gameRoomIDs.includes(id));

  return id;
}

const app = express();

const server: http.Server = http.createServer(app);
const io: Server = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server);

server.listen(3000, () => {
  console.log("listening on *:3000");
});

io.on("connection", (socket: Socket) => {
  console.log(socket.id);

  if (freeGameRooms.length == 0) {
    let gameRoom = new GameRoom();
    gameRoom.gameroomId = generateGameRoomID();
    gameRoom.player1 = socket.id;
    gameRooms.set(gameRoom.gameroomId, gameRoom);
    freeGameRooms.push(gameRoom.gameroomId);
    socket.emit("gameRoomID", gameRoom.gameroomId);
    console.log("created new game room");
  } else {
    console.log("found free game room");
    let gameRoom = gameRooms.get(freeGameRooms.splice(0, 1)[0]);
    gameRoom!.player2 = socket.id;
    gameRoom!.status = GameStatus.playing;
    socket.emit("gameRoomID", gameRoom!.gameroomId);
    let random_boolean = Math.random() < 0.5;
    console.log(random_boolean);
    io.sockets.sockets
      .get(gameRoom!.player1)
      ?.emit("startGame", random_boolean);
    io.sockets.sockets
      .get(gameRoom!.player2)
      ?.emit("startGame", !random_boolean);
  }

  socket.on(
    "enemyAttackableStateChange",
    (roomId: string, attackable: boolean) => {
      console.log("attackable" + attackable);
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit("enemyAttackableStateChange", attackable);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit("enemyAttackableStateChange", attackable);
      }
    }
  );

  socket.on("playerDrawsCard", (roomId: string) => {
    if (gameRooms.get(roomId)!.player1 == socket.id) {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player2)
        ?.emit("playerDrawsCard");
    } else {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player1)
        ?.emit("playerDrawsCard");
    }
  });

  socket.on("playerPlaysCard", (data) => {
    console.log(data);
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", (msg) => {
    console.log("message: " + msg);
  });
});
