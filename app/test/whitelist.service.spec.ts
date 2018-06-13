/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as _ from "lodash";
import { expect } from "chai";
import "mocha";
import * as sinon from "sinon";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { AssertionError } from "assert";
import { WhitelistService, DuplicateEntryError } from "../src/services/whitelist.service";
import { WhitelistPair } from "whitelist.pair";
import { WhitelistBufferSchema, WhitelistBufferModel, WhitelistStatus } from "../src/schemas/whitelist.buffer.schema";

(<any>mongoose).Promise = global.Promise;

dotenv.config({ path: ".env" });

describe("WhitelistService", () => {
    let wls: WhitelistService = undefined;
    const testData = require("./mock_data/whitelist.service.data.json");

    before(async () => {
        // Create one global DB connection that will then be implicitly used throughout the services
        console.log(`Connection string: ${process.env.MONGODB_TEST_CONNECTION_STRING}`);
        await mongoose.connect(process.env.MONGODB_TEST_CONNECTION_STRING, { useMongoClient: true });
        // Clean up the database
        await cleanWhitelistBufferCollection();
        wls = new WhitelistService();
    });

    after(async () => {
        // Close the DB connection
        console.log("Closing connection");
        await mongoose.connection.close();
        console.log("Mongoose connection closed!");
    });

    describe("addToWhitelist", () => {
        afterEach(async () => {
            await cleanWhitelistBufferCollection();
        });

        it("Expect to add the specified whitelist pairs in the DB", async () => {
            const whitelistPair: WhitelistPair = testData["whitelistPair"];

            await wls.addToWhitelist(whitelistPair);

            const items: WhitelistBufferModel[] = await WhitelistBufferSchema.find({});
            expect(items).to.not.be.undefined;
            expect(items.length).to.be.equal(1, "Different number of items present in the database");
            expect(items[0].ethereumWallet).to.be.equal(whitelistPair.ethereumWallet, "Wrong ethreum wallet stored");
            expect(items[0].kycId).to.be.equal(whitelistPair.kycId, "Wrong kyc id stored");
            expect(items[0].status).to.be.equal(WhitelistStatus.unprocessed, "Wrong status stored");
        });

        it("Expect error when trying to store invalid data", async () => {
            let error: any = undefined;
            const invalidWhitelistPair: WhitelistPair = { ethereumWallet: undefined as string, kycId: "" };

            try {
                await wls.addToWhitelist(invalidWhitelistPair);
            } catch (ex) {
                error = ex;
            }

            expect(error).to.not.be.undefined;
        });

        it("Expect to throw error when trying to add the same whitelist pair twice", async () => {
            const whitelistPair: WhitelistPair = testData["whitelistPair"];
            await wls.addToWhitelist(whitelistPair);
            let error: any = undefined;

            try {
                await wls.addToWhitelist(whitelistPair);
            } catch (ex) {
                error = ex;
            }

            expect(error).to.not.be.undefined;
            expect(error).to.be.instanceof(DuplicateEntryError);
        });
    });

    describe("resetOldRecords", () => {
        let clock: sinon.SinonFakeTimers = undefined;

        afterEach(async () => {
            resetDate();
            await cleanWhitelistBufferCollection();
        });

        it("Expect to reset the status and retry count of all old records", async () => {
            const whitelistRequests: WhitelistBufferModel[] = testData["whitelistBufferForRetry"];
            await initWhitelistBufferCollection(whitelistRequests);
            stubDate();

            await wls.resetOldRecords();

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.not.be.undefined;
            expect(updatedWhitelistRequests.length).to.be.equal(whitelistRequests.length, "Different number of total records");
            const unprocessedItems = _.filter(updatedWhitelistRequests, { status: WhitelistStatus.unprocessed });
            expect(unprocessedItems).to.not.be.undefined;
            expect(unprocessedItems.length).to.be.equal(whitelistRequests.length);
            const nonResetRetryCounters = _.filter(updatedWhitelistRequests, function (item) { return item.retryCount >= 10; });
            expect(nonResetRetryCounters).to.be.empty;
        });

        it("Expect not to change any records updated during the past 24 hours", async () => {
            let whitelistRequests: WhitelistBufferModel[] = testData["whitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);
            // Retrieve the items again, so that we have the _id populated and we can use it to match the records
            whitelistRequests = await WhitelistBufferSchema.find({});

            await wls.resetOldRecords();

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.not.be.undefined;
            expect(updatedWhitelistRequests.length).to.be.equal(whitelistRequests.length, "Different number of total records");

            for (const updatedItem of updatedWhitelistRequests) {
                const expectedItem: WhitelistBufferModel = _.find(whitelistRequests, { _id: updatedItem._id });
                expect(expectedItem).to.not.be.undefined;
                expect(updatedItem.status).to.be.equal(expectedItem.status, "Different status");
                expect(updatedItem.retryCount).to.be.equal(expectedItem.retryCount, "Different retry count");
            }
        });

        it("Expect not to change any records with status 'unprocessed'", async () => {
            const whitelistRequests: WhitelistBufferModel[] = testData["whitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);
            // Retrieve the unprocessed items again, so that we have the _id populated and we can use it to match the records
            const unprocessedWhitelistRequests = await WhitelistBufferSchema.find({ status: WhitelistStatus.unprocessed });
            stubDate();

            await wls.resetOldRecords();

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.not.be.undefined;
            expect(updatedWhitelistRequests.length).to.be.equal(whitelistRequests.length, "Different number of total records");

            for (const item of unprocessedWhitelistRequests) {
                const updatedItem: WhitelistBufferModel = _.find(updatedWhitelistRequests, { _id: item._id });
                expect(updatedItem).to.not.be.undefined;
                expect(updatedItem.status).to.be.equal(item.status, "Different status");
                expect(updatedItem.retryCount).to.be.equal(item.retryCount, "Different retry count");
            }
        });

        it("Expect no error when there are no whitelist request records in the DB", async () => {
            let error: Error = undefined;

            try {
                await wls.resetOldRecords();
            } catch (ex) {
                error = ex;
            }

            expect(error).to.be.undefined;
        });

        function stubDate() {
            const now = new Date();
            // Set the time to 25 hours ahead
            clock = sinon.useFakeTimers(now.getTime() + 25 * 60 * 60 * 1000);
        }

        function resetDate() {
            if (clock) {
                clock.restore();
            }
        }
    });

    describe("flushWhitelistBuffer", () => {
        let crowdsaleServiceStub: sinon.SinonStub = undefined;
        let whitelistedEthereumWalletList: string[] = undefined;
        let whitelistedKycIdList: string[] = undefined;

        const workingStub =
            (ethereumWalletList: string[], kycIdList: string[]) => {
                whitelistedEthereumWalletList = ethereumWalletList;
                whitelistedKycIdList = kycIdList;
            };

        const throwingStub = () => { throw new Error("Fail"); };

        afterEach(async () => {
            if (crowdsaleServiceStub) {
                crowdsaleServiceStub.restore();
            }

            await cleanWhitelistBufferCollection();
            whitelistedEthereumWalletList = undefined;
            whitelistedKycIdList = undefined;
        });

        it("Expect to flush all unprocessed requests", async () => {
            crowdsaleServiceStub = sinon.stub(wls, "whitelistMultipleAddresses" as any).callsFake(workingStub);
            const whitelistRequests: WhitelistBufferModel[] = testData["unprocessedWhitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);

            await wls.flushWhitelistBuffer();

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.be.empty;
        });

        it("Expect not to change any records in state 'processing'", async () => {
            crowdsaleServiceStub = sinon.stub(wls, "whitelistMultipleAddresses" as any).callsFake(workingStub);
            const whitelistRequests: WhitelistBufferModel[] = testData["whitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);
            // Retrieve the processing items again, so that we have the _id populated and we can use it to match the records
            const processingWhitelistRequests = await WhitelistBufferSchema.find({ status: WhitelistStatus.processing });

            await wls.flushWhitelistBuffer();

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.not.be.undefined;
            expect(updatedWhitelistRequests.length).to.be.equal(processingWhitelistRequests.length);

            for (const item of updatedWhitelistRequests) {
                const originalItem = _.find(processingWhitelistRequests, { _id: item._id });
                expect(originalItem).to.not.be.undefined;
                expect(item.status).to.be.equal(originalItem.status, "Different status");
                expect(item.retryCount).to.be.equal(originalItem.retryCount, "Different retry count");
            }
        });

        it("Expect to report an error when whitelisting fails", async () => {
            crowdsaleServiceStub = sinon.stub(wls, "whitelistMultipleAddresses" as any).callsFake(throwingStub);
            const whitelistRequests: WhitelistBufferModel[] = testData["whitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);
            let error: Error = undefined;

            try {
                await wls.flushWhitelistBuffer();
            } catch (ex) {
                error = ex;
            }

            expect(error).to.not.be.undefined;
        });

        it("Expect to preserve all records as unprocessed and increase their retry count on whitelist failure", async () => {
            crowdsaleServiceStub = sinon.stub(wls, "whitelistMultipleAddresses" as any).callsFake(throwingStub);
            let whitelistRequests: WhitelistBufferModel[] = testData["unprocessedWhitelistBuffer"];
            await initWhitelistBufferCollection(whitelistRequests);
            // Retrieve the items again, so that we have the _id populated and we can use it to match the records
            whitelistRequests = await WhitelistBufferSchema.find({});

            try {
                await wls.flushWhitelistBuffer();
            } catch (ex) {}

            const updatedWhitelistRequests = await WhitelistBufferSchema.find({});
            expect(updatedWhitelistRequests).to.not.be.undefined;
            expect(updatedWhitelistRequests.length).to.be.equal(whitelistRequests.length);

            for (const item of updatedWhitelistRequests) {
                const originalItem = _.find(whitelistRequests, { _id: item._id });
                expect(item.status).to.be.equal(WhitelistStatus.unprocessed);
                expect(item.retryCount).to.be.equal(originalItem.retryCount + 1);
            }
        });
    });

    async function cleanWhitelistBufferCollection() {
        await WhitelistBufferSchema.remove({});
        console.log("Removed all whitelist buffer documents from the collection");
    }

    async function initWhitelistBufferCollection(itemList: WhitelistBufferModel[]) {
        for (const item of itemList) {
            const whitelistRequest = new WhitelistBufferSchema(item);
            await whitelistRequest.save();
        }
        console.log("WhitelistBuffer collection initialized with test data");
    }
});