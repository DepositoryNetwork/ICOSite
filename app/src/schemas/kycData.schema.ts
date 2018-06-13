/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { model, Model, Schema, Document } from "mongoose";
import { KYCData, KYCStatus } from "../types/kycData";

export interface KYCDataModel extends KYCData, Document { }

const kycDataSchema: Schema = new Schema({
    user_name: {
        type: String,
        required: true
    },
    uuid: {
        type: String,
        required: true
    },
    kycIDs: [{ type: String }],
    ethereumWallet: {
        type: String,
        required: true
    },
    status: {
        type: KYCStatus,
        required: true,
        default: KYCStatus.unprocessed
    },
    request_origin: {
        type: String,
        required: true
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

export const KYCDataSchema: Model<KYCDataModel> = model<KYCDataModel>("KYCData", kycDataSchema, "KYCData");