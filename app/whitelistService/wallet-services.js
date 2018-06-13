const ethers = require('ethers');

const {
    nodeProvider
} = require('./config-blockchain.js');

class WalletService {

    static async initWalletFromPrivateKey(privateKey) {
        return new ethers.Wallet(privateKey, nodeProvider);
    }
}

module.exports = WalletService;