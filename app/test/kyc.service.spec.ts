/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as _ from "lodash";
import { expect } from "chai";
import "mocha";
import * as dotenv from "dotenv";
import * as sinon from "sinon";
import * as mongoose from "mongoose";
import { KYCStatus } from "../src/types/kycData";
import { Logger } from "../src/services/logging.service";
import { KYCDataModel, KYCDataSchema } from "../src/schemas/kycData.schema";
import { KYCProvider } from "../src/services/kycProvider";
import { KYCService } from "../src/services/kyc.service";
import { UserManagementService } from "../src/services/ums.service";
import { KYCProvider4Stop } from "../src/services/kyc.4stop.service";
import { WhitelistService } from "../src/services/whitelist.service";
import { prependOnceListener } from "cluster";
import { isUndefined } from "util";
import { NumberResults } from "aws-sdk/clients/clouddirectory";
import GmailNotificationService from "../src/services/gmailNotification.service";
import { UserSchema, UserModel } from "../src/schemas/user.schema";

(<any>mongoose).Promise = global.Promise;

dotenv.config({ path: ".env" });

describe("KYC Processing Service", () => {
    const ums: UserManagementService = new UserManagementService();
    const kycp: KYCProvider4Stop = new KYCProvider4Stop();
    const wls: WhitelistService = new WhitelistService();
    const gns: GmailNotificationService = new GmailNotificationService();
    const kycs: KYCService = new KYCService(kycp, wls, ums, gns);

    // Mock data
    const testData = require("./mock_data/kyc.service.data.json");

    // For purging the collection
    const cleanUpApplications = async () => {
        await KYCDataSchema.remove({}).exec();
    };

    // For inserting a single application into the collection
    const addApplication = async (application: KYCDataModel) => {
        // Logger.info(JSON.stringify(application));
        application.save({safe: false, validateBeforeSave: false});
    };

    const addUserApplication = async (application: KYCDataModel) => {
        const random_email = `${Math.random().toString(36).slice(-8)}@suiji.ru`;

        const existingKYCUser: UserModel = new UserSchema({
            uuid: application.uuid,
            username: application.user_name,
            email: random_email,
            password: "uxhf3881xAvc1", // random pass
            token: "helloitstoken123", // not necessary for testing
            isKYCApproved: false,
            isEmailVerified: true // does not matter as well
        });

        await existingKYCUser.save();
    };

    // For find by username
    const findByUsername = async (username: string): Promise<KYCDataModel> => {
        const applicant: KYCDataModel = await KYCDataSchema.findOne(
            {user_name : username}).exec();
        return applicant;
    };

    before(async () => {
        // Create one global DB connection for all tests
        console.log(`Connection string: ${process.env.MONGODB_TEST_CONNECTION_STRING}`);
        await mongoose.connect(process.env.MONGODB_TEST_CONNECTION_STRING,
            { useMongoClient: true });
    });

    after(async () => {
        // Close the DB connection
        console.log("Closing connection");
        await mongoose.connection.close();
        console.log("Mongoose connection closed!");
    });

    describe("KYC Forward Pass", async () => {
        // Sinon stub methods
        let kycServiceStub: sinon.SinonStub = undefined;

        // Stub always approves
        const performKYCApprove = async (kycApplicant: KYCDataModel) => {
            return {
                kycIDs: ["id1"],
                rejected: 0
            };
        };

        // Stub always rejects
        const performKYCReject = async (kycApplicant: KYCDataModel) => {
            return {
                kycIDs: ["id2"],
                rejected: 1
            };
        };

        // Get the dummy data
        const applicant_unprocessed: KYCDataModel =
            new KYCDataSchema(testData["user_unprocessed2processed"]);
        const applicant_processing_docs: KYCDataModel =
            new KYCDataSchema(testData["user_processing_docs2approved"]);
        const applicant_approved: KYCDataModel =
            new KYCDataSchema(testData["user_approved2processing_completed"]);
        const applicant_rejected: KYCDataModel =
            new KYCDataSchema(testData["user_rejected2processing_completed"]);
        const applicant_failed: KYCDataModel =
            new KYCDataSchema(testData["user_any2failed2completed"]);

        before(async () => {
            Logger.info(">> Adding dummy data for FORWARD PASS");

            // Set today's date
            applicant_unprocessed.updatedAt = await new Date();
            applicant_processing_docs.updatedAt = await new Date();
            applicant_approved.updatedAt = await new Date();
            applicant_rejected.updatedAt = await new Date();
            applicant_failed.updatedAt = await new Date();

            // Set 3-days-before-now date to processing applicant
            await applicant_failed.updatedAt.setDate(applicant_failed.updatedAt.getDate() - 3);

            // Set the retryCount field
            applicant_unprocessed.retryCount = await 0;
            applicant_processing_docs.retryCount = await 0;
            applicant_approved.retryCount = await 0;
            applicant_rejected.retryCount = await 0;
            applicant_failed.retryCount = await 10;

            // Add the mock KYC applications to the db
            await addApplication(applicant_unprocessed);
            await addApplication(applicant_processing_docs);
            await addApplication(applicant_approved);
            await addApplication(applicant_rejected);
            await addApplication(applicant_failed);

            // Add the mock user applications to the db
            await addUserApplication(applicant_unprocessed);
            await addUserApplication(applicant_processing_docs);
            await addUserApplication(applicant_approved);
            await addUserApplication(applicant_rejected);
            await addUserApplication(applicant_failed);
        });

        afterEach(async () => {
            if (kycServiceStub) {
                await kycServiceStub.restore();
            }
        });

        after(async () => {
            await cleanUpApplications();
        });

        it("should transmute UNPROCESSED >> PROCESSING state", async () => {
            await kycs.processKYCApplicants();

            const applicant: KYCDataModel =
                await findByUsername(applicant_unprocessed.user_name);

            expect(applicant.status).to.equal(KYCStatus.processing);
        });

        it("should transmute PROCESSING >> PROCESSING_DOCS state", async () => {
            kycServiceStub = sinon.stub(kycp, "performKYC" as any).callsFake(performKYCApprove);
        });

        it("should transmute PROCESSING_DOCS >> KYC_APPROVED state", async () => {
            const ref_id = await "kyc5"; // this is where I LOL'd
            await kycs.docVerifiedCallBack(ref_id,
                process.env.KYC_CONFIDENCE_THRESHOLD + 1,
                "1");

            const applicant: KYCDataModel =
                await findByUsername(applicant_processing_docs.user_name);

            expect(applicant.status).to.equal(KYCStatus.kyc_approved);
            expect(applicant.kycIDs).to.eql([ ref_id ]);
        });

        it("should transmute KYC_APPROVED >> PROCESSING_COMPLETE state", async () => {
            await kycs.processApprovedKYCApplicants();

            /* State transition: PROCESSING_DOCS --> KYC_APPROVED -->
                              --> NOTIFYING_USER --> PROCESSING_COMPLETE */
            const applicant_from_processing_docs: KYCDataModel =
                await findByUsername(applicant_processing_docs.user_name);

            // State transition: KYC_APPROVED --> NOTIFYING_USER --> PROCESSING_COMPLETE
            const applicant_from_kyc_approved: KYCDataModel =
                await findByUsername(applicant_approved.user_name);

            // Confirm status
            expect(applicant_from_processing_docs.status)
                .to.equal(KYCStatus.processing_complete);
            expect(applicant_from_kyc_approved.status)
                .to.equal(KYCStatus.processing_complete);

            // Make sure that retryCount is same as before
            expect(applicant_from_processing_docs.retryCount)
                .to.equal(applicant_processing_docs.retryCount);
            expect(applicant_from_kyc_approved.retryCount)
                .to.equal(applicant_approved.retryCount);
        });

        it("should transmute KYC_REJECTED >> PROCESSING_COMPLETE state", async () => {
            await kycs.processFailedKYCApplicants();

            const applicant: KYCDataModel =
                await findByUsername(applicant_rejected.user_name);

            expect(applicant.status).to.equal(KYCStatus.processing_complete);
            expect(applicant.retryCount).to.equal(applicant_rejected.retryCount);
        });

        it("should transmute PROCESSING >> PROCESSING_FAILED state", async () => {
            await kycs.rejectFailedRecords();

            const applicant: KYCDataModel =
                await findByUsername(applicant_failed.user_name);

            expect(applicant.status).to.equal(KYCStatus.processing_failed);
            expect(applicant.retryCount).to.equal(applicant_failed.retryCount + 1);
        });

        it("should transmute PROCESSING_FAILED >> PROCESSING_COMPLETE state", async () => {
            await kycs.processFailedKYCApplicants();

            const applicant: KYCDataModel =
                await findByUsername(applicant_failed.user_name);

            expect(applicant.status).to.equal(KYCStatus.processing_complete);
            expect(applicant.retryCount).to.equal(applicant_failed.retryCount + 1);
        });
    });

    describe("KYC Backward Pass", async () => {
        // Prep the dummy data
        const applicant_delayed_notifying_1: KYCDataModel =
            new KYCDataSchema(testData["user_notifying2rejected"]);
        const applicant_delayed_notifying_2: KYCDataModel =
            new KYCDataSchema(testData["user_notifying2approved"]);
        const applicant_delayed_processing: KYCDataModel =
            new KYCDataSchema(testData["user_processing2unprocessed"]);
        const applicant_delayed_processing_docs: KYCDataModel =
            new KYCDataSchema(testData["user_processing_docs2unprocessed"]);
        const applicant_delayed1: KYCDataModel =
            new KYCDataSchema(testData["user_delayed1"]);
        const applicant_delayed2: KYCDataModel =
            new KYCDataSchema(testData["user_delayed2"]);
        const applicant_notdelayed1: KYCDataModel =
            new KYCDataSchema(testData["user_notdelayed1"]);

        // Get the threshold for maximum number of trials
        const envRetryCount: number = Number(process.env.KYC_RETRY_COUNT);

        // Stubbing the date (hacking the time)
        let clock: sinon.SinonFakeTimers = undefined;

        function stubDate() {
            const now = new Date();
            // Set the time to 25 hours ahead
            clock = sinon.useFakeTimers(now.getTime() + 25 * 60 * 60 * 1000);
        }

        function resetDate() {
            // So we can restore our clock back to normal
            if (clock) {
                clock.restore();
            }
        }

        before(async () => {
            await Logger.info(">> Adding dummy data for BACKWARD PASS");

            // Set the date
            applicant_delayed_notifying_1.updatedAt = await new Date();
            applicant_delayed_notifying_2.updatedAt = await new Date();
            applicant_delayed_processing.updatedAt = await new Date();
            applicant_delayed_processing_docs.updatedAt = await new Date();

            // Set the retryCount field (corner case)
            applicant_delayed_notifying_1
                .retryCount = await <number>envRetryCount - 1;
            applicant_delayed_notifying_2
                .retryCount = await <number>envRetryCount - 1;
            applicant_delayed_processing
                .retryCount = await <number>envRetryCount - 1;
            applicant_delayed_processing_docs
                .retryCount = await <number>envRetryCount - 1;
        });

        afterEach(async () => {
            resetDate();
            await cleanUpApplications();
        });

        it("should transmute NOTIFYING >> { REJECTED, APPROVED }", async () => {
            // Add the dummy data
            await addApplication(applicant_delayed_notifying_1);
            await addApplication(applicant_delayed_notifying_2);

            // Stub the date: now we are in future
            stubDate();

            await kycs.resetStalledInNotifyingRecords();

            const applicant_rejected: KYCDataModel =
                await findByUsername(applicant_delayed_notifying_1.user_name);
            const applicant_approved: KYCDataModel =
                await findByUsername(applicant_delayed_notifying_2.user_name);

            // Check the KYC status
            expect(applicant_rejected.status).to.equal(KYCStatus.kyc_rejected);
            expect(applicant_approved.status).to.equal(KYCStatus.kyc_approved);

            // Check retryCount
            expect(applicant_rejected.retryCount)
                .to.equal(applicant_delayed_notifying_1.retryCount + 1);
            expect(applicant_approved.retryCount)
                .to.equal(applicant_delayed_notifying_2.retryCount + 1);
        });

        it("should transmute PROCESSING >> UNPROCESSED", async () => {
            await addApplication(applicant_delayed_processing);

            stubDate();

            await kycs.resetStalledInProcessingRecords();

            const applicant: KYCDataModel =
                await findByUsername(applicant_delayed_processing.user_name);

            expect(applicant.status).to.equal(KYCStatus.unprocessed);
            expect(applicant.retryCount)
                .to.equal(applicant_delayed_processing.retryCount + 1);
        });

        it("should transmute PROCESSING_DOCS >> UNPROCESSED", async () => {
            await addApplication(applicant_delayed_processing_docs);

            stubDate();

            await kycs.resetStalledInProcessingDocsRecords();

            const applicant: KYCDataModel =
                await findByUsername(applicant_delayed_processing_docs.user_name);

            expect(applicant.status).to.equal(KYCStatus.unprocessed);
            expect(applicant.retryCount)
                .to.equal(applicant_delayed_processing_docs.retryCount + 1);
            expect(applicant.kycIDs).to.be.empty;
        });

        it("should transmute { ANY } >> FAILED", async () => {
            await addApplication(applicant_delayed1);
            await addApplication(applicant_delayed2);
            await addApplication(applicant_notdelayed1);

            // stubDate();

            await kycs.rejectFailedRecords();

            const db_applicant_delayed1: KYCDataModel =
                await findByUsername(applicant_delayed1.user_name);
            const db_applicant_delayed2: KYCDataModel =
                await findByUsername(applicant_delayed2.user_name);
            const db_applicant_notdelayed1: KYCDataModel =
                await findByUsername(applicant_notdelayed1.user_name);

            await Logger.info(`SKKKRT: ${db_applicant_delayed2}`);

            // Check the status
            expect(db_applicant_delayed1.status)
                .to.equal(KYCStatus.processing_failed);
            expect(db_applicant_delayed2.status)
                .to.equal(KYCStatus.processing_failed);
            expect(db_applicant_notdelayed1.status)
                .to.equal(KYCStatus.processing_docs);

            // Check the retryCounts
            expect(db_applicant_delayed1.retryCount)
                .to.equal(applicant_delayed1.retryCount + 1);
            expect(db_applicant_delayed2.retryCount)
                .to.equal(applicant_delayed2.retryCount + 1);
            expect(db_applicant_notdelayed1.retryCount + 1)
                .to.equal(applicant_notdelayed1.retryCount + 1);
        });
    });
});