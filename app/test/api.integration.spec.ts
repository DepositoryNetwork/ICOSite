/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as _ from "lodash";
import "mocha";
import * as chai from "chai";
import { expect } from "chai";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { UserSchema } from "../src/schemas/user.schema";
import App from "../src/api/app";
import { WhitelistService } from "../src/services/whitelist.service";
import { UserManagementService } from "../src/services/ums.service";
import { KYCService } from "../src/services/kyc.service";
import { Server } from "../src/api/server";
import { KYCProvider4Stop } from "../src/services/kyc.4stop.service";
import { Logger } from "../src/services/logging.service";
import GmailNotificationService from "../src/services/gmailNotification.service";


(<any>mongoose).Promise = global.Promise;

dotenv.config({ path: ".env" });

// Let Chai make http requests
chai.use(require("chai-http"));

// Set the server
const whitelistService: WhitelistService = new WhitelistService();
const ums: UserManagementService = new UserManagementService();
const gns: GmailNotificationService = new GmailNotificationService();
const kyc: KYCService = new KYCService(new KYCProvider4Stop(), whitelistService, ums, gns);
const server: Server = new Server(ums, kyc);

// Start the API
server.start();


describe("API Test", () => {
    before(async () => {
        // Create one global DB connection that will then be implicitly used throughout the services
        console.log(`Connection string: ${process.env.MONGODB_TEST_CONNECTION_STRING}`);
        await mongoose.connect(process.env.MONGODB_TEST_CONNECTION_STRING, { useMongoClient: true });
    });

    after(async () => {
        // Close the DB connection
        console.log("Closing connection");
        await mongoose.connection.close();
        console.log("Mongoose connection closed!");
    });

    const deleteAllUsers = async () => {
        await UserSchema.remove({}).exec();
    };

    describe("/api/user", () => {
        before(async () => {
            deleteAllUsers();
        });

        after(async () => {
            deleteAllUsers();
        });

        describe("POST /api/user", () => {
            const creds_normal = {
                username: "randomuser1",
                password: "user1password",
                email: "user1@mail.ru"
            };

            const creds_invalid = {
                username: "short",
                password: "user1password",
                email: "thisiswrongemail@.ru"
            };

            it("should register user successfully", (done) => {
                (<any>chai).request(server.getApp())
                    .post("/api/user")
                    .send(creds_normal)
                    .end((err: any, res: any) => {
                        (<any>expect(res).to.have).status(201);
                        done();
                    });
            });

            it("should fail the user registration: short password", (done) => {
                (<any>chai).request(server.getApp())
                    .post("/api/user")
                    .send(creds_invalid)
                    .end((err: any, res: any) => {
                        (<any>expect(res).to.have).status(400);
                        done();
                    });
            });
        });

        describe("GET /api/user", () => {
            it("should return 404 Not Found", (done) => {
                (<any>chai).request(server.getApp())
                    .get("/api/user/1")
                    .end((err: any, res: any) => {
                        (<any>expect(res).to.have).status(401);
                        done();
                    });
            });
        });
    });
});