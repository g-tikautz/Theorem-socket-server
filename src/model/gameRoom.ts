import { Player } from "./player";

export class GameRoom {
  _gameroomId: string;
  _status: GameStatus;
  _player1Utilities: Player = new Player();
  _player2Utilities: Player = new Player();
  turn: number = 0;

  constructor() {
    this._gameroomId = "unset";
    this._player1Utilities.socketId = "unset";
    this._player2Utilities.socketId = "unset";
    this._status = GameStatus.WAITING;
  }

  get gameroomId(): string {
    return this._gameroomId;
  }

  get status(): GameStatus {
    return this._status;
  }

  set status(status: GameStatus) {
    this._status = status;
  }

  set gameroomId(id: string) {
    this._gameroomId = id;
  }

  get isFull(): boolean {
    return this._player1Utilities.socketId !== "unset" && this._player2Utilities.socketId !== "unset";
  }
}

export enum GameStatus {
  WAITING,
  PLAYING,
  FINISHED,
}
