"use strict";

const SlackService = require("./lib/slack");
const QRReaderService = require("./lib/qr-reader");
const WalletService = require("./lib/wallet");
const CoinmarketcapService = require("./lib/coinmarketcap");

// Description:
//   Let Hubot execute wallet commands on a given XMG wallet ( over JSON-RPC )
//
// Commands:
//   hubot commands                         - get a list of all commands.
//   hubot last [n] transaction[s]          - Get last [n] transaction[s] from incoming account.
//   hubot balance [in <BTC|EUR|USD|XMG>]   - Get the balance of the wallet, defaults to XMG. (displays availiable and staked/locked seperate)
//   hubot price [in <BTC|EUR|USD>]         - Get the current price XMG, defaults to "BTC". 
//   hubot send <amount> (+ image)          - Send <amount> XMG to QR-Address in the Image.
//   hubot send <amount> to <address>       - Send <amount> XMG to <address>.
//   hubot address new                      - Create a new address for the account incoming and displays it.
//   hubot lock wallet                      - Lock wallet.
//   hubot start staking                    - Get Wallet into staking mode.
//   hubot wallet status                    - Get some interesting wallet stats. 
//   hubot list addresses                   - Get the List of addresses under account incoming.
//   hubot get address <n>                  - Get address with the number <n>.
//   hubot get lastaddress                  - Get address shown in the chat.
//   hubot qr address <n>                   - Create a QRCode for the address with the index <n>.
//   hubot qr lastaddress                   - Create a QRCode for the lastaddress.
//   hubot qr this <data>                   - Create and display a QRCode of <data>.
//   hubot when moon                        - Esitmates "mooning".

// Notes:
//   A wallet has to be running should be running in a same LAN Zone.
//   Don't forget to configure the wallet, the price API (in the package.json) and Enviroment Variable HUBOT_SLACK_TOKEN 

const COMMAND_LIST = [
    "commands",
    "last [n] transaction[s]",
    "balance [in usd|btc|eur|xmg]",
    "price [in usd|btc|eur]",
    "send <amount> (+ image) ",
    "send <amount> to <address> ",
    "address new",
    "lock wallet",
    "start staking",
    "wallet status",
    "list addresses",    
    "get address <n>",
    "get lastaddress",
    "qr address <n>",
    "qr lastaddress",
    "qr this <data>",
    "when moon"
];

const QR_CREATE_IMAGE_URL = "https://api.qrserver.com/v1/create-qr-code/?data={0}&size=300x300";

const NO_TRANSACTIONS_FOUND_MESSAGE = "No transactions were found.";

const BALANCE_RESULT_MESSAGE = "Your current balance is *{2}* *{3}*, availiable *{0}* *{3}* and currently *{1}* *{3}* are being staked.";
const PRICE_RESULT_MESSAGE = "The current price is *{0}* *{1}*.";
const DO_NOT_KNOW_COMMAND_MESSAGE = "Sorry I don't understand this command.";
const INVALID_PARAMETER_MESSAGE = "Sorry the parameter seem to be invalid.";
const PAYMENT_WAS_SEND_MESSAGE = "Your Payment was sent.\nHere is the tx-id: _{0}_";

const WELCOME_MESSAGE = "Hi, I am ready, to help you with all your XMG financial needs.\n_(ask me for *commands* if you want to know, what I can do for you)_";
const WHEN_MOON_RESPONSE_MESSAGE = "FORGET THE MOON!\nLean back and enjoy the ride!"

const NOT_AUTHORIZED_MESSAGE = "Sorry currently I'm not allowed to handle your wallet business.";
const WALLET_WAS_LOCKED_MESSAGE = "Your wallet was locked, everthing is save now.";

const WALLET_IS_STAKING_NOW_MESSAGE = "Your wallet is now staking.";

const WALLET_BASIC_STATS_MESSAGE = "*Here are some stats*:\nWallet Version: {0}\nBlocks: {1}\nBalance: {2}\nStake: {3}\nUnlocked until: {4}";

const API_CALL_ERROR_MESSAGE = "Sorry, an Error has occured connecting to the API, please consult the logs.";

const NO_ADDRESSES_FOUND_MESSAGE = "No Addresses were found.";
const ADDRESSE_NOT_FOUND_MESSAGE = "Addresse not found found.";
const WALLET_RPC_CALL_ERROR_MESSAGE = "Sorry, an Error has occured connecting to your wallet, please consult the logs.";

const AUTHORIZED_USERS = JSON.parse(process.env.npm_package_config_authorized_users);

const TRANSACTION_SENT_ITEM_MESSAGE  = "{0} Sent to address {1} {2} _(Confirmations:{3})_";
const TRANSACTION_RECEIVE_ITEM_MESSAGE  = "{0} Received from address {1} {2} _(Confirmations:{3})_";

module.exports = (robot) => {

    var lastAddress = "";
    var lastAddresses =  [];

    robot.hear(/\s+commands$/, function(chat){
        chat.reply("*Hi " + chat.message.user.name+"*\nHere are the commands I can offer you:");
        chat.reply(COMMAND_LIST.join("\n"));
        chat.finish();
    });

    robot.listen(
        (message) =>{
            return new RegExp("^" + robot.name, "gi").test(message.text) && AUTHORIZED_USERS.indexOf(message.user.name) === -1;
        },
        (chat) => {
            chat.reply(NOT_AUTHORIZED_MESSAGE);
            chat.finish();
        }
    );

    robot.respond(/(hello)|(hi)|(whatup)|(hallo)|(\?)/i, (chat) => {
        chat.reply(WELCOME_MESSAGE);
        chat.finish();
    });

    robot.respond(/\s+last\s+(\d+)?\s*transaction(s)?$/i, (chat) => {
        var nCount = (chat.match[1] || (chat.match[2] ? 3 : 1));
        WalletService.getLastNTransactions(nCount)
            .then(walletInfo => {
                if(walletInfo.length === 0){
                    chat.reply(NO_TRANSACTIONS_FOUND_MESSAGE);
                }
                for (var idx in walletInfo) {
                    const transaction = walletInfo[idx];
                    var message = "";
                    if(transaction.category === "send"){
                        message = TRANSACTION_SENT_ITEM_MESSAGE;
                    } else if(transaction.category === "receive"){
                        message = TRANSACTION_RECEIVE_ITEM_MESSAGE;
                    }
                    if(message!=""){
                        chat.reply(
                            format(message,      
                                formatSecondsTotString(transaction.timereceived),
                                transaction.address,
                                (transaction.amount).toFixed(8), 
                                transaction.confirmations)
                            );
                    }
                }
                
            }, rpcWalletError(chat));
            chat.finish();
    });

    robot.respond(/\s+balance(?:\s+in\s+((?:USD)|(?:BTC)|(?:EUR)|(?:XMG)))?$/i, (chat) => {
        var currency = (chat.match[1] || "XMG").toUpperCase();
        WalletService.getCurrentBalance(currency)
            .then(walletInfo => {
                chat.reply(
                    format(BALANCE_RESULT_MESSAGE, 
                            (walletInfo.availableBalance).toFixed(8), 
                            (walletInfo.stakedBalance).toFixed(8), 
                            (walletInfo.totalBalance).toFixed(8), 
                            currency)
                    );
            }, rpcWalletError(chat));
            chat.finish();
    });

    robot.respond(/\s+price(?:\s+in\s+((?:USD)|(?:BTC)|(?:EUR)))?$/i, (chat) => {
        var currency = (chat.match[1] || "BTC").toUpperCase();

        CoinmarketcapService
            .getXMGPriceIn(currency)
            .then( price => {
                chat.reply(format(PRICE_RESULT_MESSAGE, (price).toFixed(8),  currency ));
                },
                err => chat.reply(API_CALL_ERROR_MESSAGE)
            );
        chat.finish();
    });

    robot.respond(/\s+send\s+(\d+\.\d{1,8})$/, (chat) => {
        if( chat.match[1]  && parseFloat(chat.match[1]) > 0 && chat.message.rawMessage.files.length === 1){
            var amount = chat.match[1];
            var imageUrl = chat.message.rawMessage.files[0].thumb_1024;
            SlackService.downloadImage(imageUrl)
                .then(function(filename){
                    return QRReaderService.getQRData(filename)
                        .then(function(address){
                            setLastAddress(address);
                            console.info(amount, address);
                            return WalletService.sendAmountTo(amount, address)
                                .then( walletInfo => {
                                    console.info(walletInfo);
                                    chat.reply(format(PAYMENT_WAS_SEND_MESSAGE, walletInfo));
                                },
                                rpcWalletError(chat));
                        });
                });
        } else {
            chat.reply(INVALID_PARAMETER_MESSAGE);
        }
        chat.finish();
    });   

    robot.respond(/\s+send\s+(\d+\.\d{1,8})\s+to\s+(9[^OIl]{26,33})$/, (chat) => {
        if( chat.match[1] && chat.match[2] && parseFloat(chat.match[1]) > 0 ){
            var amount = chat.match[1];
            var address = chat.match[2];

            setLastAddress(address);

            WalletService.sendAmountTo(amount, address)
                .then( walletInfo => {
                        chat.reply(format(PAYMENT_WAS_SEND_MESSAGE, walletInfo));
                    },
                    rpcWalletError(chat));
        } else {
            chat.reply(INVALID_PARAMETER_MESSAGE);
        }
        chat.finish();
    });    
    
    robot.respond(/\s+address\s+new$/, (chat) => {

        WalletService.getNewAddress()
            .then(
                (newAddress) => {
                    setLastAddress(newAddress);
                    return SlackService.postNewAccountImage(robot.name, chat.message.room, newAddress, format(QR_CREATE_IMAGE_URL, encodeURIComponent(newAddress)));
                }
            )
            .catch(rpcWalletError(chat));
        chat.finish();
    });

    robot.respond(/\s+lock\s+wallet$/, (chat) => {
        WalletService.lockWallet()
            .then( 
                () => chat.reply(WALLET_WAS_LOCKED_MESSAGE),
                rpcWalletError(chat)
            );
      
        chat.finish();
    });

    robot.respond(/\s+start\s+staking$/, (chat) => {
        WalletService.unlockForStaking()
            .then( 
                () => chat.reply(WALLET_IS_STAKING_NOW_MESSAGE),
                rpcWalletError(chat)
            );
        chat.finish();
    });

    robot.respond(/\s+wallet\s+status$/, (chat) => {
        WalletService.getWalletStatus()
            .then(walletInfo => {
                chat.reply(format(WALLET_BASIC_STATS_MESSAGE, 
                    walletInfo.version, 
                    walletInfo.blocksCount, 
                    walletInfo.availableBalance,
                    walletInfo.stakedBalance,
                    walletInfo.unlockedUntil)); 
            },
            rpcWalletError(chat));
        chat.finish();
    });

    robot.respond(/\s+list\s+addresses$/, (chat) => {
        WalletService.listAddresses()
            .then((addresses) => {
                if(addresses.length === 0){
                    chat.reply(NO_ADDRESSES_FOUND_MESSAGE);
                } else {
                    lastAddresses = [];
                   for(var idx in addresses){
                        chat.reply(`${(idx*1)+1}.) ${addresses[idx]}`);
                        setLastAddress(addresses[idx]);
                        lastAddresses.push(addresses[idx]);
                    } 
                }
            },
            rpcWalletError(chat)
        );
        chat.finish();
    });

    robot.respond(/\s+get\s+(last)?address(?:\s+(\d+))?$/, (chat) => {
        if(chat.match[1] && lastAddress !== ""){
            chat.reply(lastAddress);
        } else if (chat.match[1] ===undefined && chat.match[2] && parseInt(chat.match[2]) <= lastAddresses.length && parseInt(chat.match[2]) > 0) {
            var idx =  parseInt(chat.match[2]) - 1;
            setLastAddress(lastAddresses[idx]);
            chat.reply(lastAddresses[idx]);
        } else {
            chat.reply(ADDRESSE_NOT_FOUND_MESSAGE);
        }
        
        chat.finish();
    });

    robot.respond(/\s+qr\s+address\s+(\d+)$/, (chat) => {
        var idx =  parseInt(chat.match[1]) - 1;
        if(idx >= 0 && lastAddresses.length > idx){
            setLastAddress(lastAddresses[idx]);
            SlackService.postNewAccountImage(robot.name, chat.message.room, lastAddresses[idx], format(QR_CREATE_IMAGE_URL, encodeURIComponent(lastAddresses[idx])));           
        } else {
            chat.reply(ADDRESSE_NOT_FOUND_MESSAGE);
        }
        chat.finish();
    });

    robot.respond(/\s+qr\s+lastaddress$/, (chat) => {
        if(lastAddress !== ""){
            SlackService.postNewAccountImage(robot.name, chat.message.room, lastAddress, format(QR_CREATE_IMAGE_URL, encodeURIComponent(lastAddress)));           
        } else {
            chat.reply(ADDRESSE_NOT_FOUND_MESSAGE);
        }
        chat.finish();
    });

    robot.respond(/\s+qr\s+this\s+(.*)$/, (chat) => {
        SlackService.postNewAccountImage(robot.name, chat.message.room, chat.match[1], format(QR_CREATE_IMAGE_URL, encodeURIComponent(chat.match[1])));   
        chat.finish();
    });

    robot.respond(/\s+when\s+moon$/, (chat) => {
        chat.reply(WHEN_MOON_RESPONSE_MESSAGE);
        chat.finish();
    });

    robot.respond(/.*/i, (chat) => {
        chat.reply(DO_NOT_KNOW_COMMAND_MESSAGE);
        chat.finish();
    });
    
    function setLastAddress(address){
        lastAddress = address;
    }

    function formatSecondsTotString(seconds){
        var date = new Date(seconds * 1000);
        return `${pad(date.getDate())}-${pad(date.getMonth()+1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` ;
    }

    function pad(number){
        return ("0" + number.toString()).slice(-2);
    }
    
    function rpcWalletError(chat){
        return err => {
            chat.reply (WALLET_RPC_CALL_ERROR_MESSAGE);
            console.warn("RPC ERROR", err);
        };
    }
    
    function format(template, ...parameters){
        return template.replace(/\{(\d+)\}/gi, function(whole, idx){
            return parameters[idx] || "";
        });
    }
};