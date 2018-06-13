/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { Request, Response, NextFunction } from "express";
import { Auth } from "../auth";
import { UserManagementService, UserExistsError } from "../../services/ums.service";
import { Logger } from "../../services/logging.service";
import { User } from "../../types/user";
import { Router } from "express";
import * as passport from "passport";
import { KYCService, ReferenceNotFoundError } from "../../services/kyc.service";

export default class UserController {
    private readonly ums: UserManagementService;
    private readonly kycService: KYCService;
    private router: Router;

    constructor(ums: UserManagementService, kycService: KYCService) {
        if (!ums) {
            throw new Error("Parameter ums cannot be null");
        }

        if (!kycService) {
            throw new Error("Parameter kycService cannot be null");
        }

        this.ums = ums;
        this.kycService = kycService;

        this.initRoutes();
    }

    private initRoutes(): void {
        this.router = Router();
        this.router.post("/", (req: any, res: any, next: any) => { this.register(req, res, next); } );
        this.router.get("/verify-email",
                        (req: any, res: any, next: any) => { this.verifyEmail(req, res, next); });
        this.router.get("/:uuid",
                        passport.authenticate("jwt", { session: false }),
                        (req: any, res: any, next: any) => { this.getUserByUUID(req, res, next); });

        this.router.post("/:uuid/kyc",
                        passport.authenticate("jwt", { session: false }),
                        (req: any, res: any, next: any) => { this.enrollUserForKYC(req, res, next); });
        this.router.post("/kyc/callback",
                        (req: any, res: any, next: any) => { this.kycDocVerificationCallBack(req, res, next); });
    }

    public getRouter(): Router {
        return this.router;
    }

    /**
     * @swagger
     * /user:
     *  post:
     *      description: Register a new user
     *      security: []
     *      tags:
     *          - User
     *      produces:
     *          - application/json
     *      parameters:
     *          - name: username
     *            description: The desired username for the new user
     *            in: formData
     *            required: true
     *            type: string
     *          - name: password
     *            description: The password used for authenticating the user
     *            in: formData
     *            required: true
     *            type: string
     *          - name: email
     *            description: The user's email address
     *            in: formData
     *            required: true
     *            type: string
     *      responses:
     *          200:
     *              description: Newly registered user
     *              schema:
     *                  $ref: '#/definitions/User'
     *          302:
     *              description: Username already exists
     *          400:
     *              description: Missing required parameter
     *          500:
     *              description: Failed to register user due to internal server error
     */
    public async register(req: Request, res: Response, next: NextFunction) {
        Logger.info("Register called");
        let user: User = undefined;

        try {
            user = await this.ums.registerUser(req.body.username, req.body.email, req.body.password, "");
            Logger.info("Registered new user");
            res.status(201).send(`Thank you for joining us!`);
        } catch (e) {
            let returnCode: number = 500;
            if (e instanceof RangeError) {
                returnCode = 400;
            } else if (e instanceof UserExistsError) {
                returnCode = 302;
            }

            res.status(returnCode).send(e.message);
        }
    }

    /**
     * @swagger
     * /user/verify-email:
     *  get:
     *      description: Verify user's email
     *      security: []
     *      tags:
     *          - User
     *      produces:
     *          - application/json
     *      parameters:
     *          - name: token
     *            description: The user's jwt token
     *            in: formData
     *            required: true
     *            type: string
     *      responses:
     *          200:
     *              description: Email verified
     *              schema:
     *                  $ref: '#/definitions/User'
     *          302:
     *              description: Email was already verified
     *          400:
     *              description: Missing required parameter
     *          500:
     *              description: Failed to verify user due to internal server error
     */
    public async verifyEmail(req: Request, res: Response, next: NextFunction) {
        Logger.info("User email called");
        let user: User = undefined;

        try {
            Logger.info(`TOKEN = ${req.query.token}`);
            user = await this.ums.verifyUser(req.query.token);
            Logger.info("User email verified");
            res.status(200).send(user);
        } catch (e) {
            let returnCode: number = 500;
            if (e instanceof RangeError) {
                returnCode = 400;
            } else if (e instanceof UserExistsError) {
                returnCode = 302;
            }

            res.status(returnCode).send(e.message);
        }
    }

    /**
     * @swagger
     * /user/{uuid}:
     *  get:
     *      description: Get a user by uuid
     *      security:
     *          - ApiKeyAuth: []
     *      tags:
     *          - User
     *      produces:
     *          - application/json
     *      parameters:
     *          - uuid: uuid
     *            description: The uuid for the user being retrieved
     *            in: formData
     *            required: true
     *            type: string
     *      responses:
     *          200:
     *              description: Newly registered user
     *              schema:
     *                  $ref: '#/definitions/User'
     *          400:
     *              description: Missing required parameter
     *          403:
     *              description: Specified user different than authenticated user
     *          404:
     *              description: Specified user is missing
     *          500:
     *              description: Failed to retrieve the user due to internal server error
     */
    public async getUserByUUID(req: Request, res: Response, next: NextFunction) {
        Logger.info("Get the user object by UUID called");
        let user: User = undefined;

        if (req.params.uuid !== req.user.uuid) {
            Logger.warn(`User ${req.user.uuid} tried to obtain the data for user ${req.params.uuid}`);
            res.status(403).send(`No permission to obtain user ${req.params.uuid}`);
            return;
        }

        try {
            user = await this.ums.getUserByUUID(req.params.uuid);

            if (user) {
                res.status(200).send(user);
            } else {
                res.status(404).send(JSON.stringify(new Error(`User ${req.params.uuid} does not exist`)));
            }
        } catch (e) {
            let returnCode: number = 500;
            if (e instanceof RangeError) {
                returnCode = 400;
            }

            res.status(returnCode).send(e.message);
        }
    }

    /**
     * /user:
     *  delete:
     *      description: Unregister and removes all stored information for the currently logged user
     *      security:
     *          - ApiKeyAuth: []
     *      tags:
     *          - User
     *      produces:
     *          - application/json
     *      responses:
     *          200:
     *              description: The removed user information
     *              schema:
     *                  $ref: '#/definitions/User'
     *          302:
     *              description: User doesn't exist in the system
     *          401:
     *              description: Invalid authentication token
     *          500:
     *              description: Failed to remove user due to internal server error
     */
    public async removeUser(req: Request, res: Response, next: NextFunction) {
        Logger.info("Remove user called");

        try {
            const user = await this.ums.removeUser((<User>req.user).username);
            res.status(200).send(user);
            Logger.info(`User ${user.username} removed`);
        } catch (e) {
            let returnCode: number = 500;
            if (e instanceof UserExistsError) {
                returnCode = 302;
            }

            res.status(returnCode).send(e.message);
        }
    }
    /**
     * @swagger
     * /user/{uuid}/kyc:
     *  post:
     *      description: Enrolls a user for KYC verification
     *      security:
     *          - ApiKeyAuth: []
     *      tags:
     *          - User
     *      produces:
     *          - application/json
     *      parameters:
     *          - name: kyc_data
     *            description: All customer information for the KYC process except the images
     *            in: body
     *            required: true
     *            type: CustomerInformation4Stop
     *            schema:
     *              $ref: '#/definitions/KYCEnrollmentRequestType'
     *      requestBody:
     *          required: true
     *          content:
     *              application/json:
     *                  schema:
     *                      $ref: '#/definitions/KYCEnrollmentRequestType'
     *      responses:
     *          202:
     *              description: User enrolled for KYC
     *          400:
     *              description: Missing required parameter
     *          403:
     *              description: Tried to enroll another user for KYC
     *          404:
     *              description: Specified user is missing
     *          500:
     *              description: Failed to register user due to internal server error
     */
    public async enrollUserForKYC(req: Request, res: Response, next: NextFunction) {
        Logger.info(`Enrolling user ${req.params.uuid}`);

        if (req.params.uuid !== req.user.uuid) {
            Logger.warn(`User ${req.user.uuid} tried to obtain the data for user ${req.params.uuid}`);
            res.status(403).send(`No permission to obtain user ${req.params.uuid}`);
            return;
        }

        try {
            const user = await this.ums.getUserByUUID(req.params.uuid);

            if (!user) {
                res.status(404).send(JSON.stringify(new Error(`User ${req.params.uuid} does not exist`)));
                return;
            }

            await this.kycService.initiateKYCForUser(user, req.body.ethereumWallet, req.connection.remoteAddress, req.body.kycData);
            res.status(202).send(`User ${req.params.uuid} enrolled for KYC verification`);
        } catch (e) {
            let returnCode: number = 500;
            if (e instanceof RangeError) {
                returnCode = 400;
            }

            res.status(returnCode).send(e.message);
        }
    }

    public async kycDocVerificationCallBack(req: Request, res: Response, next: NextFunction) {
        Logger.info(`Callback received for reference Id ${req.body.reference_id}`);

        try {
            const user = await this.kycService.docVerifiedCallBack(req.body.reference_id, req.body.score, req.body.score_complete);
            res.status(200).send(`Callback received`);
        } catch (e) {
            Logger.error(`Callback processing failed for reference Id: ${req.body.reference_id}`);

            let returnCode: number = 500;
            if (e instanceof ReferenceNotFoundError) {
                returnCode = 404;
            }

            res.status(returnCode).send(e.message);
        }
    }
}