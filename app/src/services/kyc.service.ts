/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import * as dotenv from "dotenv";
import { User } from "../types/user";
import { KYCData, KYCStatus } from "../types/kycData";
import { Logger } from "./logging.service";
import { Utils } from "./utils";
import { KYCDataModel, KYCDataSchema } from "../schemas/kycData.schema";
import { KYCProvider } from "./kycProvider";
import { WhitelistService } from "./whitelist.service";
import { request } from "http";
import { UserManagementService } from "./ums.service";
import GmailNotificationService from "./gmailNotification.service";
import * as uuid from "uuid";

dotenv.config({ path: ".env" });

export class ReferenceNotFoundError extends Error {}

export class KYCService {
    private readonly kycProvider: KYCProvider;
    private readonly whitelistService: WhitelistService;
    private readonly ums: UserManagementService;
    private readonly gns: GmailNotificationService;

    public constructor(kycProvider: KYCProvider, whitelistService: WhitelistService,
            ums: UserManagementService, gns: GmailNotificationService) {
        if (!kycProvider) {
            throw new RangeError("KYC Provider cannot be null!");
        }

        if (!whitelistService) {
            throw new RangeError("Whitelist Service cannot be null");
        }

        if (!ums) {
            throw new RangeError("UMS cannot be null");
        }
        if (!gns) {
            throw new RangeError("Gmail notification service cannot be null");
        }

        this.kycProvider = kycProvider;
        this.whitelistService = whitelistService;
        this.ums = ums;
        this.gns = gns;
    }


    /**
     * Handles the callback from the KYC provider wrt verified documents
     * @param  {string} reference_id - Reference id to match the KYC applicant
     * @param  {string} score - Score of the check
     * @param  {string} score_complete - Indication whether this is the final score
     * @returns Promise
     */
    public async docVerifiedCallBack(reference_id: string, score: string, score_complete: string): Promise<void> {
        if (Number(score_complete) !== 1) {
            // we are not interested in intermediate results
            Logger.info(`Intermediate result received for reference_id: ${reference_id} with score: ${score}`);
            return Promise.resolve();
        }

        try {
            const kycApplicant: KYCDataModel =
                await KYCDataSchema.findOne({
                    kycIDs: reference_id,
                    status: KYCStatus.processing_docs
                }).exec();

            if (!kycApplicant) {
                throw new ReferenceNotFoundError(`Reference ID ${reference_id} not found`);
            }

            const approved: boolean = this.kycProvider.isUserApprovedBasedOnScore(kycApplicant, Number(score));

            // move user to the appropriate status
            await KYCDataSchema.update(
                { _id: kycApplicant._id },
                {
                    $set: {
                        status: approved ? KYCStatus.kyc_approved : KYCStatus.kyc_rejected,
                        kycIDs: [reference_id]
                    }
                });

        } catch (err) {
            const msg = `Error while processing callback for reference ${reference_id} with `
            + `score ${score}, complete: ${score_complete}. Error: ${err}`;
            Logger.error(msg);
            return Promise.reject(err);
        }
    }

    /** Initiates the KYC process for a particular user.
     *
     *  NOTE: The KYC process is asynchronous, so this method really just does some bookkeeping
     *        and immediately returns
     *
     * @param  {User} user - The user for which the KYC should be initiated
     * @param  {string} ethereumWallet - The user's wallet that should be used if KYC is successful
     * @param  {string} request_origin - IP of the user initiating the KYC enrollment
     * @param  {any} kycProviderData - The KYC provider-specific user data
     * @returns Promise - a promise containing the DataKYC record for future reference
     */
    public async initiateKYCForUser(user: User, ethereumWallet: string, request_origin: string, kycProviderData: any): Promise<KYCData> {
        if (Utils.isInvalidInputString(ethereumWallet)) {
            return Promise.reject(new RangeError("Ethereum wallet is invalid or missing!"));
        }

        if (!user || Utils.isInvalidInputString(user.uuid)) {
            return Promise.reject(new RangeError("User is invalid or missing!"));
        }

        if (!user || Utils.isInvalidInputString(request_origin)) {
            return Promise.reject(new RangeError("Origin IP address is invalid or missing!"));
        }

        const err = this.kycProvider.validateKYCData(kycProviderData);
        if (err) {
            return Promise.reject(new RangeError(`Customer data is invalid! Error: ${err}`));
        }

        let result: Promise<KYCData> = undefined;
        let kycData: KYCData = undefined;
        let dataRecord: KYCDataModel = undefined;

        try {
            dataRecord = new KYCDataSchema({
                ethereumWallet: ethereumWallet,
                uuid: user.uuid,
                user_name: user.username,
                status: KYCStatus.unprocessed,
                request_origin: request_origin
            });

            // store all data in db (in case the server dies while posting)
            kycData = await dataRecord.save();
            await this.kycProvider.persistKYCData(user, dataRecord, kycProviderData);
            result = Promise.resolve(kycData);
        } catch (err) {
            Logger.error(`Error creating KYCData for user: ${user.username}}. Error details: ${err}`);

            // clean up trailing data
            if (dataRecord && dataRecord._id) {
                Logger.warn(`Removing KYCData for user: ${user.username}}. `);
                dataRecord.remove();
            }

            result = Promise.reject(err);
        }

        return result;
    }

    /**
     * Performs KYC API calls and updates status on KYCData in db
     */
    public async processKYCApplicants(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][unprocessed] KYC Job Starting`);

        let kycApplicantsToProcess: KYCDataModel[] = [];
        let processedApplicantsCnt: number = 0;

        try {
            // Retrieve the unprocessed whitelist requests
            const kycApplicants: KYCDataModel[] =
                await this.retrieveRequestsInStatus(KYCStatus.unprocessed, process.env.KYC_API_REQ_PER_SEC);

            // Mark the retrieved requests as "processing" so that another process/thread doesn't start processing them as well
            kycApplicantsToProcess = await this.markRequestsAs(kycApplicants, KYCStatus.processing);
            if (!kycApplicantsToProcess || kycApplicantsToProcess.length === 0) {
                return;
            }

            await this.kycProvider.processKYC(kycApplicantsToProcess,
                async (request, kycIDs, kycStatus) => {
                    if (!kycIDs || kycIDs.length < 2) {
                        throw RangeError(`There needs to be at least 2 kyc IDs - for Cust Registration and 1 document verification`);
                    }

                    await KYCDataSchema.update(
                        { _id: request._id },
                        { $set: { status: kycStatus, kycIDs: kycIDs }}).exec();
                });

            processedApplicantsCnt = kycApplicantsToProcess.length;
        } catch (err) {
            Logger.error(`>>> [JobId: ${jobId}][unprocessed] KYC Failed while processing `
                + ` ${kycApplicantsToProcess.length} records with error ${err}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][unprocessed] KYC Job Done, Processed: ${ processedApplicantsCnt } applications`);
        }
    }

    /**
     * Processes approved KYC calls
     */
    public async processApprovedKYCApplicants(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][kyc_approved] KYC Job Starting`);

        let kycApplicantsToProcess: KYCDataModel[] = [];
        let processedApplicantsCnt: number = 0;

        try {
            // Retrieve the approved KYC requests
            const kycApplicants: KYCDataModel[] = await this.retrieveRequestsInStatus(KYCStatus.kyc_approved);

            // Mark the retrieved requests as "notifying_user" so that another process/thread doesn't start processing them as well
            kycApplicantsToProcess = await this.markRequestsAs(kycApplicants, KYCStatus.notifying_user);
            if (!kycApplicantsToProcess || kycApplicantsToProcess.length === 0) {
                return;
            }

            const tasksQueue: Promise<void>[] = [];

            // Whitelist and notify users
            const miniFlow = async (kycApplicant: KYCDataModel) => {
                // 1 - whitelist (just writes in db)
                await this.whitelistService.addToWhitelist({
                    ethereumWallet: kycApplicant.ethereumWallet,
                    kycId: kycApplicant.kycIDs[0]
                });

                // 2 - update the user
                await this.ums.updateUserKYCStatus(kycApplicant.uuid, true);

                // 3 - send email to the approved user
                await this.notifyUserOnKYCStatus(kycApplicant.uuid, true);

                // 4 - update db status
                await this.markRequestAs(kycApplicant, KYCStatus.processing_complete);
            };

            // Update batch statuses for approved records
            for (const kycApplicant of kycApplicantsToProcess) {
                tasksQueue.push(miniFlow(kycApplicant));
            }

            // wait until all applicants processed completed
            await Promise.all(tasksQueue);
            processedApplicantsCnt = kycApplicantsToProcess.length;
        } catch (err) {
            Logger.error(`>>> [JobId: ${jobId}][kyc_approved] KYC Failed while processing `
                + `${kycApplicantsToProcess.length} entries with error ${err}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][kyc_approved] KYC Job Done, Processed: ${ processedApplicantsCnt } applications`);
        }
    }

    /**
     * Processes failed KYC calls
     */
    public async processFailedKYCApplicants(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][kyc_rejected, processing_failed] KYC Job Starting`);

        let kycApplicantsToProcess: KYCDataModel[] = [];
        let processedApplicantsCnt: number = 0;

        try {
            // Retrieve the failed KYC requests
            const rejectedApplicants: KYCDataModel[] = await this.retrieveRequestsInStatus(KYCStatus.kyc_rejected);
            const failedApplicants: KYCDataModel[] = await this.retrieveRequestsInStatus(KYCStatus.processing_failed);
            const allApplicants = rejectedApplicants.concat(failedApplicants);

            // Mark the retrieved requests as "notifying_user" so that another process/thread doesn't start processing them as well
            kycApplicantsToProcess = await this.markRequestsAs(allApplicants, KYCStatus.notifying_user);
            if (!kycApplicantsToProcess || kycApplicantsToProcess.length === 0) {
                return;
            }

            const tasksQueue: Promise<void>[] = [];

            // Notify users and update batch status
            const miniFlow = async (kycApplicant: KYCDataModel) => {
                // 1 - send email to the failed user
                await this.notifyUserOnKYCStatus(kycApplicant.uuid, false);

                // 2 - update db status
                await this.markRequestAs(kycApplicant, KYCStatus.processing_complete);
            };

            // Process the batch
            for (const kycApplicant of kycApplicantsToProcess) {
                tasksQueue.push(miniFlow(kycApplicant));
            }

            // Wait until all failed applicants are processed
            await Promise.all(tasksQueue);
            processedApplicantsCnt = kycApplicantsToProcess.length;
        } catch (err) {
            Logger.error(`>>> [JobId: ${jobId}][kyc_rejected, processing_failed] KYC Failed while `
                + `processing ${kycApplicantsToProcess.length} records with error ${err}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][kyc_rejected, processing_failed] KYC Job Done, `
                + `Processed: ${ processedApplicantsCnt } applications`);
        }
    }

    /**
     * Processes completed KYC calls
     */
    public async processCompletedApplicants(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][processing_complete] KYC Job Starting`);

        const kycApplicantsToProcess: KYCDataModel[] = [];
        let processedApplicantsCnt: number = 0;

        try {
            // Retrieve the completed KYC requests
            const completedApplicants: KYCDataModel[] = await this.retrieveRequestsInStatus(KYCStatus.processing_complete);
            if (!completedApplicants || completedApplicants.length === 0) {
                return;
            }

            const tasksQueue: Promise<void>[] = [];

            // Remove processed requests
            const miniFlow = async (kycApplicant: KYCDataModel) => {
                await this.removeProcessedRequest(kycApplicant);
            };

            // Process the batch
            for (const kycApplicant of completedApplicants) {
                tasksQueue.push(miniFlow(kycApplicant));
            }

            // Wait until all data is cleaned up
            await Promise.all(tasksQueue);
            processedApplicantsCnt = kycApplicantsToProcess.length;
        } catch (err) {
            Logger.error(`>>> [JobId: ${jobId}][processing_complete] KYC Failed while processing `
                + `${kycApplicantsToProcess.length} records  with error ${err}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][processing_complete] Completed KYC Job Done,`
                + ` Processed: ${ processedApplicantsCnt } applications`);
        }
    }

    /**
     * Rejects KYC applications that have failed too many times.
     */
    public async rejectFailedRecords(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][rejectFailedRecords] KYC Job Starting`);

        try {
            // Mark all stalled or failed records (retry_count > max_retry_count) as failed
            await KYCDataSchema.update(
                { retryCount: { $gte: process.env.KYC_RETRY_COUNT } },
                { $set: { status: KYCStatus.processing_failed }, $inc: {retryCount: 1} },
                { multi: true }).exec();

        } catch (ex) {
            Logger.error(`>>> [JobId: ${jobId}][rejectFailedRecords] Failed to reject failed KYC requests. ${ex}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][rejectFailedRecords] Completed KYC Job Done`);
        }
    }

    public async resetStalledInProcessingRecords(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][resetStalledInProcessingRecords] KYC Job Starting`);

        try {
            const yesterday: Date = new Date(Date.now() - process.env.KYC_RESET_RECORD_THRESHOLD_MS);
            // Mark all stalled or failed records (retry_count > max_retry_count) as failed
            await KYCDataSchema.update(
                { updatedAt: { $lt: yesterday }, status: KYCStatus.processing },
                { $set: { status: KYCStatus.unprocessed }, $inc: {retryCount: 1} },
                { multi: true }).exec();

        } catch (ex) {
            Logger.error(`[JobId: ${jobId}][resetStalledInProcessingRecords] Failed to reset `
                + `stalled KYC requests in status Processing. ${ex}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][resetStalledInProcessingRecords] Completed KYC Job Done`);
        }
    }

    public async resetStalledInProcessingDocsRecords(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][resetStalledInProcessingDocsRecords] KYC Job Starting`);

        try {
            const yesterday: Date = new Date(Date.now() - process.env.KYC_RESET_RECORD_THRESHOLD_MS);
            // Mark all stalled  as failed
            await KYCDataSchema.update(
                { updatedAt: { $lt: yesterday }, status: KYCStatus.processing_docs },
                { $set: { status: KYCStatus.unprocessed, kycIDs: [] }, $inc: {retryCount: 1} },
                { multi: true }).exec();

        } catch (ex) {
            Logger.error(`[JobId: ${jobId}][resetStalledInProcessingDocsRecords] Failed to reset `
                + `stalled KYC requests in status processing docs. ${ex}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][resetStalledInProcessingDocsRecords] Completed KYC Job Done`);
        }
    }

    public async resetStalledInNotifyingRecords(): Promise<void> {
        const jobId = uuid.v4();
        Logger.info(`>>> [JobId: ${jobId}][resetStalledInNotifyingRecords] KYC Job Starting`);

        try {
            const yesterday: Date = new Date(Date.now() - process.env.KYC_RESET_RECORD_THRESHOLD_MS);

            // revert stalled records in processing with kycId (i.e. approved) to kyc_approved
            await KYCDataSchema.update(
                {
                    updatedAt: { $lt: yesterday },
                    status: KYCStatus.notifying_user,
                    $where: "this.kycIDs.length > 0"
                    /*kycIDs: { $exists: true, $ne: [] }*/ },
                { $set: { status: KYCStatus.kyc_approved }, $inc: {retryCount: 1} },
                { multi: true });

            // revert stalled records in Processing without kycId (i.e. not approved) to kyc_rejected
            await KYCDataSchema.update(
                {
                    updatedAt: { $lt: yesterday },
                    status: KYCStatus.notifying_user,
                    $where: "this.kycIDs.length < 1" },
                { $set: { status: KYCStatus.kyc_rejected }, $inc: {retryCount: 1} },
                { multi: true }).exec();

        } catch (ex) {
            Logger.error(`>>> [JobId: ${jobId}][resetStalledInProcessingRecords] Failed to reset stalled `
                + `KYC requests. Error: ${ex}`);
        } finally {
            Logger.info(`>>> [JobId: ${jobId}][resetStalledInProcessingRecords] Completed KYC Job Done`);
        }
    }

    private async retrieveRequestsInStatus(kycStatus: KYCStatus, limitRecords?: number): Promise<KYCDataModel[]> {
        Logger.debug(`Retrieving ${kycStatus} KYC requests`);
        const minRetryCount = (kycStatus === KYCStatus.processing_failed) ? 999 : process.env.KYC_RETRY_COUNT;
        let result: KYCDataModel [];

        try {
            let query = KYCDataSchema.find({ status: kycStatus, retryCount: { $lt: minRetryCount } });
            if (limitRecords) {
                query = query.limit(Number(limitRecords));
            }
            // Retrieve the unprocessed KYC requests that have not reached the retry count limit
            result = await query.exec();
        } catch (ex) {
            const errorMsg = `Failed to retrieve KYC requests in status ${kycStatus}. Error: ${ex}`;
            Logger.error(errorMsg);
            return Promise.reject(new Error(errorMsg));
        }

        Logger.debug(`Retrieved ${result.length} unprocessed KYC requests`);
        return Promise.resolve(result);
    }

    private async markRequestsAs(requestList: KYCDataModel[], kycStatus: KYCStatus): Promise<KYCDataModel[]> {
        if (kycStatus === KYCStatus.unprocessed) {
            throw Error("This method should not be used for unprocessed status. Please use markRequestsAsUnprocessed()");
        }

        Logger.debug(`Marking KYC requests as ${kycStatus}`);
        const result: KYCDataModel[] = [];

        for (const kycRequest of requestList) {
            try {
                // Update the state using optimistic concurrency control
                const updater = await this.markRequestAs(kycRequest, kycStatus);

                // We managed to update - meaning we have a lock on the object
                if (1 === updater.nModified) {
                    result.push(await KYCDataSchema.findById(kycRequest._id).exec());
                }
            } catch (ex) {
                const errMsg = `Failed to set request status to ${kycStatus} for object id: ${kycRequest._id}.`
                                + `Error: ${ex}`;
                Logger.error(errMsg);
                return Promise.reject(new Error(errMsg));
            }
        }

        Logger.debug(`Managed to mark ${result.length} whitelist requests as \
            ${kycStatus} (out of ${requestList.length} total)`);
        return Promise.resolve(result);
    }

    private async markRequestAs(request: KYCDataModel, kycStatus: KYCStatus): Promise<any> {
        return await KYCDataSchema.update(
            { _id: request._id, updatedAt: request.updatedAt },
            { $set: { status: kycStatus }}).exec();
    }

    private async removeProcessedRequest(request: KYCDataModel): Promise<void> {
        Logger.debug("Removing successfully processed KYC request from the DB");

        try {
            await this.kycProvider.removeKYCData(request);
            await request.remove();
        } catch (ex) {
            const errMsg = `Failed to remove processed KYC request. ${ex}`;
            Logger.error(errMsg);
            return Promise.reject(new Error(errMsg));
        }

        Logger.info("Successfully removed the processed KYC requests from DB");
        return Promise.resolve();
    }

    private async notifyUserOnKYCStatus(uuid: string, approved: boolean): Promise<void> {
        Logger.debug(`Sending KYC approval email for user ${uuid}`);

        const user: User = await this.ums.getUserByUUID(uuid);
        Logger.info(`USER: ${user}`);

        try {
            if (approved) {
                await this.gns.sendEmailKYCSuccess(user);
            } else {
                await this.gns.sendEmailKYCFailure(user);
            }
        } catch (ex) {
            const errMsg = `Failed to send KYC approved email notification => ${ex}`;
            Logger.error(errMsg);
            return Promise.reject(new Error(errMsg));
        }

        return Promise.resolve();
    }
}