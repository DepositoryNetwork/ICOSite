/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import * as dotenv from "dotenv";
import * as nodemailer from "nodemailer";
import * as smtpTransport from "nodemailer-smtp-transport";
import * as jwt from "jsonwebtoken";
import { Utils } from "./utils";
import { Logger } from "./logging.service";
import { User } from "../types/user";

const EMAILS = require("../../../email_templates.json");

dotenv.config({ path: ".env" });


export default class GmailNotificationService {
    private transporter: any;
    private readonly senderEmail: string = process.env.EMAIL_SERVICE_LOGIN;
    private readonly senderPassword: string = process.env.EMAIL_SERVICE_PASSW;
    private isInitialized: Promise<void>;

    constructor() {
        Logger.info("EmailNotificationService: Creating SMTP transport");
        this.isInitialized = this.initTransporter();
    }


    /**
     * Initializes SMTP transporter for Gmail
     *
     * @returns {Mail} - Returns SMTP transporter
     */
    private async initTransporter() {
        // Initialize the SMTP transporter
        this.transporter = await nodemailer.createTransport(smtpTransport({
            service: "gmail",
            host: "smtp.gmail.com",
            auth: {
                user: this.senderEmail,
                pass: this.senderPassword
            }
        }));
        return Promise.resolve();
    }

    /**
     * Sends welcoming email
     *
     * @param {User} user - Gets user email, username, and whether the account
     *                      needs to be verified
     * @returns {Promise< boolean >} - Returns a flag if email is sent or not
     */
    public async sendEmailWelcome(user: User): Promise<boolean> {
        await this.isInitialized;

        Logger.info("Sending welcome email");
        // Validate the email string
        if (!user) {
            return Promise.reject(new RangeError("Invalid user type"));
        }
        if (Utils.isInvalidEmail(user.email)) {
            return Promise.reject(new RangeError("Invalid receiver email"));
        }

        // Prepare the mail options
        const to = user.email;
        const subject = "Thank you for the registration!";
        const html = user.isEmailVerified
            ? EMAILS["welcomeClassic"]
            : EMAILS["confirmationRequest"]["content"].replace(
                "{confirmationURL}", EMAILS["confirmationRequest"]["url"].replace(
                    "{token}", user.token)).replace("{host}", process.env.EMAIL_SERVICE_HOST);

        // Set the mail options
        const mailOptions = {
            from: this.senderEmail,
            to,
            subject,
            html
        };

        // Send email and return
        return this.transporter.sendMail(mailOptions)
            .then((info: any) => {
                Logger.info(`Response: ${JSON.stringify(info.response)}`);
                return true;
            })
            .catch((error: any) => {
                return Promise.reject(error);
            });
    }

    /**
     * Email notification when the KYC verification succeeds
     *
     * @param {User} user - Gets user email and username
     * @returns {Promise< boolean >} - Returns a flag if email is sent or not
     */
    public async sendEmailKYCSuccess(user: User): Promise<boolean> {
        Logger.info("Sending KYC Success email");
        // Validate the email string
        if (!user) {
            return Promise.reject(new RangeError("Invalid user type"));
        }
        if (Utils.isInvalidEmail(user.email)) {
            return Promise.reject(new RangeError("Invalid receiver email"));
        }

        const to = user.email;
        const subject = "Your Ethereum wallet has been whitelisted";
        const html = EMAILS["kycSuccess"];

        // Set the mail options
        const mailOptions = {
            from: this.senderEmail,
            to,
            subject,
            html
        };

        // Send email and return
        return this.transporter.sendMail(mailOptions)
            .then((info: any) => {
                Logger.info(`Response: ${JSON.stringify(info.response)}`);
                return true;
            })
            .catch((error: any) => {
                return Promise.reject(error);
            });
    }

    /**
     * Email notification when the KYC verification fails
     *
     * @param {User} user - Gets user email and username
     * @returns {Promise< boolean >} - Returns a flag if email is sent or not
     */
    public async sendEmailKYCFailure(user: User): Promise<boolean> {
        Logger.info("Sending KYC Failure email");
        // Validate the email string
        if (!user) {
            return Promise.reject(new RangeError("Invalid user type"));
        }
        if (Utils.isInvalidEmail(user.email)) {
            return Promise.reject(new RangeError("Invalid receiver email"));
        }

        const to = user.email;
        const subject = "Identity verification failed";
        const html = EMAILS["kycFailure"];

        // Set the mail options
        const mailOptions = {
            from: this.senderEmail,
            to,
            subject,
            html
        };

        // Send email and return
        return this.transporter.sendMail(mailOptions)
            .then((info: any) => {
                Logger.info(`Response: ${JSON.stringify(info.response)}`);
                return true;
            })
            .catch((error: any) => {
                return Promise.reject(error);
            });
    }
}
