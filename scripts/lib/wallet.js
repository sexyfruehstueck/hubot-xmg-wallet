const DEBUG = false;

const scopedClient = require('scoped-http-client');
const CoinmarketcapService  = require("./coinmarketcap");

const BASE_INCOMING_ACCOUNT_NAME = process.env.npm_package_config_wallet_account;
const WALLET_JSON_RPC_URL = process.env.npm_package_config_wallet_url;
const PASSPHRASE = process.env.npm_package_config_passphrase;

const JSON_RPC_BASE_PAYLOAD = {
    "jsonrpc": "1.0", 
    "id": process.env.npm_package_name
};

const RPC_GETADDRESSESBYACCOUNT = "getaddressesbyaccount"; 
const RPC_GETINFO = "getinfo";
const RPC_GETNEWADDRESS = "getnewaddress";
const RPC_VALIDATEADDRESS = "validateaddress";
const RPC_WALLETLOCK = "walletlock";
const RPC_WALLETPASSPHRASE = "walletpassphrase";
const RPC_SENDTO = "sendtoaddress";
const RPC_LISTTRANSACTIONS = "listtransactions";

const SEVERAL_YEARS_IN_SECONDS = 99999999;
const TEN_SECONDS  = 20;
const UNLOCK_FLAG = {
    DEFAULT: false,
    ONLY_STAKING: true
};

function rpcCallToWallet( rpcMethod, rpcParameters){
    return new Promise(function(resolve, reject){
        var wallet_payload = {};
        Object.assign(wallet_payload, JSON_RPC_BASE_PAYLOAD);

        wallet_payload["method"] = rpcMethod;
        wallet_payload["params"] = rpcParameters || [];

        scopedClient.create(WALLET_JSON_RPC_URL)
            .header("Accept", "application/json")
            .post(JSON.stringify(wallet_payload))((err, res, body) => {
                if(DEBUG){
                    console.info("RPC RESULT", err, body );
                }
                    
                if(err){
                    reject(err);
                } else {
                    resolve(JSON.parse(body).result);
                }
            });  
    });
}

function _logAndRejectPromise(err){
    console.warn(err);
    return Promise.reject(err);
}

function _getWalletInfo(){
    return rpcCallToWallet(RPC_GETINFO);
}

function _getCurrentBalance(currency){
    return CoinmarketcapService
        .getXMGPriceIn(currency)
        .then(price => {
            return _getWalletInfo()
                .then(walletInfo => {
                    return { 
                        "availableBalance" : walletInfo.balance * price,
                        "stakedBalance": walletInfo.stake * price,
                        "totalBalance" : (walletInfo.balance + walletInfo.stake) * price
                    }
                })
        }, 
        _logAndRejectPromise);
}

function _isAddressValid(address){
    return rpcCallToWallet(RPC_VALIDATEADDRESS, [address])
        .then(walletInfo => {
            return walletInfo.isvalid ? Promise.resolve() : Promise.reject();
        },
        _logAndRejectPromise);
}

function _unlockWallet(duration, onlyStaking){
    return rpcCallToWallet(RPC_WALLETPASSPHRASE, [PASSPHRASE, duration, onlyStaking ]);
}

function _lockWallet(){
    return rpcCallToWallet(RPC_WALLETLOCK);
}

function _isAmountValid(amount){
    return (parseFloat(amount) > 0 ? Promise.resolve : Promise.reject); 
}

function _sendTo(amount, address){
    return rpcCallToWallet(RPC_SENDTO, [address, parseFloat(amount)]);
}

function _sendAmountTo(amount, address){
    return _isAddressValid(address)
        .then( _ => _isAmountValid())
        .then( _ => _lockWallet())
        .then( _ => _unlockWallet(TEN_SECONDS, UNLOCK_FLAG.DEFAULT))
        .then( _ => _sendTo(amount, address), _logAndRejectPromise);
}

function _unlockForStaking(){
    return _unlockWallet(SEVERAL_YEARS_IN_SECONDS, UNLOCK_FLAG.ONLY_STAKING)
}

function _getNewAddress(){
    return rpcCallToWallet(RPC_GETNEWADDRESS, [BASE_INCOMING_ACCOUNT_NAME]);
}

function _listAddresses(){
    return rpcCallToWallet(RPC_GETADDRESSESBYACCOUNT, [BASE_INCOMING_ACCOUNT_NAME]);
}

function _getWalletStatus(){
    return _getWalletInfo()
        .then(walletInfo => ({
            "version": walletInfo.version, 
            "blocksCount": walletInfo.blocks,
            "availableBalance": walletInfo.balance, 
            "stakedBalance" : walletInfo.stake,
            "unlockedUntil" : walletInfo.unlocked_until 
        }));
}

function _getLastNTransactions(nCount){
    return rpcCallToWallet(RPC_LISTTRANSACTIONS, [BASE_INCOMING_ACCOUNT_NAME])
        .then(walletInfo => walletInfo.map(x => ({
                category: x.category,
                confirmations: x.confirmations,
                address : x.address,
                amount : x.amount,
                timereceived : x.timereceived
            }))
            .reverse()
            .slice(0, nCount)
        );
}

module.exports = {
    getCurrentBalance: _getCurrentBalance,
    getNewAddress: _getNewAddress,
    getWalletStatus: _getWalletStatus,
    sendAmountTo: _sendAmountTo,
    lockWallet: _lockWallet,
    unlockForStaking: _unlockForStaking,
    listAddresses: _listAddresses,
    getLastNTransactions: _getLastNTransactions
};