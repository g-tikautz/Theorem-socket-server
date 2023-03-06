import { CardDTO } from "./model/Card";
import { StandardEffects } from "./model/Enum";
import { Player } from "./model/player";
import { Result } from "./model/Result";

export function processResult(attackingPlayer: Player, defendingPlayer: Player, attackingCardKey: string, defenderCardKey: string) {
    let result: Result;

    let attackingCard = attackingPlayer.playerField.find(
        (card) => card.key == attackingCardKey
    );

    if (!attackingCard) {
        console.error("Attacking card not found");
    }

    //get attacked card
    let attackedCard = defendingPlayer.playerField.find(
        (card) => card.key == defenderCardKey
    );

    if (!attackedCard) {
        console.error("Attacked card not found");
    }

    // if both cards die
    if (attackedCard && attackingCard) {
        result = calculateFight(attackingCard, attackedCard);
    } else {
        console.error("Returning");
        return {
            result: null,
            attackingPlayer: attackingPlayer,
            defendingPlayer: defendingPlayer,
            status: "error",
        };
    }
    //happens if the attacking card and defendingCard dies
    if (result?.attackingCardDies && result?.defendingCardDies) {
        attackingPlayer.playerField =
            attackingPlayer.playerField.filter(
                (card) => card.key != attackingCardKey
            );
        defendingPlayer.playerField =
            defendingPlayer.playerField.filter(
                (card) => card.key != defenderCardKey
            );
    } else {
        // happens if the attacking card dies
        if (result?.attackingCardDies && !result?.defendingCardDies) {
            attackingPlayer.playerField =
                attackingPlayer.playerField.filter(
                    (card) => card.key != attackingCardKey
                );

            defendingPlayer.playerField
                .find((card) => card.key == defenderCardKey)!
                .cardTakesDamage(result.defendingCardDamage);

            defendingPlayer.playerField
                .find((card) => card.key == defenderCardKey)!
                .removeEffects(result.effectsUsedByDefendingCard);

            // happens if the defending card dies
        } else if (!result.attackingCardDies && result.defendingCardDies) {
            defendingPlayer.playerField =
                defendingPlayer.playerField.filter(
                    (card) => card.key != defenderCardKey
                );

            attackingPlayer.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTakesDamage(result.attackingCardDamage);

            if (
                result.effectsHittingAttackingCard.includes(
                    StandardEffects.CAGE
                )
            ) {
                attackingPlayer.playerField
                    .find((card) => card.key == attackingCardKey)!
                    .cardTrapped();
            }

            // happens if both cards survive for whatever dumb reason
        } else {
            defendingPlayer.playerField
                .find((card) => card.key == defenderCardKey)!
                .cardTakesDamage(result.defendingCardDamage);

            attackingPlayer.playerField
                .find((card) => card.key == attackingCardKey)!
                .cardTakesDamage(result.attackingCardDamage);

            if (
                result?.effectsHittingAttackingCard.includes(
                    StandardEffects.CAGE
                )
            ) {
                attackingPlayer.playerField
                    .find((card) => card.key == attackingCardKey)!
                    .cardTrapped();
            }

            defendingPlayer.playerField
                .find((card) => card.key == defenderCardKey)!
                .removeEffects(result.effectsUsedByDefendingCard);
        }
    }

    attackingPlayer.health -=
        result?.attackingCardsPlayerDamage;
    defendingPlayer.health -=
        result?.defendingCardsPlayerDamage;

    attackedCard.playedStance = "open";

    result.attackingCard = attackingCard;
    result.defendingCard = attackedCard;

    console.log("Should send result");

    return {
        result: result,
        attackingPlayer: attackingPlayer,
        defendingPlayer: defendingPlayer,
        status: "success",
    }
}

function calculateFight(
    attackingCard: CardDTO,
    defendingCard: CardDTO
): Result {
    const result: Result = new Result();

    result.attackingCardKey = attackingCard.key;
    result.defendingCardKey = defendingCard.key;

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
            //attacking card is stronger or equal strong then no card dies and attacking card gets damage
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