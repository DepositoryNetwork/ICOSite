/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { expect } from "chai";
import "mocha";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { UserSchema } from "../src/schemas/user.schema";
import { UserManagementService } from "../src/services/ums.service";
import { AssertionError } from "assert";
import { User } from "user";
import GmailNotificationService from "../src/services/gmailNotification.service";

(<any>mongoose).Promise = global.Promise;

dotenv.config({ path: ".env" });

describe("EmailNotificationService", () => {
    let ums: UserManagementService = undefined;
    const ems: GmailNotificationService = new GmailNotificationService();

    const user_good: User = {
        uuid: "1",
        username: "user1",
        password: "somepass",
        email: "asvav@xzbvzovbqrpdsj.com",
        isKYCApproved: true,
        isEmailVerified: false,
        token: "thisishowtokenlooksinurl"
    };

    const user_bad: User = {
        uuid: "1",
        username: "user1",
        password: "",
        email: "",
        isKYCApproved: true,
        isEmailVerified: false,
        token: ""
    };

    const cleanUpUsers = async () => {
        await UserSchema.remove({}).exec();
    };

    before(async () => {
        // Create one global DB connection that will then be implicitly used throughout the services
        console.log(`Connection string: ${process.env.MONGODB_TEST_CONNECTION_STRING}`);
        await mongoose.connect(process.env.MONGODB_TEST_CONNECTION_STRING, { useMongoClient: true });
        ums = new UserManagementService();
    });

    after(async () => {
        // Close the DB connection
        console.log("Closing connection");
        await mongoose.connection.close();
        console.log("Mongoose connection closed!");
    });

    describe("Welcome email", () => {
        it("should send email successfully", async () => {
            let returned: boolean = false;

            try {
                returned = await ems.sendEmailWelcome(user_good);
            } catch (err) {}

            expect(returned).to.be.equal(true);
        });
        it("should fail sending email", async () => {
            let error: any = undefined;

            try {
                await ems.sendEmailWelcome(user_bad);
            } catch (err) {
                error = err;
            }

            expect(error.constructor.name).to.be.equal("RangeError");
        });
    });
});