import { CardDTO } from "./Card";

export class Player {
  health: number = 20;
  playerDeck: CardDTO[] = [];
  playerCurrentDeck: CardDTO[] = [];
  playerHand: CardDTO[] = [];
  playerField: CardDTO[] = [];
  playerGrave: CardDTO[] = [];
  playerPlayed: boolean = false;
  socketId: string = "";
  mana: number = 1;
  manaConverted: number = 0;
  playerID: string = "";
}
