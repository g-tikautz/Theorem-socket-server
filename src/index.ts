import { Socket, Server } from "socket.io";
import express from "express";

import * as http from "http";
import { GameRoom, GameStatus } from "./model/gameRoom";

import bodyparser from "body-parser";
import mongoose from "mongoose";
// import { UserSchema } from "./model/UserSchema";
import { CardType, User } from "./model/Schemas";
import { CardDTO } from "./model/Card";
import process from "process";

import dotenv from "dotenv";
import { StandardEffects } from "./model/Enum";
import { Result } from "./model/Result";
import { processResult } from "./functions";
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

console.log(process.env.FRONTEND_SERVERS?.split(" "));

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
    origin: process.env.FRONTEND_SERVERS?.split(" "),
    methods: ["GET", "POST"],
    credentials: true,
  },
});

server.listen(4000, () => {
  console.log("listening on *:4000");
});

let roomId: string | string[] | undefined = undefined;
let isPrivate: string | string[] | undefined = undefined;
let playerId: string = "";
let spectator: string = "false";

io.use((socket, next) => {
  roomId = socket.handshake.query.roomId;
  isPrivate = socket.handshake.query.isPrivate;
  playerId = socket.handshake.query.playerId as string;
  spectator = socket.handshake.query.spectator as string;

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
    if (spectator == "true") {
      console.log("spectator connected");
      spectator = "false";
    } else {
      console.log("player connected");
      if (roomId && roomId != "undefined") {
        await joinGameRoom(socket, roomId as string);
      } else {
        if (isPrivate && isPrivate != "undefined") {
          await createPrivateRoom(socket);
        } else {
          await normalSearch(socket);
        }
      }
    }

    socket.on("runningGames", () => {
      let runningGames: GameRoom[] = [];
      gameRooms.forEach((gameRoom) => {
        if (gameRoom._status == GameStatus.PLAYING) {
          runningGames.push(gameRoom);
        }
      });
      socket.emit("runningGames", runningGames);
    });

    socket.on("changeTurn", (roomId: string) => {
      let gameRoom = gameRooms.get(roomId);
      if (!gameRoom) {
        return;
      }
      if (gameRoom._player1Utilities.socketId == socket.id) {
        gameRoom._player1Utilities.playerPlayed = true;
        if (
          gameRoom._player1Utilities.playerPlayed &&
          gameRoom._player2Utilities.playerPlayed
        ) {
          gameRoom.turn++;
          gameRoom._player1Utilities.playerPlayed = false;
          gameRoom._player2Utilities.playerPlayed = false;
        }
        // reset cards to inital state that are on the game field
        gameRoom._player2Utilities.playerField =
          gameRoom._player2Utilities.playerField.map((card) => {
            let cardN = gameRoom!._player2Utilities.playerDeck.find(
              (cardn) => cardn.key == card.key
            )!;
            cardN.stance = card.stance;
            cardN.playedStance = card.playedStance;
            cardN.trapped = card.trapped;

            return cardN;
          });

        gameRoom._player2Utilities.mana = gameRoom.turn;

        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit(
            "changeTurn",
            gameRoom.turn,
            gameRoom._player1Utilities.playerField,
            gameRoom._player2Utilities.playerField,
            gameRoom.turn >= gameRoom._player2Utilities.manaConverted
          );
      } else {
        gameRooms.get(roomId)!._player2Utilities.playerPlayed = true;
        if (
          gameRoom._player1Utilities.playerPlayed &&
          gameRoom._player2Utilities.playerPlayed
        ) {
          gameRoom.turn++;
          gameRoom._player1Utilities.playerPlayed = false;
          gameRoom._player2Utilities.playerPlayed = false;
        }

        gameRoom._player1Utilities.playerField =
          gameRoom._player1Utilities.playerField.map((card) => {
            let cardN = gameRoom!._player1Utilities.playerDeck.find(
              (cardn) => cardn.key == card.key
            )!;
            cardN.stance = card.stance;
            cardN.playedStance = card.playedStance;
            cardN.trapped = card.trapped;

            return cardN;
          });

        gameRoom._player1Utilities.mana = gameRoom.turn;

        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
          ?.emit(
            "changeTurn",
            gameRoom.turn,
            gameRoom._player2Utilities.playerField,
            gameRoom._player1Utilities.playerField,
            gameRoom.turn >= gameRoom._player1Utilities.manaConverted
          );
      }
    });

    socket.on("drawForFirstTime", (roomId: string) => {
      // If the user draws cards for the frist time give him the first 5 cards from the current deck
      let gameRoom = gameRooms.get(roomId);
      if (!gameRoom) {
        return;
      }
      if (gameRoom._player1Utilities.socketId == socket.id) {
        let cards = [];
        for (let i = 0; i < 5; i++) {
          cards.push(gameRoom._player1Utilities.playerCurrentDeck.pop()!);
        }
        gameRoom._player1Utilities.playerHand = cards;
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
          ?.emit("drawForFirstTime", cards);

        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit("enemyDrawForFirstTime", cards);
      } else {
        let cards = [];
        for (let i = 0; i < 5; i++) {
          cards.push(gameRoom._player2Utilities.playerCurrentDeck.pop()!);
        }
        gameRoom._player2Utilities.playerHand = cards;
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit("drawForFirstTime", cards);
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
          ?.emit("enemyDrawForFirstTime", cards);
      }
    });

    socket.on("convertMana", (roomId: string, mana: number) => {
      let gameRoom = gameRooms.get(roomId)!;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        gameRoom._player1Utilities.health -= mana;
        gameRoom._player1Utilities.mana += mana;
        gameRoom._player1Utilities.manaConverted = gameRoom.turn + mana;
        io.sockets.sockets
          .get(gameRoom._player2Utilities.socketId)
          ?.emit("enemyConvertMana", mana);
      } else {
        gameRoom._player2Utilities.health -= mana;
        gameRoom._player2Utilities.mana += mana;
        gameRoom._player2Utilities.manaConverted = gameRoom.turn + mana;
        io.sockets.sockets
          .get(gameRoom._player1Utilities.socketId)
          ?.emit("enemyConvertMana", mana);
      }
    });

    socket.on("drawCard", (roomId: string) => {
      const gameRoom = gameRooms.get(roomId);
      if (!gameRoom) {
        return;
      }
      let card: CardDTO | undefined = undefined;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        card = gameRoom._player1Utilities.playerCurrentDeck.pop();
        if (card) {
          gameRoom._player1Utilities.playerHand.push(card);
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("nextCard", card);
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("cardDrawn", card.key);
        }
      } else {
        card = gameRoom._player2Utilities.playerCurrentDeck.pop();

        if (card) {
          gameRoom._player2Utilities.playerHand.push(card);
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("nextCard", card);
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("cardDrawn", card.key);
        }
      }
    });

    socket.on("playerPlaysCard",
      (roomId: string, cardKey, playedStance: "open" | "hidden") => {
        const gameRoom = gameRooms.get(roomId);
        if (gameRoom) {
          if (gameRoom._player1Utilities.socketId == socket.id) {
            const card = gameRoom._player1Utilities.playerHand.find(
              (card) => card.key == cardKey
            );
            if (card) {
              card.playedStance = playedStance;
              card.stance =
                card.playedStance == "hidden" ? "defense" : "attack";

              gameRoom._player1Utilities.playerHand =
                gameRoom._player1Utilities.playerHand.filter(
                  (card) => card.key != cardKey
                );
              gameRoom._player1Utilities.playerField.push(card);
              io.sockets.sockets
                .get(gameRoom._player2Utilities.socketId)
                ?.emit("playerPlaysCard", card);
            }
          } else {
            const card = gameRoom._player2Utilities.playerHand.find(
              (card) => card.key == cardKey
            );
            if (card) {
              card.playedStance = playedStance;
              card.stance =
                card.playedStance == "hidden" ? "defense" : "attack";

              gameRoom._player2Utilities.playerHand =
                gameRoom._player2Utilities.playerHand.filter(
                  (card) => card.key != cardKey
                );

              gameRoom._player2Utilities.playerField.push(card);
              io.sockets.sockets
                .get(gameRoom._player1Utilities.socketId)
                ?.emit("playerPlaysCard", card);
            }
          }
        }
      }
    );

    socket.on("changeStance",
      (roomId: string, stance: "attack" | "defense", cardKey: string) => {
        const gameRoom = gameRooms.get(roomId);
        if (!gameRoom) {
          return;
        }
        if (gameRoom._player1Utilities.socketId == socket.id) {
          gameRoom._player1Utilities.playerField.find(
            (card) => card.key == cardKey
          )!.stance = stance;

          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("changeStance", stance, cardKey);
        } else {
          gameRoom._player2Utilities.playerField.find(
            (card) => card.key == cardKey
          )!.stance = stance;
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("changeStance", stance, cardKey);
        }
      }
    );

    socket.on("playerTakesDamage", (roomId: string, playerDamage: number) => {
      let gameRoom = gameRooms.get(roomId);
      if (!gameRoom) return;

      if (gameRoom._player1Utilities.socketId == socket.id) {
        io.sockets.sockets
          .get(gameRoom._player2Utilities.socketId)
          ?.emit("playerTakesDamage", playerDamage);
      } else {
        io.sockets.sockets
          .get(gameRoom._player1Utilities.socketId)
          ?.emit("playerTakesDamage", playerDamage);
      }
    });

    socket.on("playerAttacksPlayer", (roomId, attackingCardKey: string) => {
      let gameRoom = gameRooms.get(roomId);
      if (!gameRoom) {
        return;
      }
      if (gameRoom._player1Utilities.socketId == socket.id) {
        let attackingCard = gameRoom._player1Utilities.playerField.find(
          (card) => card.key == attackingCardKey
        );
        if (attackingCard) {
          gameRoom._player2Utilities.health -= attackingCard.attack;
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit(
              "playerAttacksPlayer",
              attackingCardKey,
              gameRoom._player2Utilities.health
            );

          if (gameRoom._player2Utilities.health <= 0) {
            io.sockets.sockets
              .get(gameRoom._player2Utilities.socketId)
              ?.emit("gameOver", "lost");
            io.sockets.sockets
              .get(gameRoom._player1Utilities.socketId)
              ?.emit("gameOver", "won");
          }
        }
      } else {
        let attackingCard = gameRoom._player2Utilities.playerField.find(
          (card) => card.key == attackingCardKey
        );
        if (attackingCard) {
          gameRoom._player1Utilities.health -= attackingCard.attack;
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit(
              "playerAttacksPlayer",
              attackingCardKey,
              gameRoom._player1Utilities.health
            );

          if (gameRoom._player1Utilities.health <= 0) {
            io.sockets.sockets
              .get(gameRoom._player1Utilities.socketId)
              ?.emit("gameOver", "lost");
            io.sockets.sockets
              .get(gameRoom._player2Utilities.socketId)
              ?.emit("gameOver", "won");
          }
        }
      }
    });

    socket.on("playerAttacks",
      (roomId, attackedCardKey: string, attackingCardKey: string) => {
        const gameRoom: GameRoom | undefined = gameRooms.get(roomId);
        if (!gameRoom) {
          console.error("Game room not found");
          return;
        }
        //player 1 attacks
        if (gameRoom._player1Utilities.socketId == socket.id) {

          let { result, attackingPlayer, defendingPlayer, status } = processResult(gameRoom._player1Utilities, gameRoom._player2Utilities, attackingCardKey, attackedCardKey);

          if (status == "error") {
            console.error("Error processing result");
            return;
          }

          gameRoom._player1Utilities = attackingPlayer;
          gameRoom._player2Utilities = defendingPlayer;

          console.log("Should send result");

          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit(
              "playerAttacks",
              result,
              gameRoom._player2Utilities.health,
              gameRoom._player1Utilities.health
            );

          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit(
              "attackResult",
              result,
              gameRoom._player1Utilities.health,
              gameRoom._player2Utilities.health
            );
          console.log("result", result);


          // if player 2 is the attacker
        } else {
          let { result, attackingPlayer, defendingPlayer, status } = processResult(gameRoom._player2Utilities, gameRoom._player1Utilities, attackingCardKey, attackedCardKey);

          if (status == "error") {
            console.error("Error processing result");
            return;
          }

          gameRoom._player2Utilities = attackingPlayer;
          gameRoom._player1Utilities = defendingPlayer;

          console.log("Should send result");

          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit(
              "playerAttacks",
              result,
              gameRoom._player1Utilities.health,
              gameRoom._player2Utilities.health
            );

          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit(
              "attackResult",
              result,
              gameRoom._player2Utilities.health,
              gameRoom._player1Utilities.health
            );
          console.log("result", result);

        }

        console.log("player1 Field", gameRoom._player1Utilities.playerField);
        console.log("player2 Field", gameRoom._player2Utilities.playerField);
        console.log("====================================");

        if (gameRoom._player1Utilities.health <= 0) {
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("gameOver", "lost");
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("gameOver", "won");
        }

        if (gameRoom._player2Utilities.health <= 0) {
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("gameOver", "lost");
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("gameOver", "won");
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("user disconnected");
      let gameRoomId: string = "";
      gameRooms.forEach((gameRoom) => {
        if (
          gameRoom._player1Utilities.socketId == socket.id ||
          gameRoom._player2Utilities.socketId == socket.id
        ) {
          gameRoomId = gameRoom.gameroomId;
        }
      });

      if (gameRooms.get(gameRoomId)) {
        if (
          gameRooms.get(gameRoomId)!._player1Utilities.socketId == socket.id
        ) {
          io.sockets.sockets
            .get(gameRooms.get(gameRoomId)!._player2Utilities.socketId)
            ?.disconnect(true);
        } else {
          io.sockets.sockets
            .get(gameRooms.get(gameRoomId)!._player1Utilities.socketId)
            ?.disconnect(true);
        }
        gameRooms.delete(gameRoomId);
      }
    });

    socket.on("gameFinished", (roomId: string) => {
      let gameRoom = gameRooms.get(roomId);
      if (!gameRoom) return;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        io.sockets.sockets
          .get(gameRoom._player2Utilities.socketId)
          ?.emit("gameFinished");
      } else {
        io.sockets.sockets
          .get(gameRoom._player1Utilities.socketId)
          ?.emit("gameFinished");
      }
    });
  });
});

async function normalSearch(socket: Socket) {
  if (freeGameRooms.length == 0) {
    let gameRoom = new GameRoom();
    gameRoom.gameroomId = generateGameRoomID();
    gameRoom._player1Utilities.socketId = socket.id;
    gameRoom._player1Utilities.playerID = playerId;
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
    gameRoom._player2Utilities.socketId = socket.id;

    gameRoom._player2Utilities.playerID = playerId;
    gameRoom.status = GameStatus.PLAYING;

    gameRoom._player1Utilities.playerDeck = await getDeck(
      gameRoom._player1Utilities.socketId
    );

    gameRoom._player2Utilities.playerDeck = await getDeck(
      gameRoom._player2Utilities.socketId
    );

    gameRoom._player1Utilities.playerCurrentDeck = Array.from(
      gameRoom._player1Utilities.playerDeck
    );

    gameRoom._player2Utilities.playerCurrentDeck = Array.from(
      gameRoom._player2Utilities.playerDeck
    );

    gameRoom.turn = 1;
    socket.emit("gameRoomID", gameRoom.gameroomId);
    let random_boolean = Math.random() < 0.5;
    io.sockets.sockets
      .get(gameRoom._player1Utilities.socketId)
      ?.emit("startGame", random_boolean);
    io.sockets.sockets
      .get(gameRoom._player2Utilities.socketId)
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

  data[0].cards.forEach((card, index) => {
    //create unique hashcode for each card
    const standardEffects: StandardEffects[] = [];
    card.effect.forEach((effect) => {
      standardEffects.push(
        StandardEffects[
        effect.toLocaleUpperCase() as keyof typeof StandardEffects
        ]
      );
    });

    // generate random hashcode for each card
    let hashcode = Math.random().toString(36).substring(2, 15);

    deck.push(
      new CardDTO(
        hashcode + id,
        card._id,
        card.name.valueOf(),
        card.text.valueOf(),
        card.attack.valueOf(),
        card.defense.valueOf(),
        card.mana.valueOf(),
        card.img.valueOf(),
        standardEffects,
        card.religion_type.valueOf()
      )
    );
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
    await startGame(socket, gameRoom);
  } else {
    console.log("gameRoom not found");
    socket.disconnect();
  }
}

async function createPrivateRoom(socket: Socket) {
  let gameRoom = new GameRoom();
  gameRoom.gameroomId = generateGameRoomID();
  gameRoom._player1Utilities.socketId = socket.id;
  gameRoom._player1Utilities.playerID = playerId;
  gameRooms.set(gameRoom.gameroomId, gameRoom);
  socket.emit("gameRoomID", gameRoom.gameroomId);
}

async function joinGameRoomAsSpectator(socket: Socket, roomId: string) {
  let gameRoom = gameRooms.get(roomId);
  if (gameRoom) {
    //gameRoom._spectatorUtilities.socketId = socket.id;
  }
}
