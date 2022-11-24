import { model, ObjectId, Schema } from "mongoose";

export interface UserType {
  name: String;
  cards: [{ type: Schema.Types.ObjectId; ref: "Card" }];
}

export interface CardType {
  _id: ObjectId;
  name: String;
  mana: Number;
  religion_type: String;
  attack: Number;
  defense: Number;
  text: String;
  img: String;
  effect: [String];
}

const UserSchema = new Schema(
  {
    name: String,
    cards: [{ type: Schema.Types.ObjectId, ref: "Card" }],
  },
  {
    collection: "User",
  }
);

const CardSchema = new Schema(
  {
    name: String,
    mana: Number,
    religion_type: String,
    attack: Number,
    defense: Number,
    text: String,
    img: String,
    effect: [String],
  },
  {
    collection: "Cards",
  }
);

export const User = model<UserType>("User", UserSchema);

export const Card = model<CardType>("Card", CardSchema);
