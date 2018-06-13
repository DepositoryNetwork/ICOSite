/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as _ from "lodash";
import { expect } from "chai";
import "mocha";
import * as sinon from "sinon";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { UserSchema } from "../src/schemas/user.schema";
import { UserManagementService } from "../src/services/ums.service";
import { AssertionError } from "assert";
import { User } from "user";

(<any>mongoose).Promise = global.Promise;

dotenv.config({ path: ".env" });

describe("UserManagementService", () => {
    let ums: UserManagementService = undefined;
    const user1 = {
        username: "user1",
        password: "somepass",
        email: "email@somewhere.com"
    };

    const user2 = {
        username: "user2",
        password: "somepass",
        email: "email2@somewhere.com"
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

    describe("getUser", () => {
        before(async () => {
            for (const val of [user1, user2]) {
                console.log(`Creating user: ${JSON.stringify(val)}`);
                await ums.registerUser(val.username, val.email, val.password, "socialMedia");
            }
        });

        after(async () => {
            cleanUpUsers();
        });

        it("Expect error when no param passed", async () => {
            let error: any = undefined;

            try {
                await ums.getUser(undefined);
            } catch (err) {
                error = err;
            }

            expect(error).to.not.be.undefined;
            expect(error.constructor.name).to.equal("RangeError");
        });

        it("Expect no user when searching by missing username", async () => {
            const dbRecord = await ums.getUser("missinguser");
            expect(dbRecord).to.be.null;
        });

        it("Expect a valid user when searching by an existing username", async () => {
            const dbRecord = await ums.getUser(user1.username);
            expect(dbRecord).to.not.be.undefined;
            expect(dbRecord).to.not.be.null;
            expect(dbRecord.username).to.equal(user1.username);
            expect(dbRecord.email).to.equal(user1.email);
        });
    });

    describe("registerUser", () => {
        afterEach(async () => {
            cleanUpUsers();
        });

        const testParameterErrorFunc = async (params: string[]) => {
            let error: any = undefined;
            try {
                await ums.registerUser(...params);
            } catch (err) {
                error = err;
            }
            return Promise.resolve(error.constructor.name);
        };

        it("Expect error when username is invalid", async () => {
            expect(await testParameterErrorFunc([undefined, "", ""])).to.equal("RangeError", "Handling undefined");
            expect(await testParameterErrorFunc(["", "", ""])).to.equal("RangeError", "Handling empty string");
            expect(await testParameterErrorFunc(["     ", "", ""])).to.equal("RangeError", "Handling whitespaces");
        });

        it("Expect error when email is invalid", async () => {
            expect(await testParameterErrorFunc(["usr", undefined, ""])).to.equal("RangeError", "Handling undefined");
            expect(await testParameterErrorFunc(["usr", "", ""])).to.equal("RangeError", "Handling empty string");
            expect(await testParameterErrorFunc(["usr", "     ", ""])).to.equal("RangeError", "Handling whitespaces");
        });

        it("Expect error when pass is invalid", async () => {
            expect(await testParameterErrorFunc(["usr", "email@somewhere.com", undefined])).to.equal("RangeError", "Handling undefined");
            expect(await testParameterErrorFunc(["usr", "email@somewhere.com", ""])).to.equal("RangeError", "Handling empty string");
            expect(await testParameterErrorFunc(["usr", "email@somewhere.com",  "     "])).to.equal("RangeError", "Handling whitespaces");
        });

        it("Expect error if user already exists", async () => {
            await ums.registerUser("user1", "email@somewhere.com", "somepass", "socialMedia");
            let error: any = undefined;

            try {
                await ums.registerUser("user1", "otheremail@somewhere.com", "someotherpass", "socialMedia");
            } catch (err) {
                error = err;
            }

            expect(error.constructor.name).to.equal("UserExistsError");
        });

        it("Expect local registration to work properly", async () => {
            const usr = await ums.registerUser(user1.username, user1.email, user1.password, "");

            expect(usr).to.be.not.null;
            expect(usr).to.have.property("createdAt");
            expect(usr).to.have.property("updatedAt");
            expect(usr.uuid).to.be.not.null;
            expect(usr.isKYCApproved).to.be.false;
            expect(usr.isEmailVerified).to.be.false;

            expect(usr.username).to.be.equal(user1.username, "username different");
            expect(usr.email).to.be.equal(user1.email, "email different");

            // @ts-ignore
            expect(await usr.comparePassword(user1.password)).to.be.true;
        });

        it("Expect happy path to work", async () => {
            const usr = await ums.registerUser(user1.username, user1.email, user1.password, "socialMedia");

            expect(usr).to.be.not.null;
            expect(usr).to.have.property("createdAt");
            expect(usr).to.have.property("updatedAt");
            expect(usr.uuid).to.be.not.null;
            expect(usr.isKYCApproved).to.be.false;
            expect(usr.isEmailVerified).to.be.true;

            expect(usr.username).to.be.equal(user1.username, "username different");
            expect(usr.email).to.be.equal(user1.email, "email different");

            // @ts-ignore
            expect(await usr.comparePassword(user1.password)).to.be.true;
        });
    });

    describe("removeUser", () => {
        afterEach(async () => {
            cleanUpUsers();
        });

        it("Expect error when using invalid username", async () => {
            const testParameterErrorFunc = async (value: any) => {
                let error: any = undefined;
                try {
                    await ums.removeUser(value);
                } catch (err) {
                    error = err;
                }
                return Promise.resolve(error.constructor.name);
            };

            expect(await testParameterErrorFunc(undefined)).to.equal("RangeError", "Handling undefined");
            expect(await testParameterErrorFunc("")).to.equal("RangeError", "Handling empty string");
            expect(await testParameterErrorFunc("     ")).to.equal("RangeError", "Handling whitespaces");
        });

        it("Expect error if user doesn't exists", async () => {
            let error: any = undefined;

            try {
                await ums.removeUser("nonexistentusername");
            } catch (err) {
                error = err;
            }

            expect(error.constructor.name).to.equal("UserExistsError");
        });

        it("Expect happy path to work", async () => {
            await ums.registerUser(user1.username, user1.email, user1.password, "socialMedia");

            // create a user & check if there
            let usr = await ums.getUser(user1.username);
            expect(usr).to.be.not.null;

            // remove user
            await ums.removeUser(user1.username);

            // assert
            usr = await ums.getUser(user1.username);
            expect(usr).to.be.null;
        });
    });
});