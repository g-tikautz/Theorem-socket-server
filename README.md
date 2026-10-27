# Theorem socket server

Game server for **Theorem**, a multiplayer trading-card game in the style of games like Magic: The Gathering. Theorem was a collaborative school project at HTL Leonding in 2022–2023, developed by a team of four: Simon Kletsch, Felix Fuchshuber, Marvin Aichinger and me.

The game was first built in Unity. From autumn 2022 the team developed a Next.js web client. The architecture document for the Next.js version shows the web clients connecting to a TypeScript Socket.IO game server. This repository contains that server.

| Part | Technology | Where |
|---|---|---|
| Web client | Next.js, React, TypeScript, socket.io-client | [5AHITM/Theorem](https://github.com/5AHITM/Theorem), in the `project/` folder |
| Unity client | Unity, C# | Linked from the [main repository](https://github.com/5AHITM/Theorem) |
| Game server | TypeScript, Express, Socket.IO, MongoDB | This repository |

The game server handles matchmaking and game rooms, keeps the game state, and applies the game rules between the two players.

This repository is kept as a record of earlier work. It is not maintained and not production-ready (see [Known limitations](#known-limitations)).

## What it does

- **Matchmaking:** a connecting player either joins a waiting game room or opens a new one.
- **Private rooms:** a player can create a room and share its five-character room ID, and a second player joins with that ID.
- **Game state:** for each room the server keeps both players' decks, hands, fields, graveyards, health and mana. It also keeps track of turns.
- **Game rules on the server:**
  - mana-based turns and mana conversion
  - card draws
  - stance changes (attack/defence, open/hidden)
  - card-versus-card and card-versus-player attacks
  - card effects: Shield, Taunt, Pierce, Bounty, Cage
  - game-over detection
- **Relaying moves:** each player's actions are sent to the opponent over Socket.IO.
- **Disconnects:** if one player disconnects, the opponent is disconnected and the room is removed.

Card data is loaded from MongoDB (collections `User` and `Cards`). Each deck is shuffled when the game starts.

## Stack

- TypeScript (Node.js)
- Express and Socket.IO 4
- MongoDB via Mongoose 6
- Docker / Docker Compose

## Setup

You need Node.js and a MongoDB instance that already contains `User` and `Cards` data. This repository does not include seed data.

1. Create a `.env` file in the project root:

   ```
   DB_CONN_STRING=<MongoDB connection string>
   FRONTEND_SERVERS=<space-separated list of allowed client origins>
   ```

   `FRONTEND_SERVERS` is used as the CORS origin list.

2. Install dependencies and start the server:

   ```
   npm install
   npm start      # compiles with tsc and runs dist/index.js
   npm run dev    # alternative: rebuilds and restarts on changes in src/ (nodemon)
   ```

   Or run it with Docker:

   ```
   docker compose up --build
   ```

   Compose reads the same `.env` file.

The server listens on port **4000**. This port is fixed in the code.

Clients connect with Socket.IO and send these handshake query parameters:

| Parameter | Meaning |
|---|---|
| `token` | must be `WEB`, otherwise the connection is rejected |
| `roomId` | join an existing room |
| `isPrivate` | create a private room |
| `playerId` | player identifier |
| `spectator` | `true` to connect as a spectator |

These instructions come from reading the source code. They have not been re-tested recently, and with current Node.js versions the dependencies (from 2022) may need updating.

## My role

Theorem was a team effort. My contributions were the Next.js web client and this game server. I set up the web client and wrote most of its code, and I wrote most of this server.

From the commit history:

- **This repository:** 33 of 36 commits are mine. Marvin Aichinger contributed the spectate feature, event-name changes and one bug fix.
- **Web client ([5AHITM/Theorem](https://github.com/5AHITM/Theorem)):** 62 of 86 commits across all branches are mine, under the names ToyotaKakashi and Gregor Tikautz. The other commits come from the other three team members.

Commit counts show only part of the work. The other team members' contributions to the game as a whole are not listed here.

## Known limitations

<details>
<summary>Show the 8 known limitations</summary>

- **No real authentication.** The handshake only checks a fixed token (`WEB`), and the game logic trusts values sent by the client, such as damage amounts.
- **Connection handling.** Handshake data is stored in module-level variables shared by all connections, so two clients connecting at nearly the same time can be mixed up.
- **State is only in memory.** Running games are lost when the server restarts, and the server cannot be scaled to more than one instance.
- **Decks are not per player.** Every player's deck is built from the first user record in the database.
- **Spectating is incomplete.** The server can list running games, but the function for joining a game as a spectator is a stub.
- **No tests.** Most of the logic is in a single `src/index.ts`.
- **The Docker image uses `node:latest`,** so builds are not reproducible.
- **No full security audit.** Runtime configuration is loaded from environment variables. The current `.gitignore` excludes `.env` files. A comprehensive historical security audit has not been performed.

</details>
