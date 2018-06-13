/**
 * Copyright (c) 2018 Centroida.AI All rights reserved.
 */
import { KYCDataModel, KYCDataSchema } from "../schemas/kycData.schema";
import { User } from "../types/user";
import { KYCStatus } from "kycData";

export interface KYCProvider {
    /** Validates provider-specific KYC data and returns an error
     * @param  {any} userData - The data to be validated
     * @returns Error
     */
    validateKYCData(userData: any): Error;
    /** Persists the provider-specific KYC data (if needed)
     * @param  {User} user - The user for which the data is persisted
     * @param  {KYCDataModel} kycData - The KYC master entry used to track the KYC application
     * @param  {any} userData - The provider-specific KYC data
     * @returns Promise
     */
    persistKYCData(user: User, kycData: KYCDataModel, userData: any): Promise<void>;
    /** Removes the provider-specific KYC data (if persisted previously)
     * @param  {KYCDataModel} kycData - the KYC master record being removed
     * @returns Promise
     */
    removeKYCData(kycData: KYCDataModel): Promise<void>;
    /** Processes a batch of KYC applicants against the KYC provider.
     *  NOTE: As the batch size is dependent on the API rate on the provider side,
     *        this call is supposed to be fast - i.e. only call the API
     * @param  {KYCDataModel[]} kycApplicants - KYC applicants to be processed
     * @param  {(model:KYCDataModel,kycIDs:string[],status:KYCStatus)=>Promise<void>} stateChanger - A callback to update the status
     * @returns Promise
     */
    processKYC(kycApplicants: KYCDataModel[],
                stateChanger: (model: KYCDataModel, kycIDs: string[], status: KYCStatus) => Promise<void>): Promise<void>;
    /**
     * Determines whether a user is approved or rejected, based on a final KYC score
     * @param  {KYCDataModel} kycApplicant - KYC applicant
     * @param  {number} kyc_score - KYC score
     * @returns boolean - Indicates if the applicant is approved or not
     */
    isUserApprovedBasedOnScore(kycApplicant: KYCDataModel, kyc_score: number): boolean;
}