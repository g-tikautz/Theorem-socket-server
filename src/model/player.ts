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
}