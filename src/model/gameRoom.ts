import { CardDTO } from "./Card";
import { CardType } from "./Schemas";

export class GameRoom {
  _gameroomId: string;
  _player1: string;
  _player2: string;
  _status: GameStatus;
  _player1Deck: CardDTO[] = [];
  _player2Deck: CardDTO[] = [];
  _player1CurrentDeck: CardDTO[] = [];
  _player2CurrentDeck: CardDTO[] = [];

  constructor() {
    this._gameroomId = "unset";
    this._player1 = "unset";
    this._player2 = "unset";
    this._status = GameStatus.WAITING;
  }

  get gameroomId(): string {
    return this._gameroomId;
  }

  get player1(): string {
    return this._player1;
  }

  get player2(): string {
    return this._player2;
  }

  get status(): GameStatus {
    return this._status;
  }

  set player1(name: string) {
    this._player1 = name;
  }

  set player2(name: string) {
    this._player2 = name;
  }

  set status(status: GameStatus) {
    this._status = status;
  }

  set gameroomId(id: string) {
    this._gameroomId = id;
  }

  get isFull(): boolean {
    return this._player1 !== "unset" && this._player2 !== "unset";
  }
}

export enum GameStatus {
  WAITING,
  PLAYING,
  FINISHED,
}
