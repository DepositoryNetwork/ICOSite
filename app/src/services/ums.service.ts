/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import * as assert from "assert";
import * as dotenv from "dotenv";
import { User } from "../types/user";
import { UserSchema, UserModel } from "../schemas/user.schema";
import * as uuid from "uuid";
import { Logger } from "./logging.service";
import { Utils } from "./utils";
import GmailNotificationService from "./gmailNotification.service";
import * as jwt from "jsonwebtoken";

dotenv.config({ path: ".env" });

export class UserExistsError extends Error {}

export class UserManagementService {
    /**
     * Initializate Gmail notification service
     */
    private readonly ems: GmailNotificationService = new GmailNotificationService();

    /** Creates a user in the system
     * @param  {String} username - User's name
     * @param  {String} email - User's email address
     * @param  {String} password - User's password
     * @returns Promise - Returns a promise for a User object
     */
    public async registerUser(...args: string[]): Promise<User>;
    public async registerUser(username: String, email: String, password: String, registerType: String): Promise<User> {
        if (Utils.isInvalidInputString(username)) {
            return Promise.reject(new RangeError("User name cannot be null"));
        }
        if (Utils.isInvalidInputString(email)) {
            return Promise.reject(new RangeError("User email cannot be null"));
        }
        if (Utils.isInvalidInputString(password)) {
            return Promise.reject(new RangeError("User password cannot be null"));
        }
        if (Utils.isInvalidEmail(email)) {
            return Promise.reject(new RangeError("Invalid user email format"));
        }
        if (Utils.isInvalidPassword(password) || username === password) {
            return Promise.reject(new RangeError("Invalid user password"));
        }

        let result: Promise<User> = undefined;

        try {
            const user: User = await UserSchema.findOne({ username: { $in: username } }).exec();
            if (user) {
                const errMsg = `Username ${username} already exists`;
                Logger.warn(errMsg);
                result = Promise.reject(new UserExistsError(errMsg));
            } else {
                const newUser: UserModel = new UserSchema({
                    uuid: uuid.v4(),
                    username: username,
                    email: email,
                    password: password,
                    token: jwt.sign({email: email, uuid: uuid}, process.env.JWT_EMAIL_CONFIG),
                    isKYCApproved: false,
                    isEmailVerified: (registerType === "socialMedia") ? true : false
                });

                const userSaved = await newUser.save();
                await this.ems.sendEmailWelcome(userSaved);
                result = Promise.resolve(userSaved);
            }
        } catch (error) {
            Logger.error(`Error creating user: ${username}}. Error details: ${error}`);
            result = Promise.reject(error);
        }

        return result;
    }

    /**
     * Removes a user from the system
     * @param  {string} username - Username for the user being deleted
     * @returns Promise - Returns a promise for a User object
     */
    public async removeUser(username: string): Promise<User> {
        if (Utils.isInvalidInputString(username)) {
            return Promise.reject(new RangeError("User name cannot be null"));
        }

        let result: Promise<User> = undefined;

        try {
            const user: UserModel = await UserSchema.findOne({ username: { $in: username } }).exec();
            if (user) {
                result = user.remove();
            } else {
                result = Promise.reject(new UserExistsError(`User ${username} not found`));
            }

        } catch (error) {
            const errorMsg = `User ${username} could not be removed. Error details: ${error}`;
            Logger.error(errorMsg);
            result = Promise.reject(new Error(errorMsg));
        }

        return result;
    }

    /**
     * Verifying user given the token parameter from the url
     *
     * @param {token} - token taken from the url
     * @returns {Promise< number >} - count of documents changed
     */
    public async verifyUser(token: string): Promise<User> {
        Logger.info("User email verification called");
        if (Utils.isInvalidInputString(token)) {
            return Promise.reject(new RangeError("User token cannot be null"));
        }

        const user: User = await this.getUserByToken(token);


        if (!user) {
            return Promise.reject(new UserExistsError("User with token not found"));
        }
        if (user.isEmailVerified) {
            return Promise.reject(new UserExistsError("User email was already verified"));
        }

        // Verify the email
        let isValid: boolean = undefined;

        try {
            const payload: any = await jwt.verify(token, process.env.JWT_EMAIL_CONFIG);
            // If email in token is the same
            if (payload.email === user.email) {
                isValid = true;
            } else {
                isValid = false;
            }
        } catch (jwtError) {
            throw jwtError;
        }

        if (isValid) {
            try {
                const updatedUser: User = await UserSchema.findOneAndUpdate(
                    { email: user.email },
                    { $set: { isEmailVerified : true }},
                    { new: true }).exec();

                return updatedUser;
            } catch (errUpdate) {
                throw errUpdate;
            }
        } else {
            return Promise.reject(new RangeError("User token is invalid"));
        }
    }

    /**
     * Retrieves a user by token
     * @param  {string} token - User token to find the user by
     * @returns Promise - Returns a promise for a user object
     */
    public async getUserByToken(token: string): Promise<User> {
        return this.getUserByFilter("token", token);
    }

    /**
     * Retrieves a user
     * @param  {string} username - User name to find the user by
     * @returns Promise - Returns a promise for a user object
     */
    public async getUser(username: string): Promise<User> {
        return this.getUserByFilter("username", username);
    }

    /**
     * Retrieves a user
     * @param  {string} uuid - UUID to find the user by
     * @returns Promise - Returns a promise for a user object
     */
    public async getUserByUUID(uuid: string): Promise<User> {
        return this.getUserByFilter("uuid", uuid);
    }

    /**
     * Retrieves a user based on a property search filter
     * @param filterProperty The property by which to search
     * @param filterValue The desired value of the property
     * @returns Promise - Returns a promise for a user object
     */
    private async getUserByFilter(filterProperty: string, filterValue: string): Promise<User> {
        if (Utils.isInvalidInputString(filterProperty)) {
            return Promise.reject(new RangeError("Filter name cannot be null"));
        }
        if (Utils.isInvalidInputString(filterValue)) {
            return Promise.reject(new RangeError(`${filterProperty} cannot be null`));
        }

        let result: Promise<User> = undefined;

        try {
            const filter: any = {};
            filter[filterProperty] = { $in: [filterValue] };
            result = UserSchema.findOne(filter).exec();
        } catch (error) {
            const errorMsg = `Cannot obtain user ${filterValue}. Error: ${error}`;
            Logger.error(errorMsg);
            result = Promise.reject(new Error(errorMsg));
        }

        return result;
    }
    /**
     * Updates the KYC status for a particular user
     * @param  {string} uuid - User's id
     * @param  {boolean} kycStatus - The KYC status to be updated
     * @returns Promise
     */
    public async updateUserKYCStatus(uuid: string, kycStatus: boolean): Promise<void> {
        let res: any = undefined;

        try {
            res =  UserSchema.findOneAndUpdate(
                { uuid: { $in: uuid } },
                { $set: { isKYCApproved: kycStatus } } ).exec();
        } catch (error) {
            const errorMsg = `Could not update KYC status for user ${uuid}. Error: ${error}`;
            Logger.error(errorMsg);
            res = Promise.reject(new Error(errorMsg));
        }

        return res;
    }
}