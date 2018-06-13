/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as mongoose from "mongoose";
(<any>mongoose).Promise = global.Promise;
import { WhitelistService } from "./services/whitelist.service";
import { Logger } from "./services/logging.service";
import * as cron from "node-cron";
import { KYCService } from "./services/kyc.service";
import { KYCProvider4Stop } from "./services/kyc.4stop.service";
import { UserManagementService } from "./services/ums.service";
import { User } from "user";
import GmailNotificationService from "./services/gmailNotification.service";

const runBatchServer = async () => {
    await mongoose.connect(process.env.MONGODB_CONNECTION_STRING, { useMongoClient: true }, (err) => {
        if (err) throw err;
        console.log("Mongoose connection established!");
    });

    const whitelistService: WhitelistService = new WhitelistService();
    const ums: UserManagementService = new UserManagementService();
    const gns: GmailNotificationService = new GmailNotificationService();
    const kyc: KYCService = new KYCService(new KYCProvider4Stop(), whitelistService, ums, gns);

    // >>> Register WhiteList jobs

    // Flush the whitelist buffer every 5 mins and reset the old records every day at 0:00:00
    cron.schedule(process.env.FLUSH_WHITELIST_BUFFER_INTERVAL, () => { whitelistService.flushWhitelistBuffer(); });
    cron.schedule(process.env.RESET_OLD_WHITELIST_RECORDS_INTERVAL, () => { whitelistService.resetOldRecords(); });

    // >>> Register KYC jobs

    // KYC Applicants should be processed considering the API rate limit - in this case once every 2 secs
    cron.schedule(process.env.KYC_PROCESS_APPLICANTS_INTERVAL, () => { kyc.processKYCApplicants(); });

    // all result-related jobs are processed once per minute
    cron.schedule(process.env.KYC_PROCESS_RESULTS_INTERVAL, () => { kyc.processApprovedKYCApplicants(); });
    cron.schedule(process.env.KYC_PROCESS_RESULTS_INTERVAL, () => { kyc.processFailedKYCApplicants(); });
    cron.schedule(process.env.KYC_PROCESS_RESULTS_INTERVAL, () => { kyc.processCompletedApplicants(); });

    // stale data (due to failed server or other bugs) is processed a few times a day
    cron.schedule(process.env.KYC_RESET_STALLED_RECORDS_INTERVAL, () => { kyc.resetStalledInProcessingRecords(); });
    cron.schedule(process.env.KYC_RESET_STALLED_RECORDS_INTERVAL, () => { kyc.resetStalledInNotifyingRecords(); });
    cron.schedule(process.env.KYC_RESET_STALLED_RECORDS_INTERVAL, () => { kyc.resetStalledInProcessingDocsRecords(); });

    // failed records are rejected every hour
    cron.schedule(process.env.KYC_RESET_FAILED_RECORDS_INTERVAL, () => { kyc.rejectFailedRecords(); });
};

runBatchServer();

