import { CardDTO } from "./Card";

export class Player {
    playerDeck: CardDTO[] = [];
    playerCurrentDeck: CardDTO[] = [];
    playerHand: CardDTO[] = [];
    playerField: CardDTO[] = [];
    playerGrave: CardDTO[] = [];
    playerPlayed: boolean = false;
    socketId: string = "";
}