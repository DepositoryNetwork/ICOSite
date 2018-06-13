/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { model, Model, Schema, Document } from "mongoose";
import { WhitelistPair } from "../types/whitelist.pair";

export interface WhitelistBufferModel extends WhitelistPair, Document {
    status: WhitelistStatus;
    retryCount: number;
    updatedAt: Date;
}

export enum WhitelistStatus {
    processing = "processing",
    unprocessed = "unprocessed"
}

const whitelistSchema: Schema = new Schema({
    ethereumWallet: {
        type: String,
        required: true,
        unique: true,
        sparse: true
    },
    kycId: {
        type: String,
        required: true
    },
    status: {
        type: WhitelistStatus,
        required: true,
        default: WhitelistStatus.unprocessed
    },
    retryCount: {
        type: Number,
        default: 0,
        min: 0
    }
},
{
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
});

export const WhitelistBufferSchema: Model<WhitelistBufferModel> = model<WhitelistBufferModel>("WhitelistBuffer", whitelistSchema);