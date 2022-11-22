import { model, Schema } from "mongoose";

export interface UserType {
    name: String,
    cards: [{ type: Schema.Types.ObjectId, ref: 'Card' }]
}

export interface CardType {
    name: String,
    mana: Number,
    religion_type: String,
    attack: Number,
    defense: Number,
    text: String,
    img: String,
    effect: String
};

const UserSchema = new Schema({
    name: String,
    cards: [{ type: Schema.Types.ObjectId, ref: 'Card' }]
});

const CardSchema = new Schema({
    name: String,
    mana: Number,
    religion_type: String,
    attack: Number,
    defense: Number,
    text: String,
    img: String,
    effect: String
});

export const User = model<UserType>('User', UserSchema);

export const Card = model<CardType>('Card', CardSchema);