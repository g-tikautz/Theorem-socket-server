import { Socket, Server } from "socket.io";
import express from "express";

import * as http from "http";
import { GameRoom, GameStatus } from "./model/GameRoom";

import bodyparser from "body-parser";
import mongoose from "mongoose";
// import { UserSchema } from "./model/UserSchema";
import { CardType, User } from "./model/Schemas";
import { CardDTO } from "./model/Card";
import process from "process";

import dotenv from "dotenv";
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
      const gameRoom = gameRooms.get(roomId)!;
      let card: CardDTO | undefined = undefined;
      if (gameRoom.player1 == socket.id) {
        card = gameRoom._player1CurrentDeck.pop();
        if (card) {
          io.sockets.sockets.get(gameRoom.player1)?.emit("nextCard", card);
          io.sockets.sockets.get(gameRoom.player2)?.emit("cardDrawn", card.id);
        }
      } else {
        card = gameRoom._player2CurrentDeck.pop();
        if (card) {
          io.sockets.sockets.get(gameRoom.player2)?.emit("nextCard", card);
          io.sockets.sockets.get(gameRoom.player1)?.emit("cardDrawn", card.id);
        }
      }
    });

    socket.on("playerPlaysCard", (roomId: string, cardKey) => {
      const gameRoom = gameRooms.get(roomId);
      if (gameRoom) {
        if (gameRoom.player1 == socket.id) {
          io.sockets.sockets.get(gameRoom.player2)?.emit(
            "playerPlaysCard",
            gameRoom._player1Deck.find((card) => card.key == cardKey)
          );
        } else {
          io.sockets.sockets.get(gameRoom.player1)?.emit(
            "playerPlaysCard",
            gameRoom._player2Deck.find((card) => card.key == cardKey)
          );
        }
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
    gameRoom._player1Deck = await getDeck(gameRoom.player1);
    gameRoom._player2Deck = await getDeck(gameRoom.player2);
    gameRoom._player1CurrentDeck = gameRoom._player1Deck;
    gameRoom._player2CurrentDeck = gameRoom._player2Deck;
    socket.emit("gameRoomID", gameRoom.gameroomId);
    let random_boolean = Math.random() < 0.5;
    io.sockets.sockets.get(gameRoom.player1)?.emit("startGame", random_boolean);
    io.sockets.sockets
      .get(gameRoom.player2)
      ?.emit("startGame", !random_boolean);
    return true;
  }
  return false;
}

async function getDeck(id: string): Promise<CardDTO[]> {
  let data = await User.find()
    .populate<{ cards: CardType[] }>("cards")
    .orFail();

  let deck: CardDTO[] = [];

  data[0].cards.forEach((card) => {
    //create unique hashcode for each card
    deck.push({
      key: card._id + "_" + id,
      id: card._id,
      name: card.name.valueOf(),
      text: card.text.valueOf(),
      attack: card.attack.valueOf(),
      defense: card.defense.valueOf(),
      mana: card.mana.valueOf(),
      img: card.img.valueOf(),
      effect: card.effect.valueOf(),
      religion_type: card.religion_type.valueOf(),
    });
  });

  //shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

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
