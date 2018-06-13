const ethers = require('ethers');

const {
    DepoCrowdsaleContract,
    DepoCrowdsaleContractWithWallet
} = require('./config-blockchain.js');

const WalletService = require("./wallet-services");

const constants = require('./constants.json');


class CrowdsaleService {
    static async getOwner() {
        return await DepoCrowdsaleContract.owner();
    }

    static async getWhitelister() {
        return await DepoCrowdsaleContract.whitelister();
    }

    static async getKYCId(address) {
        let KYC_id = await DepoCrowdsaleContract.whitelist(address);
        if (KYC_id === constants.emptyBytes) {
            return "";
        }

        return ethers.utils.toUtf8String(KYC_id)
    }

    static async getCurrentTokensForEther() {
        let tokens = await DepoCrowdsaleContract.getTokensForWei("1000000000000000000"); // 1 ETH in Wei
        return tokens;
    }

    static async isWhitelisted(address) {
        let KYC_id = await this.getKYCId(address);
        return KYC_id !== ""
    }

    static async whitelistAddress(privateKey, address, KYC_id) {
        let wallet = await WalletService.initWalletFromPrivateKey(privateKey);
        await this.validateWhitelisting(wallet.address);

        let DepoCrowdsaleContractWallet = DepoCrowdsaleContractWithWallet(wallet);
        const KYC_id_bytes = ethers.utils.toUtf8Bytes(KYC_id);
        const options = {gasPrice: constants.gasPrice};

        return await DepoCrowdsaleContractWallet.addToWhitelist(address, KYC_id_bytes, options);
    }

    static async whitelistMultipleAddresses(privateKey, addresses, KYC_ids) {
        let wallet = await WalletService.initWalletFromPrivateKey(privateKey);
        await this.validateWhitelisting(wallet.address);
        await this.validateMultiWhitelisting(addresses, KYC_ids);

        let DepoCrowdsaleContractWallet = DepoCrowdsaleContractWithWallet(wallet);

        let KYC_Ids_bytesArray = [];
        for (let i = 0; i < addresses.length; i++) {
            KYC_Ids_bytesArray.push(ethers.utils.toUtf8Bytes(KYC_ids[i]));
        }

        const options = {gasPrice: constants.gasPrice};

        return await DepoCrowdsaleContractWallet.addManyToWhitelist(addresses, KYC_Ids_bytesArray, options);
    }

    static async validateWhitelisting(whitelister) {
        let whitelisterAllowed = await this.getWhitelister();

        if (whitelisterAllowed !== whitelister) {
            throw new Error("The wallet trying to whitelist has no permissions")
        }
    }

    static async validateMultiWhitelisting(addresses, KYC_ids) {
        if (addresses.length !== KYC_ids.length) {
            throw new Error("Addresses and KYC_IDs should be the same length")
        }

        if (addresses.length > constants.maxArraysLength) {
            throw new Error("Arrays are too large for one transaction, split it in more")
        }
    }
}

module.exports = CrowdsaleService;