/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { model, Model, Schema, Document } from "mongoose";
import { KYCData4Stop, CustomerInformation4Stop } from "../types/kycData4Stop";

export interface KYCData4StopModel extends KYCData4Stop, Document { }

const idDocument4StopSchema = new Schema({
    type: {
        type: String,
        required: true
    },
    value: {
        type: String,
        required: true
    }
 });

 const customerInformation4StopSchema = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    address1: {
        type: String,
        required: true
    },
    address2: {
        type: String,
    },
    city: {
        type: String,
        required: true
    },
    province: {
        type: String,
    },
    country: {
        type: String,
        required: true
    },
    postal_code: {
        type: String,
        required: true
    },
    phone1: {
        type: String,
        required: true
    },
    phone2: {
        type: String
    },
    dob: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        required: true
    },
    id_values: [idDocument4StopSchema]
 });

 const kycDocVerificationData4StopSchema: Schema = new Schema({
    doc: {
        data: Buffer,
        contentType: String,
        filename: String
    },
    doc2: {
        data: Buffer,
        contentType: String,
        filename: String
    },
    doc3: {
        data: Buffer,
        contentType: String,
        filename: String
    },
    doc4: {
        data: Buffer,
        contentType: String,
        filename: String
    }
 });

const kycData4StopSchema: Schema = new Schema({
    id_dataKYC: {
        type: Schema.Types.ObjectId,
        required: true,
        unique: true
    },
    customer_information: {
        type: customerInformation4StopSchema,
        required: true
    },
    doc_images: kycDocVerificationData4StopSchema
},
{
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
});

export const KYCData4StopSchema: Model<KYCData4StopModel> = model<KYCData4StopModel>("KYCData4Stop", kycData4StopSchema, "KYCData4Stop");