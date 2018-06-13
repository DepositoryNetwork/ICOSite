/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import { Schema } from "mongoose";
import { Utils } from "../services/utils";

/**
 * @swagger
 * definitions:
 *  IdDocument4Stop:
 *      type: object
 *      required:
 *          - type
 *          - value
 *      properties:
 *          type:
 *              type: string
 *          value:
 *              type: string
 */
export class IdDocument4Stop {
    type: string = "";
    value: string = "";

    public cloneFrom(obj: any): IdDocument4Stop {
        Utils.shallowCopy(this, obj);
        return this;
    }
}

/**
 * @swagger
 * definitions:
 *  CustomerInformation4Stop:
 *      type: object
 *      required:
 *          - firstName
 *          - lastName
 *          - address1
 *          - city
 *          - country
 *          - postal_code
 *          - phone1
 *          - dob
 *          - gender
 *          - id_values
 *      properties:
 *          firstName:
 *              type: string
 *          lastName:
 *              type: string
 *          address1:
 *              type: string
 *          address2:
 *              type: string
 *          city:
 *              type: string
 *          province:
 *              type: string
 *          country:
 *              type: string
 *          postal_code:
 *              type: string
 *          phone1:
 *              type: string
 *          phone2:
 *              type: string
 *          dob:
 *              type: string
 *          gender:
 *              type: string
 *          id_values:
 *              type: array
 *              items:
 *                  $ref: '#/definitions/IdDocument4Stop'
 */
export class CustomerInformation4Stop {
    public firstName: string = "";
    public lastName: string = "";
    public address1: string = "";
    public address2: string = "";
    public city: string = "";
    public province: string = "";
    public country: string = "";
    public postal_code: string = "";
    public phone1: number = NaN;
    public phone2: number = NaN;
    public dob: string = "";
    public gender: string = "";
    public id_values: IdDocument4Stop[] = [];

    public cloneFrom(obj: any): CustomerInformation4Stop {
        Utils.shallowCopy(this, obj);
        this.id_values = [];

        for (const val of obj.id_values) {
            this.id_values.push(new IdDocument4Stop().cloneFrom(val));
        }

        return this;
    }
}

/**
 * @swagger
 * definitions:
 *  KYCData4Stop:
 *      type: object
 *      required:
 *          - customer_information
 *          - user_name
 *          - user_number
 *          - reg_date
 *          - reg_ip_address
 *      properties:
 *          customer_information:
 *              $ref: '#/definitions/CustomerInformation4Stop'
 *          user_name:
 *              type: string
 *          user_number:
 *              type: string
 *          reg_date:
 *              type: string
 *          reg_ip_address:
 *              type: string
 */
export class KYCData4Stop {
    public customer_information: CustomerInformation4Stop;
    public user_name: string = "";
    public user_number: string = "";
    public reg_date: string = "";
    public reg_ip_address: string = "";
    public merchant_id: string = "";
    public password: string = "";

    public cloneFrom(obj: any): KYCData4Stop {
        Utils.shallowCopy(this, obj);
        this.customer_information = new CustomerInformation4Stop().cloneFrom(obj.customer_information);
        return this;
    }
}

export class KYCDocVerificationData4Stop {
    public user_name: string = "";
    public user_number: string = "";
    public merchant_id: string = "";
    public password: string = "";
    public method: string = "3";
    public customer_registration_id: string = "";

    public cloneFrom(obj: any): KYCDocVerificationData4Stop {
        Utils.shallowCopy(this, obj);
        return this;
    }
}


/**
 * @swagger
 * definitions:
 *  DocImage4Stop:
 *      type: object
 *      required:
 *          - data
 *          - contentType
 *          - filename
 *      properties:
 *          doc:
 *              type: string
 *          contentType:
 *              type: string
 *          filename:
 *              type: string
 */
export class DocImage4Stop {
    public data: string;
    public contentType: string;
    public filename: string;
}

/**
 * @swagger
 * definitions:
 *  DocImages4Stop:
 *      type: object
 *      required:
 *          - doc
 *      properties:
 *          doc:
 *              $ref: '#/definitions/DocImage4Stop'
 *          doc2:
 *              $ref: '#/definitions/DocImage4Stop'
 *          doc3:
 *              $ref: '#/definitions/DocImage4Stop'
 *          doc4:
 *              $ref: '#/definitions/DocImage4Stop'
 */
export class DocImages4Stop {
    public doc: DocImage4Stop;
    public doc2: DocImage4Stop;
    public doc3: DocImage4Stop;
    public doc4: DocImage4Stop;
}

/**
 * @swagger
 * definitions:
 *  KYCEnrollmentRequestType:
 *      type: object
 *      required:
 *          - customer_information
 *          - doc_images
 *      properties:
 *          customer_information:
 *              $ref: '#/definitions/CustomerInformation4Stop'
 *          doc_images:
 *              $ref: '#/definitions/DocImages4Stop'
 */
export class KYCEnrollmentRequestType {
    public customer_information: CustomerInformation4Stop;
    public doc_images: DocImages4Stop;
}