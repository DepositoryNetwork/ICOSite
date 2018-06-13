const crowdsaleService = require('./crowdsale-services');
const {DepoTokenContract} = require('./config-blockchain');

// TODO config.json to be moved to process.env (config.blockchain.network could be local, ropsten, mainnet)
// TODO privateKeyWhitelister to come from process.env - this address is only allowed to whitelist

// Whitelist single address with KYC
// run = async () => {
//     let privateKeyWhitelister = "0x7ab741b57e8d94dd7e1a29055646bafde7010f38a900f55bbd7647880faa6ee8";
//     let addressToWhitelist = "0xd4fa489eacc52ba59438993f37be9fcc20090e39";
//     let KYC_id = "329089a7970f47c3b6e4fabeb0e7cb02";
//     let txnHash = await crowdsaleService.whitelistAddress(privateKeyWhitelister, addressToWhitelist, KYC_id);
//     console.log(txnHash);
// };

// Whitelist multiple addresses at once
// run = async () => {
//     let privateKeyWhitelister = "0xd6d710943471e4c37ceb787857e7a2b41ca57f9cb4307ee9a9b21436a8e709c3";
//     let addressesToWhitelist = [
//         "0xd4fa489eacc52ba59438993f37be9fcc20090e31",
//         "0x760bf27cd45036a6c486802d30b5d90cffbe31f1",
//         "0x56a32fff5e5a8b40d6a21538579fb8922df52581",
//         "0xfec44e15328b7d1d8885a8226b0858964358f1d1"
//     ];
//
//     let KYC_ids = [
//         "329089a7970f47c3b6e4fabeb0e7cb02",
//         "329089a7970f47c3b6e4fabeb0e7cb03",
//         "329089a7970f47c3b6e4fabeb0e7cb04",
//         "329089a7970f47c3b6e4fabeb0e7cb05"
//     ];
//
//     let txnHash = await crowdsaleService.whitelistMultipleAddresses(privateKeyWhitelister, addressesToWhitelist, KYC_ids);
//     console.log(txnHash);
// };

// Check if given address is whitelisted
// run = async () => {
//     let addressToCheck = "0xd4fa489eacc52ba59438993f37be9fcc20090e39";
//
//     let txnHash = await crowdsaleService.isWhitelisted(addressToCheck);
//     console.log(txnHash);
// };

// Get current tokens sold
// run = async () => {
//     let tokenInstance = await DepoTokenContract();
//     let tokensSold = await tokenInstance.totalSupply();
//
//     console.log(tokensSold.toString());
// };


// Get current tokens for 1 ETH
run = async () => {
    let tokensAmount = await crowdsaleService.getCurrentTokensForEther();
    console.log(tokensAmount.toString());
};

run();