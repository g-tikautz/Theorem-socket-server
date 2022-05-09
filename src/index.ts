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

let roomId: string | string[] | undefined = undefined;
let isPrivate: string | string[] | undefined = undefined;

io.use((socket, next) => {
  roomId = socket.handshake.query.roomId;
  isPrivate = socket.handshake.query.isPrivate;
  console.log("roomId");
  if (socket.handshake.query.token === "UNITY") {
    next();
  } else {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket: Socket) => {
  console.log(roomId);
  console.log(isPrivate);
  if (roomId) {
    joinGameRoom(socket, roomId as string);
  } else {
    if (isPrivate) {
      createPrivateRoom(socket);
    } else {
      normalSearch(socket);
    }
  }

  socket.on(
    "showCardsFighting",
    (
      roomId: string,
      x: number,
      y: number,
      z: number,
      dies: boolean,
      attackDamage: number,
      defenseDamage: number,
      effects: number[],
      x2: number,
      y2: number,
      z2: number,
      dies2: boolean,
      attackDamage2: number,
      defenseDamage2: number,
      effects2: number[]
    ) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit(
            "enemyAttackableStateChange",
            roomId,
            x,
            y,
            z,
            dies,
            attackDamage,
            defenseDamage,
            effects,
            x2,
            y2,
            z2,
            dies2,
            attackDamage2,
            defenseDamage2,
            effects2
          );
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit(
            "enemyAttackableStateChange",
            roomId,
            x,
            y,
            z,
            dies,
            attackDamage,
            defenseDamage,
            effects,
            x2,
            y2,
            z2,
            dies2,
            attackDamage2,
            defenseDamage2,
            effects2
          );
      }
    }
  );

  socket.on(
    "showUserAttack",
    (roomId: string, x: number, y: number, z: number, value: number) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit("enemyAttackableStateChange", x, y, z, value);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit("enemyAttackableStateChange", x, y, z, value);
      }
    }
  );

  socket.on(
    "enemyAttackableStateChange",
    (roomId: string, attackable: boolean) => {
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

  socket.on("playerPlaysCard", (roomId: string, data) => {
    if (gameRooms.get(roomId)!.player1 == socket.id) {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player2)
        ?.emit("playerPlaysCard", data);
    } else {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player1)
        ?.emit("playerPlaysCard", data);
    }
  });

  socket.on(
    "toggleDefenseMode",
    (
      roomId: string,
      x: number,
      y: number,
      z: number,
      inDefenseMode: boolean
    ) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit("toggleDefenseMode", x, y, z, inDefenseMode);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit("toggleDefenseMode", x, y, z, inDefenseMode);
      }
    }
  );

  socket.on("playerEndedTurn", (roomId: string) => {
    if (gameRooms.get(roomId)!.player1 == socket.id) {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player2)
        ?.emit("playerEndedTurn");
    } else {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player1)
        ?.emit("playerEndedTurn");
    }
  });

  socket.on(
    "playerAttacks",
    (
      roomId: string,
      attackingCards: number[],
      attackedCard: number[],
      attackingUserCards: number[]
    ) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit(
            "playerAttacks",
            attackingCards,
            attackedCard,
            attackingUserCards
          );
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit(
            "playerAttacks",
            attackingCards,
            attackedCard,
            attackingUserCards
          );
      }
    }
  );

  socket.on(
    "playerTakesDamage",
    (roomId: string, player1Damage: number, player2Damage: number) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit("playerTakesDamage", player1Damage, player2Damage);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit("playerTakesDamage", player1Damage, player2Damage);
      }
    }
  );

  socket.on("disconnect", () => {
    console.log("user disconnected");
    let gameRoomId: string = "";
    gameRooms.forEach((gameRoom) => {
      if (gameRoom.player1 == socket.id || gameRoom.player2 == socket.id) {
        gameRoomId = gameRoom.gameroomId;
      }
    });

    if (gameRooms.get(gameRoomId)) {
      if (gameRooms.get(gameRoomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(gameRoomId)!.player2)
          ?.disconnect(true);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(gameRoomId)!.player1)
          ?.disconnect(true);
      }
      gameRooms.delete(gameRoomId);
    }
  });

  socket.on("gameFinished", (roomId: string) => {
    console.log("game finished");
    if (gameRooms.get(roomId)!.player1 == socket.id) {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player2)
        ?.emit("gameFinished");
    } else {
      io.sockets.sockets
        .get(gameRooms.get(roomId)!.player1)
        ?.emit("gameFinished");
    }
  });
});

function normalSearch(socket: Socket) {
  if (freeGameRooms.length == 0) {
    let gameRoom = new GameRoom();
    gameRoom.gameroomId = generateGameRoomID();
    gameRoom.player1 = socket.id;
    gameRooms.set(gameRoom.gameroomId, gameRoom);
    freeGameRooms.push(gameRoom.gameroomId);
    socket.emit("gameRoomID", gameRoom.gameroomId);
  } else {
    let gameRoom = gameRooms.get(freeGameRooms.splice(0, 1)[0]);
    if (gameRoom) {
      gameRoom!.player2 = socket.id;
      gameRoom!.status = GameStatus.playing;
      socket.emit("gameRoomID", gameRoom!.gameroomId);
      let random_boolean = Math.random() < 0.5;
      io.sockets.sockets
        .get(gameRoom!.player1)
        ?.emit("startGame", random_boolean);
      io.sockets.sockets
        .get(gameRoom!.player2)
        ?.emit("startGame", !random_boolean);
    }
  }
}

function joinGameRoom(socket: Socket, roomId: string) {
  let gameRoom = gameRooms.get(roomId);
  if (gameRoom) {
    gameRoom.player2 = socket.id;
    gameRoom.status = GameStatus.playing;
    socket.emit("gameRoomID", gameRoom.gameroomId);
    let random_boolean = Math.random() < 0.5;
    io.sockets.sockets.get(gameRoom.player1)?.emit("startGame", random_boolean);
    io.sockets.sockets
      .get(gameRoom.player2)
      ?.emit("startGame", !random_boolean);
  } else {
    console.log("gameRoom not found");
    socket.disconnect();
  }
}

function createPrivateRoom(socket: Socket) {
  console.log("yeah");
  let gameRoom = new GameRoom();
  gameRoom.gameroomId = generateGameRoomID();
  gameRoom.player1 = socket.id;
  gameRooms.set(gameRoom.gameroomId, gameRoom);
  socket.emit("gameRoomID", gameRoom.gameroomId);
}
