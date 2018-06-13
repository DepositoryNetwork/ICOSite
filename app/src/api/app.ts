/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { Request, Response, NextFunction } from "express";
import * as passport from "passport";
import * as express from "express";
import * as dotenv from "dotenv";
import * as bodyParser from "body-parser";
import * as helmet from "helmet";
import ApiRouter from "./routes";
import { Auth } from "./auth";
import { RequestHandler } from "express-serve-static-core";
import { UserManagementService } from "../services/ums.service";
import * as RateLimit from "express-rate-limit";
dotenv.config({ path: ".env" });

export default class App {
    private readonly app: express.Application;
    private readonly router: ApiRouter;
    private readonly ums: UserManagementService;

    constructor(router: ApiRouter, ums: UserManagementService) {
        this.router = router;
        this.ums = ums;
        this.app = express();
        this._initMiddleware();
        this._initRoutes();
    }

    public getApp(): express.Application {
        return this.app;
    }

    private _initMiddleware(): void {
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(helmet());
        this.app.use(helmet.frameguard({ action: "deny" }));

        this.app.set("superSecret", process.env.API_SECRET);

        this.app.use(passport.initialize());
        this.app.use(passport.session());

        const limiter = new RateLimit({
            windowMs: process.env.API_RATE_LIMIT_WINDOW_MS, // 5 minute window
            max: process.env.API_RATE_LIMIT_MAX_REQUESTS, // Start blocking after X requests
            delayMs: process.env.API_RATE_LIMIT_DELAY_MS, // Slow down subsequent responses by X ms per request
            delayAfter: process.env.API_RATE_LIMIT_DELAY_AFTER, // Begin slowing down after X requests
            message: process.env.API_RATE_LIMIT_MESSAGE
        });
        this.app.use(limiter);

        Auth.configAuth(passport, this.ums);
    }

    private _initRoutes(): void {
        this.app.use("/api", this.router.getRouter());
    }
}