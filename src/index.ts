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
import { StandardEffects } from "./model/Enum";
import { Result } from "./model/Result";
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

    socket.on("changeTurn", (roomId: string) => {
      let gameRoom = gameRooms.get(roomId)!;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        gameRoom._player1Utilities.playerPlayed = true;
        if (
          gameRoom._player1Utilities.playerPlayed &&
          gameRoom._player2Utilities.playerPlayed &&
          gameRoom.turn < 7
        ) {
          gameRoom.turn++;
          gameRoom._player1Utilities.playerPlayed = false;
          gameRoom._player2Utilities.playerPlayed = false;
        }
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit("changeTurn", gameRoom.turn);

        // reset cards to inital state that are on the game field
        gameRoom._player1Utilities.playerField.map((card) => {
          return gameRoom._player1Utilities.playerDeck.find(
            (cardn) => cardn.key == card.key
          )!;
        });
      } else {
        gameRooms.get(roomId)!._player2Utilities.playerPlayed = true;
        if (
          gameRoom._player1Utilities.playerPlayed &&
          gameRoom._player2Utilities.playerPlayed &&
          gameRoom.turn < 7
        ) {
          gameRoom.turn++;
          gameRoom._player1Utilities.playerPlayed = false;
          gameRoom._player2Utilities.playerPlayed = false;
        }
        gameRoom._player2Utilities.playerField.map((card) => {
          return gameRoom._player2Utilities.playerDeck.find(
            (cardn) => cardn.key == card.key
          )!;
        });
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
          ?.emit("changeTurn", gameRoom.turn);
      }
    });

    socket.on("drawCard", (roomId: string) => {
      const gameRoom = gameRooms.get(roomId)!;
      let card: CardDTO | undefined = undefined;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        card = gameRoom._player1Utilities.playerCurrentDeck.pop();
        gameRoom._player1Utilities.playerHand.push(card!);
        if (card) {
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("nextCard", card);
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("cardDrawn", card.id);
        }
      } else {
        card = gameRoom._player2Utilities.playerCurrentDeck.pop();
        gameRoom._player2Utilities.playerHand.push(card!);
        if (card) {
          io.sockets.sockets
            .get(gameRoom._player2Utilities.socketId)
            ?.emit("nextCard", card);
          io.sockets.sockets
            .get(gameRoom._player1Utilities.socketId)
            ?.emit("cardDrawn", card.id);
        }
      }
    });

    socket.on("playerPlaysCard", (roomId: string, cardKey, stance) => {
      const gameRoom = gameRooms.get(roomId);
      if (gameRoom) {
        if (gameRoom._player1Utilities.socketId == socket.id) {
          const card = gameRoom._player1Utilities.playerHand.find(
            (card) => card.key == cardKey
          );
          if (card) {
            card.stance = stance;
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
            card.stance = stance;
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
    });

    socket.on(
      "toggleDefenseMode",
      (roomId: string, inDefenseMode: boolean, cardKey: string) => {
        if (gameRooms.get(roomId)!._player1Utilities.socketId == socket.id) {
          io.sockets.sockets
            .get(gameRooms.get(roomId)!._player2Utilities.socketId)
            ?.emit("toggleDefenseMode", inDefenseMode, cardKey);
        } else {
          io.sockets.sockets
            .get(gameRooms.get(roomId)!._player1Utilities.socketId)
            ?.emit("toggleDefenseMode", inDefenseMode, cardKey);
        }
      }
    );

    socket.on("playerTakesDamage", (roomId: string, playerDamage: number) => {
      if (gameRooms.get(roomId)!._player1Utilities.socketId == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit("playerTakesDamage", playerDamage);
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
          ?.emit("playerTakesDamage", playerDamage);
      }
    });

    socket.on("playerAttacks", (roomId, attackedCardKey, attackingCardKey) => {
      const gameRoom = gameRooms.get(roomId)!;
      let attackedCard;
      let attackingCard;
      let result;
      if (gameRoom._player1Utilities.socketId == socket.id) {
        attackingCard = gameRoom._player1Utilities.playerField.find(
          (card) => card.key == attackedCardKey
        );
        attackedCard = gameRoom._player2Utilities.playerField.find(
          (card) => card.key == attackingCardKey
        );

        if (attackedCard && attackingCard) {
          result = calculateFight(attackedCard, attackingCard);
        }

        //happens if both cards die
        if (result?.attackingCardDies && result?.defendingCardDies) {
          gameRoom._player1Utilities.playerField =
            gameRoom._player1Utilities.playerField.filter(
              (card) => card.key != attackingCardKey
            );
          gameRoom._player2Utilities.playerField =
            gameRoom._player2Utilities.playerField.filter(
              (card) => card.key != attackedCardKey
            );
        } else {
          // happens if the attacking card dies
          if (result?.attackingCardDies && !result?.defendingCardDies) {
            gameRoom._player1Utilities.playerField =
              gameRoom._player1Utilities.playerField.filter(
                (card) => card.key != attackingCardKey
              );
            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .cardTakesDamage(result?.attackingCardDamage!);

            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .removeEffects(result.effectsUsedByDefendingCard);

            // happens if the defending card dies
          } else if (!result?.attackingCardDies && result?.defendingCardDies) {
            gameRoom._player2Utilities.playerField =
              gameRoom._player2Utilities.playerField.filter(
                (card) => card.key != attackedCardKey
              );
            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackingCardKey)!
              .cardTakesDamage(result?.defendingCardDamage!);

            if (
              result.effectsHittingAttackingCard.includes(StandardEffects.CAGE)
            ) {
              gameRoom._player1Utilities.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTrapped();
            }
          } else {
            // happens if both cards survive for whatever dumb reason
            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .cardTakesDamage(result?.attackingCardDamage!);
            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackingCardKey)!
              .cardTakesDamage(result?.defendingCardDamage!);

            if (
              result?.effectsHittingAttackingCard.includes(StandardEffects.CAGE)
            ) {
              gameRoom._player1Utilities.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTrapped();
            }

            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .removeEffects(result?.effectsUsedByDefendingCard ?? []);
          }
        }

        gameRoom._player1Utilities.health -=
          result?.attackingCardsPlayerDamage!;
        gameRoom._player2Utilities.health -=
          result?.defendingCardsPlayerDamage!;

        io.sockets.sockets
          .get(gameRoom._player2Utilities.socketId)
          ?.emit("playerAttacks", attackedCard, attackingCard, result);
      } else {
        attackingCard = gameRoom._player2Utilities.playerField.find(
          (card) => card.key == attackedCardKey
        );
        attackedCard = gameRoom._player1Utilities.playerField.find(
          (card) => card.key == attackingCardKey
        );
        if (attackedCard && attackingCard) {
          result = calculateFight(attackedCard, attackingCard);
        }

        //happens if both cards die
        if (result?.attackingCardDies && result?.defendingCardDies) {
          gameRoom._player2Utilities.playerField =
            gameRoom._player2Utilities.playerField.filter(
              (card) => card.key != attackingCardKey
            );
          gameRoom._player1Utilities.playerField =
            gameRoom._player1Utilities.playerField.filter(
              (card) => card.key != attackedCardKey
            );
        } else {
          // happens if the attacking card dies
          if (result?.attackingCardDies && !result?.defendingCardDies) {
            gameRoom._player2Utilities.playerField =
              gameRoom._player2Utilities.playerField.filter(
                (card) => card.key != attackingCardKey
              );
            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .cardTakesDamage(result?.attackingCardDamage!);

            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .removeEffects(result?.effectsUsedByDefendingCard ?? []);
            // happens if the defending card dies
          } else if (!result?.attackingCardDies && result?.defendingCardDies) {
            gameRoom._player1Utilities.playerField =
              gameRoom._player1Utilities.playerField.filter(
                (card) => card.key != attackedCardKey
              );
            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackingCardKey)!
              .cardTakesDamage(result?.defendingCardDamage!);

            if (
              result?.effectsHittingAttackingCard.includes(StandardEffects.CAGE)
            ) {
              gameRoom._player2Utilities.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTrapped();
            }
          } else {
            // happens if both cards survive for whatever dumb reason
            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .cardTakesDamage(result?.attackingCardDamage!);
            gameRoom._player2Utilities.playerField
              .find((card) => card.key == attackingCardKey)!
              .cardTakesDamage(result?.defendingCardDamage!);

            if (
              result?.effectsHittingAttackingCard.includes(StandardEffects.CAGE)
            ) {
              gameRoom._player2Utilities.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTrapped();
            }

            gameRoom._player1Utilities.playerField
              .find((card) => card.key == attackedCardKey)!
              .removeEffects(result?.effectsUsedByDefendingCard ?? []);
          }
        }

        io.sockets.sockets
          .get(gameRoom._player1Utilities.socketId)
          ?.emit("playerAttacks", attackedCard, attackingCard, result);
      }
    });

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
      console.log("game finished");
      if (gameRooms.get(roomId)!._player1Utilities.socketId == socket.id) {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player2Utilities.socketId)
          ?.emit("gameFinished");
      } else {
        io.sockets.sockets
          .get(gameRooms.get(roomId)!._player1Utilities.socketId)
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
        StandardEffects[effect as keyof typeof StandardEffects]
      );
    });

    deck.push(
      new CardDTO(
        card._id + "_" + index + "_" + id,
        card._id,
        card.name.valueOf(),
        card.text.valueOf(),
        card.attack.valueOf(),
        card.defense.valueOf(),
        card.mana.valueOf(),
        card.img.valueOf(),
        standardEffects,
        card.religion_type.valueOf(),
        "open",
        "attack"
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

function createPrivateRoom(socket: Socket) {
  let gameRoom = new GameRoom();
  gameRoom.gameroomId = generateGameRoomID();
  gameRoom._player1Utilities.socketId = socket.id;
  gameRooms.set(gameRoom.gameroomId, gameRoom);
  socket.emit("gameRoomID", gameRoom.gameroomId);
}

function calculateFight(
  attackingCard: CardDTO,
  defendingCard: CardDTO
): Result {
  const result: Result = new Result();

  if (defendingCard.hasEffect(StandardEffects.CAGE)) {
    result.defendingCardDies = true;

    if (attackingCard.hasEffect(StandardEffects.PIERCE)) {
      result.defendingCardsPlayerDamage = attackingCard.getFightValue();
    }

    if (attackingCard.hasEffect(StandardEffects.BOUNTY)) {
      result.attackingCardsPlayerDamage = -1;
    }
    result.effectsHittingAttackingCard.push(StandardEffects.CAGE);
  } else if (defendingCard.hasEffect(StandardEffects.SHIELD)) {
    if (attackingCard.getFightValue() >= defendingCard.getFightValue()) {
      //attacking card is stronger or euqal strong then no card dies and attacking card gets damage
      result.attackingCardDamage = defendingCard.getFightValue();
    } else {
      //attacking card is weaker - attacking card dies
      result.attackingCardDies = true;
    }
    result.effectsUsedByDefendingCard.push(StandardEffects.SHIELD);
  } else if (
    attackingCard.getFightValue() == defendingCard.getFightValue() &&
    attackingCard.getFightValue() != 0
  ) {
    //The two cards are equally strong
    //When the defending card was in hidden defense it loses
    if (defendingCard.playedStance == "hidden") {
      result.defendingCardDies = true;
      result.attackingCardDamage = defendingCard.getFightValue();

      if (attackingCard.hasEffect(StandardEffects.BOUNTY)) {
        result.attackingCardsPlayerDamage = -1;
      }
    }
    //Both cards die
    else {
      result.defendingCardDies = true;
      result.attackingCardDies = true;

      if (attackingCard.hasEffect(StandardEffects.BOUNTY)) {
        result.attackingCardsPlayerDamage = -1;
      }
    }
  } else if (attackingCard.getFightValue() > defendingCard.getFightValue()) {
    //attacking card wins
    result.defendingCardDies = true;
    result.attackingCardDamage = defendingCard.getFightValue();
    if (
      !(defendingCard.stance === "defense") ||
      attackingCard.hasEffect(StandardEffects.PIERCE)
    ) {
      let diff = attackingCard.getFightValue() - defendingCard.getFightValue();
      result.defendingCardsPlayerDamage = diff;
    }

    if (attackingCard.hasEffect(StandardEffects.BOUNTY)) {
      result.attackingCardsPlayerDamage = -1;
    }
  } else if (attackingCard.getFightValue() < defendingCard.getFightValue()) {
    result.attackingCardDies = true;
    result.defendingCardDamage = attackingCard.getFightValue();

    if (defendingCard.hasEffect(StandardEffects.PIERCE)) {
      let diff = defendingCard.getFightValue() - attackingCard.getFightValue();
      result.attackingCardsPlayerDamage = diff;
    }

    if (defendingCard.hasEffect(StandardEffects.BOUNTY)) {
      result.defendingCardsPlayerDamage = -1;
    }
  }

  return result;
}
