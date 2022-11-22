import { Socket, Server } from "socket.io";
import express from "express";

import * as http from "http";
import { GameRoom, GameStatus } from "./model/GameRoom";

import bodyparser from 'body-parser';
import mongoose from "mongoose";
// import { UserSchema } from "./model/UserSchema";
import { CardType, User } from "./model/Schemas";
import { Card } from "./model/Card";
import process from "process";

import * as dotenv from 'dotenv';
dotenv.config();

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

app.use(bodyparser.json());

const server: http.Server = http.createServer(app);
const io: Server = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

server.listen(4000, () => {
  console.log("listening on *:4000");
});

let roomId: string | string[] | undefined = undefined;
let isPrivate: string | string[] | undefined = undefined;

io.use((socket, next) => {
  roomId = socket.handshake.query.roomId;
  isPrivate = socket.handshake.query.isPrivate;


  if (socket.handshake.query.token === "WEB") {
    next();
  } else {
    next(new Error("Authentication error"));
  }
});

mongoose.connect(process.env.DB_CONN_STRING as string, (err: any) => {
  if (err) {
    throw err;
  }
  io.on("connection", async (socket: Socket) => {
    if (roomId && roomId != "undefined") {
      await joinGameRoom(socket, roomId as string);
    } else {
      if (isPrivate && isPrivate != "undefined") {
        createPrivateRoom(socket);
      } else {
        await normalSearch(socket);
      }
    }

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

    socket.on("drawCard", (roomId: string) => {
      if (gameRooms.get(roomId)!.player1 == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player2)
          ?.emit("cardDrawn");
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!.player1)
          ?.emit("cardDrawn");
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
});

async function normalSearch(socket: Socket) {
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
      await startGame(socket, gameRoom);
      return;
    } else {
      console.log("no game started");
    }
  }
}

async function startGame(socket: Socket, gameRoom: GameRoom) {
  if (gameRoom) {
    gameRoom.player2 = socket.id;
    gameRoom.status = GameStatus.PLAYING;
    gameRoom._player1Deck = await getDeck(
      gameRoom.player1,
    );
    socket.emit("gameRoomID", gameRoom.gameroomId);
    let random_boolean = Math.random() < 0.5;
    io.sockets.sockets
      .get(gameRoom.player1)
      ?.emit("startGame", random_boolean);
    io.sockets.sockets
      .get(gameRoom.player2)
      ?.emit("startGame", !random_boolean);
    return true;
  }
  return false;
}

async function getDeck(id: string): Promise<Card[]> {
  console.log(id);
  let data = await User.find().populate<{ cards: CardType[] }>("cards").orFail();

  console.log(data);
  // data?.cards.map((card) => {
  //   console.log(card);
  //   return <Card>{
  //     id: card._id,
  //     name: card.name,
  //     text: card.text,
  //     attack: card.attack,
  //     defense: card.defense,
  //     mana: card.mana,
  //     img: card.img,
  //     effect: card.effect,
  //     religion_type: card.religion_type,
  //   }
  // });


  let deck: Card[] = [];

  return deck;
}

async function joinGameRoom(socket: Socket, roomId: string) {
  let gameRoom = gameRooms.get(roomId);
  if (gameRoom) {
    // gameRoom.player2 = socket.id;
    // gameRoom.status = GameStatus.PLAYING;
    // socket.emit("gameRoomID", gameRoom.gameroomId);
    // let random_boolean = Math.random() < 0.5;
    // io.sockets.sockets.get(gameRoom.player1)?.emit("startGame", random_boolean);
    // io.sockets.sockets
    //   .get(gameRoom.player2)
    //   ?.emit("startGame", !random_boolean);
    await startGame(socket, gameRoom);
  } else {
    console.log("gameRoom not found");
    socket.disconnect();
  }
}

function createPrivateRoom(socket: Socket) {
  let gameRoom = new GameRoom();
  gameRoom.gameroomId = generateGameRoomID();
  gameRoom.player1 = socket.id;
  gameRooms.set(gameRoom.gameroomId, gameRoom);
  socket.emit("gameRoomID", gameRoom.gameroomId);
}
