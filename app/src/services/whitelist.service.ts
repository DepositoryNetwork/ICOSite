/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { WhitelistBufferSchema, WhitelistBufferModel, WhitelistStatus } from "../schemas/whitelist.buffer.schema";
import { WhitelistPair } from "whitelist.pair";
import { Logger } from "../services/logging.service";
import * as dotenv from "dotenv";

const crowdsaleService = require("../../whitelistService/crowdsale-services");

dotenv.config({ path: ".env" });

interface WhitelistRequest {
    ethereumWalletList: string[];
    kycIdList: string[];
}

export class DuplicateEntryError extends Error {}

export class WhitelistService {
    public async addToWhitelist(whitelistPair: WhitelistPair): Promise<void> {
        await this.checkIfWhitelistEnrollmentIsDuplicate(whitelistPair);
        const newWhitelistRequest = new WhitelistBufferSchema(whitelistPair);

        try {
            await newWhitelistRequest.save();
        } catch (ex) {
            const errorMsg = `Failed to store whitelist request to database. ${ex}`;
            Logger.error(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }
    }

    /**
     * Goes through the WhitelistBuffer and picks up all unprocessed whitelist requests that haven't exceeded the
     * retry count threshold. Then tries to whitelist all those requests with the blockchain in a single batch.
     */
    public async flushWhitelistBuffer(): Promise<void> {
        Logger.debug("Flushing whitelist buffer");

        // Retrieve the unprocessed whitelist requests
        const whitelistBuffer: WhitelistBufferModel[] = await this.retrieveUnprocessedWhitelistRequests();

        if (!whitelistBuffer || 0 === whitelistBuffer.length) {
            // No records to process
            return;
        }

        // Mark the retrieved whitelist requests as "processing" so that another process/thread doesn't start processing them as well
        const whitelistRequestsToProcess: WhitelistBufferModel[] = await this.markWhitelistRequestsAsProcessing(whitelistBuffer);

        // Whitelist the retrieved requests
        await this.whitelistRequests(whitelistRequestsToProcess);

        // Remove the processed requests from the DB
        await this.removeProcessedWhitelistRequests(whitelistRequestsToProcess);
    }

    /**
     * Updates whitelist records in state "processing" older than 24 hours to state "unprocessed" and resets their retryCount to 0.
     */
    public async resetOldRecords(): Promise<void> {
        try {
            const yesterday: Date = new Date(Date.now() - process.env.WHITELIST_RESET_RECORD_THRESHOLD_MS);
            // Update all records that are sill in "processing" state and have not been updated for the past 24 hours
            await WhitelistBufferSchema.update(
                { status: WhitelistStatus.processing, updatedAt: { $lt: yesterday }},
                { $set: { status: WhitelistStatus.unprocessed, retryCount: 0 }},
                { multi: true });
            // Also reset the retry count to 0 on all records that are still in "unprocessed" state and have not been
            // updated for the past 24 hours
            await WhitelistBufferSchema.update(
                { status: WhitelistStatus.unprocessed,
                    retryCount: { $gte: process.env.WHITELIST_BUFFER_RETRY_COUNT },
                    updatedAt: { $lt: yesterday }},
                { $set: { status: WhitelistStatus.unprocessed, retryCount: 0 }},
                { multi: true });
        } catch (ex) {
            Logger.error(`Failed to reset old whitelist requests. ${ex}`);
        }
    }

    private async retrieveUnprocessedWhitelistRequests(): Promise<WhitelistBufferModel[]> {
        Logger.debug("Retrieving unprocessed whitelist requests");
        let result: WhitelistBufferModel[];

        try {
            // Retrieve the unprocessed whitelist requests that have not reached the retry count limit
            result = await WhitelistBufferSchema.find(
                { status: WhitelistStatus.unprocessed, retryCount: { $lt: process.env.WHITELIST_BUFFER_RETRY_COUNT } });
        } catch (ex) {
            const errorMsg = `Failed to retrieve buffered whitelist requests. ${ex}`;
            Logger.error(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }

        Logger.debug(`Retrieved ${result.length} unprocessed whitelist requests`);
        return result;
    }

    private formatWhitelistRequest(whitelistBuffer: WhitelistPair[]): WhitelistRequest {
        const result: WhitelistRequest = {
            ethereumWalletList: [],
            kycIdList: []
        };

        for (const whitelistPair of whitelistBuffer) {
            result.ethereumWalletList.push(whitelistPair.ethereumWallet);
            result.kycIdList.push(whitelistPair.kycId);
        }

        return result;
    }

    private async markWhitelistRequestsAsProcessing(whitelistRequestList: WhitelistBufferModel[]): Promise<WhitelistBufferModel[]> {
        Logger.debug("Marking whitelist requests as \"processing\"");
        const result: WhitelistBufferModel[] = [];

        for (const whitelistRequest of whitelistRequestList) {
            try {
                // Update the state using optimistic concurrency control
                const updater = await WhitelistBufferSchema.update(
                    { _id: whitelistRequest._id, updatedAt: whitelistRequest.updatedAt },
                    { $set: { status: WhitelistStatus.processing }});

                // We managed to update - meaning we have a lock on the object
                if (1 === updater.nModified) {
                    result.push(whitelistRequest);
                }
            } catch (ex) {
                Logger.error(`Failed to set whitelist request status to "processing". ${ex}`);
            }
        }

        Logger.debug(`Managed to mark ${result.length} whitelist requests as "processing" (out of ${whitelistRequestList.length} total)`);
        return result;
    }

    private async markWhitelistRequestsAsUnprocessed(whitelistRequestList: WhitelistBufferModel[]): Promise<void> {
        Logger.debug("Marking whitelist requests as \"unprocessed\"");
        for (const whitelistRequest of whitelistRequestList) {
            try {
                await WhitelistBufferSchema.findByIdAndUpdate(whitelistRequest._id,
                    { $set: { status: WhitelistStatus.unprocessed, retryCount: (whitelistRequest.retryCount + 1) }});
            } catch (ex) {
                Logger.error(`Failed to reset whitelist status to "unprocessed" for record "${whitelistRequest._id}". ` +
                    `${ex}`);
            }
        }
    }

    private async whitelistRequests(whitelistRequestList: WhitelistBufferModel[]): Promise<void> {
        Logger.info("Whitelisting new addresses with the crowdsale service");
        // Reshape the whitelist requests in a suitable format for the crowdsale service
        const whitelistRequest: WhitelistRequest = this.formatWhitelistRequest(whitelistRequestList);

        try {
            await this.whitelistMultipleAddresses(whitelistRequest.ethereumWalletList, whitelistRequest.kycIdList);
        } catch (ex) {
            const errorMsg = `Failed to whitelist the retrieved requests. ${ex}`;
            Logger.error(errorMsg);
            Logger.info("Reverting the status of the failed whitelist requests to \"unprocessed\".");
            // Revert the whitelist requests statuses to "unprocessed" so that we try to whitelist them again later on
            await this.markWhitelistRequestsAsUnprocessed(whitelistRequestList);
            return Promise.reject(new Error(errorMsg));
        }

        Logger.info(`Successfully whitelisted ${whitelistRequestList.length} new addresses.`);
    }

    private async removeProcessedWhitelistRequests(whitelistRequestList: WhitelistBufferModel[]): Promise<void> {
        Logger.debug("Removing successfully whitelisted requests from the DB");

        for (const whitelistRequest of whitelistRequestList) {
            try {
                await whitelistRequest.remove();
            } catch (ex) {
                Logger.error(`Failed to remove processed whitelist request. ${ex}`);
            }
        }

        Logger.info("Successfully removed the processed whitelist requests from DB");
    }

    private async checkIfWhitelistEnrollmentIsDuplicate(whitelistPair: WhitelistPair): Promise<void> {
        let duplicate: WhitelistBufferModel;

        try {
            duplicate = await WhitelistBufferSchema.findOne(whitelistPair);
        } catch (ex) {
            Logger.error("Failed to check for duplicate whitelist request");
        }

        if (duplicate) {
            throw new DuplicateEntryError("The specified ethereumWallet/kycId pair already exists");
        }
    }

    private async whitelistMultipleAddresses(ethereumWalletList: string[], kycIdList: string[]): Promise<void> {
        await crowdsaleService.whitelistMultipleAddresses(
            process.env.WHITELISTER_PRIVATE_KEY,
            ethereumWalletList,
            kycIdList);
    }
}