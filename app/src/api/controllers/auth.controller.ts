/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { Request, Response, NextFunction } from "express";
import { Auth } from "../auth";
import * as uuid from "uuid";
import { UserManagementService, UserExistsError } from "../../services/ums.service";
import { Logger } from "../../services/logging.service";
import { User } from "../../types/user";
import { Router } from "express";
import * as passport from "passport";

export default class AuthController {
    private ums: UserManagementService;
    private router: Router;

    public constructor(ums: UserManagementService) {
        if (!ums) {
            throw new Error("Parameter ums cannot be null");
        }
        this.ums = ums;
        this.router = Router();
        this.router.post("/", (req: any, res: any, next: any) => { this.authenticate(req, res, next); });
        this.router.get("/facebook", passport.authenticate("facebook", {
            scope: [
                "email",
                "public_profile"] }));
        this.router.get("/facebook/callback", passport.authenticate("facebook"),
            (req: any, res: any, next: any) => { this.authenticateFB(req, res, next); });
        this.router.get("/google", passport.authenticate("google", {
            scope: [
                "https://www.googleapis.com/auth/userinfo.profile",
                "https://www.googleapis.com/auth/userinfo.email"] }));
        this.router.get("/google/callback", passport.authenticate("google"),
            (req: any, res: any, next: any) => { this.authenticateGoogle(req, res, next); });
    }

    public getRouter(): Router {
        return this.router;
    }

    /**
     * @swagger
     * definitions:
     *  JWT:
     *      type: object
     *      properties:
     *          token:
     *              type: string
     *              description: JWT token used for authentication
     * @swagger
     * /auth:
     *  post:
     *      description: Authenticate a user using user/pass and retrieve a JWT token
     *      security: []
     *      tags:
     *          - Authentication
     *      produces:
     *          - application/json
     *      parameters:
     *          - name: username
     *            description: The username of the user
     *            in: formData
     *            required: true
     *            type: string
     *          - name: password
     *            description: The password of the user
     *            in: formData
     *            required: true
     *            type: string
     *      responses:
     *          200:
     *              description: Authentication token
     *              schema:
     *                  $ref: '#/definitions/JWT'
     *          400:
     *              description: Missing required parameter
     *          401:
     *              description: Invalid username or password
     *          500:
     *              description: Failed to authenticate user due to internal server error
     */
    public async authenticate(req: Request, res: Response, next: NextFunction) {
        Logger.info("Authenticate called");

        if (!req.body.username) {
            res.status(400).send("Missing username");
            return;
        } else if (!req.body.password) {
            res.status(400).send("Missing password");
            return;
        }

        let user: any;
        try {
            user = await this.ums.getUser(req.body.username);
        } catch (ex) {
            Logger.error(`Failed to authenticate user "${req.body.username}": ${ex}`);
            res.status(500).send(`Error authenticating: ${ex}`);
            return;
        }

        if (!user) {
            res.status(401).send("Unauthorized");
            return;
        } else {
            const passwordMatch: boolean = await user.comparePassword(req.body.password);
            if (!passwordMatch || !user.isEmailVerified) {
                res.status(401).send("Unauthorized");
                return;
            }
        }

        this.authenticateUser(user, res);
    }

    /**
     * @swagger
     * /auth/facebook:
     *  get:
     *      description: Authenticate a user using Facebook OAuth2.0
     *      security: []
     *      tags:
     *          - Authentication
     *      produces:
     *          - application/json
     *      responses:
     *          200:
     *              description: Authentication token
     *              schema:
     *                  $ref: '#/definitions/JWT'
     *          401:
     *              description: Unauthorized
     */
    public async authenticateFB(req: Request, res: Response, next: NextFunction) {
        this.authenticateUser((req as any).user, res);
    }

    /**
     * @swagger
     * /auth/google:
     *  get:
     *      description: Authenticate a user using Google OAuth2.0
     *      security: []
     *      tags:
     *          - Authentication
     *      produces:
     *          - application/json
     *      responses:
     *          200:
     *              description: Authentication token
     *              schema:
     *                  $ref: '#/definitions/JWT'
     *          401:
     *              description: Unauthorized
     */
    public async authenticateGoogle(req: Request, res: Response, next: NextFunction) {
        this.authenticateUser((req as any).user, res);
    }

    private authenticateUser(user: User, res: Response) {
        if (!user) {
            res.status(401).send("Unauthorized");
            return;
        }

        const jwtObject = {
            uuid: user.uuid
        };

        const token = `JWT ${Auth.generateToken(jwtObject)}`;
        res.status(200).send(
            {
                token: token
            }
        );
    }
}