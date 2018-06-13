/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

export enum KYCStatus {
    processing = "processing",
    processing_docs = "processing_docs",
    kyc_approved = "kyc_approved",
    kyc_rejected = "kyc_rejected",
    notifying_user = "notifying_user",
    processing_complete = "processing_complete",
    processing_failed = "processing_failed",
    unprocessed = "unprocessed"
}

export class KYCData {
    uuid: string;
    user_name: string;
    kycIDs: [string];
    ethereumWallet: string;
    status: KYCStatus;
    retryCount: number;
    updatedAt: Date;
    request_origin: string;
 }
