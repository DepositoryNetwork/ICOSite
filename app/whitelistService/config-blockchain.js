const config = require('./config.json');
const ethers = require('ethers');

const DEPORefundableCrowdsaleAbi = require('./contracts-abi/DEPORefundableCrowdsale.json').abi;
const DEPOTokenAbi = require('./contracts-abi/ICOToken.json').abi;

// Setup Ethers provider from configs
const providers = ethers.providers;
const nodeProvider = getNodeProvider();

function getNodeProvider() {
    if (config.blockchain.network === 'local') {
        return new providers.JsonRpcProvider("", providers.networks.unspecified);
    }
    return new providers.InfuraProvider(providers.networks[config.blockchain.network], config.blockchain.infura_api_key);
}

// Initiate contracts with nodeProvider
let DepoCrowdsaleContract = new ethers.Contract(
    config.blockchain.depo_crowdsale_contract_address, DEPORefundableCrowdsaleAbi, nodeProvider);

const DepoTokenContract = async function () {
    let tokenAddress = await DepoCrowdsaleContract.token();
    return new ethers.Contract(tokenAddress, DEPOTokenAbi, nodeProvider);
};

// Initiate contracts with wallets
const DepoCrowdsaleContractWithWallet = function (wallet) {
    wallet.provider = nodeProvider;

    return new ethers.Contract(config.blockchain.depo_crowdsale_contract_address, DEPORefundableCrowdsaleAbi, wallet);
};

const DepoTokenContractWithWallet = async function (wallet) {
    wallet.provider = nodeProvider;
    let tokenAddress = await DepoCrowdsaleContract.token();

    return new ethers.Contract(tokenAddress, DEPOTokenAbi, wallet);
};

module.exports = {
    nodeProvider,
    DepoCrowdsaleContract,
    DepoCrowdsaleContractWithWallet,
    DepoTokenContract,
    DepoTokenContractWithWallet
};