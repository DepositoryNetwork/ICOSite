/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */

import * as validator from "validator";
import * as moment from "moment";

export class Utils {
    public static shallowCopy(objTarget: any, objSrc: any): any {
        for (const key in objTarget) {
            if (objSrc.hasOwnProperty(key)) {
                objTarget[key] = objSrc[key];
            }
        }
    }
    public static formatDate(date: Date): string {
        const d = new Date(date);
        let month = String(d.getMonth() + 1);
        let day = String(d.getDate());
        const year = String(d.getFullYear());

        if (month.length < 2)
            month = "0" + month;

        if (day.length < 2)
            day = "0" + day;

        return [year, month, day].join("-");
    }
    public static isInvalidInputString (str: String): boolean {
        return (!str || 0 === str.length || !str.trim());
    }

    /**
     * Email validation
     */
    public static isInvalidEmail(str: String): boolean {
        return !validator.isEmail(str.toString());
    }

    /**
     * Password validation: at least length of 8, not same
     * as username, contains at least one number
     */
    public static isInvalidPassword(str: String): boolean {
        return !validator.isLength(str.toString(), {min: 8, max: undefined});
    }

    /**
     * Country code validation
     */
    public static isInvalidCountryCode(str: String): boolean {
        // ISO 3166-1 Alpha-3 country code validation
        return !(validator.isISO31661Alpha2(str.toString()));
    }

    /**
     * Phone validation (should be a number)
     */
    public static isInvalidPhoneNumber(str: String): boolean {
        return !validator.isMobilePhone(str.toString(), "any");
    }

    /**
     * Date of birth validation (YYYY-MM-DD)
     */
    public static isInvalidDOB(str: String): boolean {
        return !(moment(str.toString(), "YYYY-MM-DD").isValid());
    }

    /**
     * Gender validation (M/F)
     */
    public static isInvalidGender(str: String): boolean {
        const primitive_str = str.toString().toLowerCase();

        return !(primitive_str === "m" || primitive_str === "f");
    }

    /**
     * IP address validation
     */
    public static isInvalidIPAddress(str: String): boolean {
        return !validator.isIP(str.toString());
    }

    /**
     * Postal code validation
     */
    public static isInvalidPostalCode(str: String): boolean {
        return !validator.isPostalCode(str.toString(), "any");
    }
}