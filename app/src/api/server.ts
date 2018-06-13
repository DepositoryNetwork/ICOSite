/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */


import * as https from "https";
import * as fs from "fs";
import { Application } from "express";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import App from "./app";
import UserController from "./controllers/user.controller";
import AuthController from "./controllers/auth.controller";
import ApiRouter from "./routes";
import { UserManagementService } from "../services/ums.service";
import { Logger } from "../services/logging.service";
import { KYCService } from "../services/kyc.service";

(<any>mongoose).Promise = global.Promise;
dotenv.config({ path: ".env" });

export class Server {
    private ums: UserManagementService;
    private kycService: KYCService;
    private server: https.Server;
    private app: Application;

    public constructor(ums: UserManagementService, kyc: KYCService) {
        this.ums = ums;
        this.kycService = kyc;
        this.init();
    }

    public start() {
        this.server.listen(process.env.API_PORT);
        this.server.on("error", (ex: Error) => { this.onError(ex); });
        this.server.on("listening", () => { this.onListening(); });
    }

    private init() {
        const ums: UserManagementService = new UserManagementService();
        const userController = new UserController(this.ums, this.kycService);
        const authController = new AuthController(this.ums);
        const router = new ApiRouter(userController, authController);
        this.app = (new App(router, this.ums)).getApp();

        this.app.set("port", process.env.API_PORT);

        const options = {
            key: fs.readFileSync("certificates/key.pem"),
            cert: fs.readFileSync("certificates/certificate.pem")
        };

        this.server = https.createServer(options, this.app);
    }

    private onError(ex: Error): void {
        Logger.error(JSON.stringify(ex));
    }

    private onListening(): void {
        const addr = this.server.address();
        const bind = (typeof addr === "string") ? `pipe ${addr}` : `port ${addr.port}`;
        Logger.info(`Listening on ${bind}`);
    }

    public getApp(): Application {
        return this.app;
    }
}