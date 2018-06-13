/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import { Router } from "express";

export default class SwaggerController {
    private router: Router;

    public constructor() {
        this.router = Router();
        this.init();
    }

    public getRouter(): Router {
        return this.router;
    }

    private init() {
        const options = {
            swaggerDefinition: {
                info: {
                    title: "Depository Network ICO",
                    version: "1.0.0",
                    description: "API definition for the Depository Network ICO",
                },
                tags: [
                    {
                        name: "Authentication",
                        description: "Authentication mechanisms"
                    },
                    {
                        name: "User",
                        description: "User registration and management"
                    }
                ],
                securityDefinitions: {
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "Authorization"
                    }
                },
                securitySchemes: {
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "Authorization"
                    }
                },
                host: "localhost:3000",
                basePath: "/api"
            },
            apis: ["./**/controllers/*.ts", "./**/types/*.ts"]
          };

          const swaggerJSDoc = require("swagger-jsdoc");
          const swaggerUi = require("swagger-ui-express");
          const swaggerSpec = swaggerJSDoc(options);

          this.router.get("/json", function (req, res) {
            res.setHeader("Content-Type", "application/json");
            res.send(swaggerSpec);
          });

          this.router.use("/", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    }
}