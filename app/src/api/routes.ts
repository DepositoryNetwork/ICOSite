/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { Router } from "express";
import * as passport from "passport";
import UserController from "./controllers/user.controller";
import AuthController from "./controllers/auth.controller";
import SwaggerController from "./controllers/swagger";

export default class ApiRouter {
    private readonly userController: UserController;
    private readonly authController: AuthController;
    private readonly swagger: SwaggerController;
    private readonly router: Router;

    constructor(userController: UserController, authController: AuthController) {
        if (!userController) {
            throw new Error("Api controller not specified");
        }
        if (!authController) {
            throw new Error("Auth controller not specified");
        }

        this.userController = userController;
        this.authController = authController;
        this.swagger = new SwaggerController();
        this.router = Router();
        this._init();
    }

    public getRouter(): Router {
        return this.router;
    }

    private _init() {
        this.router.use("/auth", this.authController.getRouter());
        this.router.use("/user", this.userController.getRouter());
        this.router.use("/doc", this.swagger.getRouter());
    }
}