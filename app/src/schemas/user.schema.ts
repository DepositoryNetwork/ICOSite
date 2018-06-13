/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { model, Model, Schema, Document } from "mongoose";
import { User } from "../types/user";
import * as bcrypt from "bcrypt";

export interface UserModel extends User, Document { }

const userSchema: Schema = new Schema({
        uuid: {
            type: String,
            required: true,
            unique: true
        },
        username: {
            type: String,
            required: true,
            unique: true
        },
        email: {
            type: String,
            required: true
        },
        password: {
            type: String,
            required: true
        },
        token: {
            type: String,
            required: true
        },
        isKYCApproved: {
            type: Boolean,
            required: true,
            default: false
        },
        isEmailVerified: {
            type: Boolean,
            required: true,
            default: false
        }
    },
    {
        timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
    });

userSchema.pre("save", function (next) {
    const user = this;
    if (user.isNew || user.isModified("password")) {
        bcrypt.genSalt(10, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            });
        });
    } else next();
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return await bcrypt.compare(candidatePassword, this.password);
};

export const UserSchema: Model<UserModel> = model<UserModel>("User", userSchema);
