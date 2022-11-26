import { ObjectId, Schema } from "mongoose";
import { StandardEffects } from "./Enum";

export class CardDTO {
  key: string;
  id: ObjectId;
  name: string;
  mana: number;
  religion_type: string;
  attack: number;
  defense: number;
  text: string;
  img: string;
  effect: StandardEffects[];
  stance: "attack" | "defense" = "attack";
  playedStance: "open" | "hidden" = "open";
  trapped: boolean = false;

  constructor(
    key: string,
    id: Schema.Types.ObjectId,
    name: string,
    text: string,
    attack: number,
    defense: number,
    mana: number,
    img: string,
    effect: StandardEffects[],
    religion_type: string,
  ) {
    this.key = key;
    this.id = id;
    this.name = name;
    this.mana = mana;
    this.religion_type = religion_type;
    this.attack = attack;
    this.defense = defense;
    this.text = text;
    this.img = img;
    this.effect = effect;
  }

  hasEffect(effect: StandardEffects): boolean {
    return this.effect.includes(effect);
  }

  getFightValue(): number {
    if (this.stance === "attack" && this.playedStance === "open") {
      return this.attack;
    } else {
      return this.defense;
    }
  }

  cardTakesDamage(damage: number){
    if(this.stance === "attack" && this.playedStance === "open"){
      this.attack -= damage;
    } else {
      this.defense -= damage;
    }
  }

  removeEffects(effects: StandardEffects[]): void {
    this.effect = this.effect.filter((e) => !effects.includes(e));
  }

  cardTrapped(): void {
    this.trapped = true;
    this.stance = "defense";
  }

}
