import { ObjectId } from "mongoose";

export interface Card {
    id: ObjectId;
    name: string;
    mana: number;
    religion_type: string;
    attack: number;
    defense: number;
    text: string;
    img: string;
    effect: string;
}
