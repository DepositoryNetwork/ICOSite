/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as dotenv from "dotenv";
import * as jwt from "jsonwebtoken";
import { Logger } from "../services/logging.service";
import { UserManagementService } from "../services/ums.service";
import { User } from "user";
dotenv.config({ path: ".env" });

const JwtStrategy = require("passport-jwt").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;

export namespace Auth {
    export function configAuth(passport: any, ums: UserManagementService) {
        const options = {
            jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme("jwt"),
            secretOrKey: process.env.API_SECRET,
        };

        passport.use(new JwtStrategy(options, async (jwt_payload: any, done: any) => {
            Logger.debug(`JWT authentication called: ${JSON.stringify(jwt_payload)}`);
            let user: User;

            try {
                user = await ums.getUserByUUID(jwt_payload.uuid);
            } catch (ex) {
                Logger.error(`Failed to retrieve user: ${JSON.stringify(ex)}`);
                done(ex);
            }

            if (!user) {
                done(undefined, false);
            }

            done(undefined, user);
        }));

        passport.serializeUser(function(user: any, done: any) {
            done(undefined, user);
        });

        passport.deserializeUser(function(obj: any, done: any) {
            done(undefined, obj);
        });

        passport.use(new FacebookStrategy({
                clientID: process.env.FACEBOOK_CLIENT_ID,
                clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
                callbackURL: "/api/auth/facebook/callback",
                profileFields: ["id", "emails", "name"]
            },
            async function(accessToken: any, refreshToken: any, profile: any, done: any) {
                Logger.debug("Facebook authentication called");
                authenticateWithSocialMedia(accessToken, profile, done, "Facebook", ums);
            }
        ));

        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "/api/auth/google/callback"
          },
          async function(accessToken: any, refreshToken: any, profile: any, done: any) {
                Logger.debug("Google authentication called");
                authenticateWithSocialMedia(accessToken, profile, done, "Google", ums);
          }
        ));
    }

    export function generateToken(jwtObject: any) {
        return jwt.sign(jwtObject, process.env.API_SECRET, {
            expiresIn: process.env.JWT_TOKEN_EXPIRATION_TIME
        });
    }

    async function authenticateWithSocialMedia(accessToken: any, profile: any, done: any, socialMedia: string, ums: UserManagementService) {
        let user: User;

        try {
            user = await ums.getUser(profile.id);
        } catch (ex) {
            Logger.error(`Failed to retrieve user: ${JSON.stringify(ex)}`);
        }

        // If the user doesn't exist - it means this is his first login and we need to register him
        if (!user) {
            try {
                // Retrieve the (first) email from the user's profile
                const email = (profile.emails && profile.emails.length > 0) ? profile.emails[0].value : undefined;
                user = await ums.registerUser(profile.id, email, accessToken, "socialMedia");
            } catch (ex) {
                Logger.error(`Failed to register new user: ${JSON.stringify(ex)}`);
                done(ex);
            }
        }

        done(undefined, user);
    }
}