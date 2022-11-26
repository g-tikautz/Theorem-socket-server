import { CardDTO } from "./Card";
import { StandardEffects } from "./Enum";

export class Result {
    attackingCardKey: string = "";
    defendingCardKey: string = "";
    defendingCardDies: boolean = false;
    attackingCardDies: boolean = false;
    defendingCardsPlayerDamage = 0;
    attackingCardsPlayerDamage = 0;
    attackingCardDamage = 0;
    defendingCardDamage = 0;
    effectsHittingAttackingCard: StandardEffects[] = [];
    effectsUsedByDefendingCard: StandardEffects[] = [];
    attackingCard?: CardDTO;
    defendingCard?: CardDTO;
}