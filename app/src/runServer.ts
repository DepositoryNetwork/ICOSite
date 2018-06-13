/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import * as mongoose from "mongoose";
(<any>mongoose).Promise = global.Promise;
import { UserManagementService } from "./services/ums.service";
import { WhitelistService } from "./services/whitelist.service";
import { Server } from "./api/server";
import { KYCService } from "./services/kyc.service";
import { KYCProvider4Stop } from "./services/kyc.4stop.service";
import GmailNotificationService from "./services/gmailNotification.service";

const runServer = async () => {
    await mongoose.connect(process.env.MONGODB_CONNECTION_STRING, { useMongoClient: true }, (err) => {
        if (err) throw err;
        console.log("Mongoose connection established!");
    });

    const whitelistService: WhitelistService = new WhitelistService();
    const ums: UserManagementService = new UserManagementService();
    const gns: GmailNotificationService = new GmailNotificationService();
    const kyc: KYCService = new KYCService(new KYCProvider4Stop(), whitelistService, ums, gns);

    const server: Server = new Server(ums, kyc);
    // Start the API
    server.start();
};

runServer();

