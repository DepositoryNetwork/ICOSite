/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

/**
 * @swagger
 * definitions:
 *  User:
 *      type: object
 *      required:
 *          - username
 *          - email
 *          - password
 *      properties:
 *          username:
 *              type: string
 *          email:
 *              type: string
 *          password:
 *              type: string
 */
export class User {
    uuid: string;
    username: string;
    email: string;
    password: string;
    token: string;
    isKYCApproved: boolean;
    isEmailVerified: boolean;

 }
