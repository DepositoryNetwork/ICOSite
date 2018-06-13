/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import * as dotenv from "dotenv";
import { User } from "../types/user";
import { KYCData, KYCStatus } from "../types/kycData";
import { Logger } from "./logging.service";
import { Utils } from "./utils";
import { KYCDataModel, KYCDataSchema } from "../schemas/kycData.schema";
import { KYCProvider } from "./kycProvider";
import { KYCData4Stop, CustomerInformation4Stop,
            KYCDocVerificationData4Stop, KYCEnrollmentRequestType, DocImage4Stop } from "../types/kycData4Stop";
import { KYCData4StopSchema, KYCData4StopModel } from "../schemas/kycData4Stop.schema";
import * as uuid from "uuid";
import * as request from "request";

dotenv.config({ path: ".env" });

class KYCResult {
    public rejected: boolean = true;
    public kycIDs: string[] = [];
}

export class KYCProvider4Stop implements KYCProvider {

    public validateDocImage(doc: DocImage4Stop, fieldName: string, canBeOptional: boolean): Error {
        if (!doc) {
            return canBeOptional ? undefined : new RangeError(`${fieldName} is missing and it is not optional`);
        } else {
            if (Utils.isInvalidInputString(doc.contentType) )
                return new RangeError(`${fieldName}.contentType cannot be empty`);

            if (Utils.isInvalidInputString(doc.filename) )
                return new RangeError(`${fieldName}.fileName cannot be empty`);

            if (Utils.isInvalidInputString(doc.data) ||
                Buffer.byteLength(doc.data, "utf8") > 5 * 1000000 )
                return new RangeError(`${fieldName}.data cannot be empty and file size should be less than 5MB`);
        }

        return undefined;
    }
    public validateKYCData(userData: any): Error {

        const data: KYCEnrollmentRequestType = userData as KYCEnrollmentRequestType;

        if (!data.customer_information) {
            return new RangeError("Customer information cannot be empty");
        }

        if (Utils.isInvalidInputString(data.customer_information.firstName)) {
            return new RangeError("First name cannot be empty");
        }

        if (Utils.isInvalidInputString(data.customer_information.lastName)) {
            return new RangeError("Last name cannot be empty");
        }

        if (Utils.isInvalidInputString(data.customer_information.country)) {
            return new RangeError("Country of residence cannot be empty");
        }

        if (Utils.isInvalidInputString(data.customer_information.dob)) {
            return new RangeError("Date of birth cannot be empty and it must be in YYYY-MM-DD format");
        }

        if (Utils.isInvalidGender(data.customer_information.gender)) {
            return new RangeError("Gender cannot be empty");
        }

        if (Utils.isInvalidPhoneNumber(String(data.customer_information.phone1))) {
            return new RangeError("At least 1 phone should be provided");
        }

        if (Utils.isInvalidPostalCode(data.customer_information.postal_code)) {
            return new RangeError("Postal code cannot be empty");
        }

        if (!data.doc_images) {
            return new RangeError("doc_images cannot be empty");
        } else {
            let valErr: Error = this.validateDocImage(data.doc_images.doc, "doc", false);
            if (valErr) return valErr;

            valErr = this.validateDocImage(data.doc_images.doc2, "doc2", true);
            if (valErr) return valErr;

            valErr = this.validateDocImage(data.doc_images.doc3, "doc3", true);
            if (valErr) return valErr;

            valErr = this.validateDocImage(data.doc_images.doc4, "doc4", true);
            if (valErr) return valErr;
        }

        return undefined;
    }
    public async persistKYCData(user: User, kycData: KYCDataModel, userData: any): Promise<void> {
        if (!user || Utils.isInvalidInputString(user.uuid)) {
            throw new RangeError("User parameter cannot be null");
        }

        if (!kycData || !kycData._id) {
            throw new RangeError(`Parent KYC data not persisted properly for user ${user.username}`);
        }

        const err: Error = this.validateKYCData(userData);
        if (err) {
            throw new Error(`Validation error: ${err}`);
        }

        let result: Promise<void> = undefined;

        try {

            const bufferizeDocument = (doc: any) => {
                if (!doc) {
                    return undefined;
                }
                return {
                    data: new Buffer(doc.data, "base64"),
                    contentType: doc.contentType,
                    filename: doc.filename
                };
            };

            const dataRecord = new KYCData4StopSchema({
                id_dataKYC: kycData._id,
                customer_information: userData.customer_information,
                doc_images: {
                    doc: bufferizeDocument(userData.doc_images.doc),
                    doc2: bufferizeDocument(userData.doc_images.doc2),
                    doc3: bufferizeDocument(userData.doc_images.doc3),
                    doc4: bufferizeDocument(userData.doc_images.doc4),
                }
            });

            await dataRecord.save();
            result = Promise.resolve();
        } catch (error) {
            Logger.error(`Error creating 4Stop data for user: ${user.username}}. Error details: ${error}`);
            result = Promise.reject(error);
        }

        return result;
    }

    public async removeKYCData(kycData: KYCDataModel): Promise<void> {
        try {
            await KYCData4StopSchema.findOneAndRemove(
                { id_dataKYC: kycData._id}
            );
            Promise.resolve();
        } catch (ex) {
            const errorMsg = `Failed to remove 4Stop data for user: ${kycData.uuid} Exception: ${ex}`;
            Logger.error(errorMsg);
            return Promise.reject(errorMsg);
        }
    }

    public isUserApprovedBasedOnScore(kycApplicant: KYCDataModel, kyc_score: number): boolean {
        return kyc_score >= Number(process.env.KYC_CONFIDENCE_THRESHOLD);
    }

    public async processKYC(kycApplicants: KYCDataModel[],
                            stateChanger: (model: KYCDataModel, kycIDs: string[], status: KYCStatus) => Promise<void>): Promise<void> {
        if (!stateChanger) {
            throw new Error("stateChanger callback cannot be undefined");
        }

        const currKYCBatch: Promise<void>[] = [];

        for (const kycApplicant of kycApplicants) {
            const perEntryFlow = async (kycApplicant: KYCDataModel): Promise<void> => {
                // 1 - do KYC call
                const kycResult: KYCResult = await this.performKYC(kycApplicant);

                // 2 - update record state
                stateChanger(kycApplicant,
                    kycResult.kycIDs,
                    kycResult.rejected ? KYCStatus.kyc_rejected : KYCStatus.processing_docs);

                return Promise.resolve();
            };

            // add mini-flow to the current batch
            currKYCBatch.push(perEntryFlow(kycApplicant));
        }

        if (currKYCBatch.length > 0) {
            await Promise.all(currKYCBatch);
        }
    }

    private async performKYC(kycApplicant: KYCDataModel): Promise<KYCResult> {
        Logger.info(`Processing KYC data for user ${kycApplicant.uuid}`);

        let result: Promise<KYCResult> = undefined;

        try {
            const data_4Stop: KYCData4StopModel =
                await KYCData4StopSchema.findOne({ id_dataKYC: kycApplicant._id}).exec();

            if (data_4Stop) {

                const request_4Stop: KYCData4Stop = new KYCData4Stop().cloneFrom(JSON.parse(JSON.stringify(data_4Stop)));

                request_4Stop.reg_date = Utils.formatDate((<any>data_4Stop).updatedAt);
                request_4Stop.reg_ip_address = kycApplicant.request_origin;
                request_4Stop.user_number = kycApplicant.uuid;
                request_4Stop.user_name = kycApplicant.user_name;
                request_4Stop.merchant_id = process.env.MERCHANT_ID_4STOP;
                request_4Stop.password = process.env.MERCHANT_PASS_4STOP;

                const outerThis: KYCProvider4Stop = this;

                result = new Promise( (resolve, reject) => {
                    request.post( {url: process.env.CUSTOMER_REGISTRATION_4STOP, form: request_4Stop },
                        (err: any, response: any, body: any) => {
                            if (!err) {
                                const kycResponse = JSON.parse(body);

                                if ((<number>kycResponse.status) < 0) {
                                    reject(new Error(`Customer Registration rejected for user ${kycApplicant.uuid}.` +
                                        ` Status Code: ${kycResponse.status}, Description: ${kycResponse.description}`));
                                    return;
                                }

                                const kycResult: KYCResult = new KYCResult();
                                kycResult.kycIDs = [kycResponse.id];
                                kycResult.rejected = kycResponse.rec !== "Approve"
                                                    || kycResponse.confidence_level <= Number(process.env.KYC_CONFIDENCE_THRESHOLD);

                                Logger.info(`>>>>> KYC Evaluation for ${kycApplicant.uuid} is ${kycResponse.rec}, `
                                    + ` score: ${kycResponse.confidence_level}. Overall decision: ${JSON.stringify(kycResult)}`);

                                resolve(kycResult);
                            } else {
                                reject(new Error(`API Error. StatusCode: ${response.statusCode}`
                                        + `Request: ${JSON.stringify(request_4Stop)} Body: ${JSON.stringify(body)}`));
                            }
                        });
                }).then( (kycResult: KYCResult) => {
                    Logger.info(`Posting document verification for user ${kycApplicant.uuid}`);
                    return outerThis.performKYCDocVerification(kycApplicant, kycResult, data_4Stop );
                });
            } else {
                throw new Error(`Inconsistent data for user ${kycApplicant.uuid}, KYCData4Stop record missing.`);
            }
        } catch (err) {
            Logger.error(`Could not perfom KYC for user ${kycApplicant.uuid}. Error: ${err}`);
            result = Promise.reject(err);
        }

        return result;
    }

    private async performKYCDocVerification(kycApplicant: KYCDataModel,
                                                kycResult: KYCResult,
                                                data_4stop: any): Promise<KYCResult> {
        const attachDoc = (target_doc: any, target_key: any, doc: any) => {
            if (doc.data && doc.data.length > 0) {
                target_doc[target_key] = {
                    value: doc.data,
                    options: {
                        contentType: doc.contentType,
                        filename: doc.filename
                    }
                };
            }
        };

        const request_doc: KYCDocVerificationData4Stop = new KYCDocVerificationData4Stop();

        request_doc.customer_registration_id = kycResult.kycIDs[0]  ;
        request_doc.user_number = kycApplicant.uuid;
        request_doc.user_name = kycApplicant.user_name;
        request_doc.merchant_id = process.env.MERCHANT_ID_4STOP;
        request_doc.password = process.env.MERCHANT_PASS_4STOP;
        request_doc.method = "3";

        attachDoc(request_doc, "doc", data_4stop.doc_images.doc);
        attachDoc(request_doc, "doc2", data_4stop.doc_images.doc2);
        attachDoc(request_doc, "doc3", data_4stop.doc_images.doc3);
        attachDoc(request_doc, "doc4", data_4stop.doc_images.doc4);

        const res: Promise<KYCResult> = new Promise( (resolve, reject) => {
            request.post( {
                url: process.env.DOCID_VERIFICATION_4STOP,
                preambleCRLF: true,
                postambleCRLF: true,
                formData: request_doc },
                (err: any, response: any, body: any) => {
                    if (!err && <number>response.statusCode === 200) {
                        const kycResponses = JSON.parse(body);

                        for (const res of kycResponses) {
                            if ((<number>res.status) < 0) {
                                const errMsg = `Doc Verification rejected for user ${kycApplicant.uuid}.` +
                                        ` Status Code: ${res.status}, Description: ${res.description}`;
                                Logger.error(errMsg);
                                reject(new Error(errMsg));
                                return;
                            }

                            kycResult.kycIDs.push(res.reference_id);
                        }

                        resolve(kycResult);
                    } else {
                        reject(new Error(`Doc ID API Error. StatusCode: ${response.statusCode}`
                                + `Request: ${JSON.stringify(request_doc)} Body: ${JSON.stringify(body)}`));
                    }
            });
        });

        return res;
    }
}
