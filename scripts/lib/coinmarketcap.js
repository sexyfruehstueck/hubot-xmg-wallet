const scopedClient = require('scoped-http-client');

const COINMARKETCAP_FREE_API_URL = process.env.npm_package_config_coinmarketcap_url;
const COINMARKETCAP_FREE_API_HEADER_NAME =  process.env.npm_package_config_coinmarketcap_header_name;
const COINMARKETCAP_FREE_API_KEY =  process.env.npm_package_config_coinmarketcap_api_key;
const CURRENCY_SYMBOL_XMG = "XMG";

module.exports = {
    getXMGPriceIn: function getXMGPriceIn(currency){
        currency = currency.toUpperCase();
        return new Promise(function(resolve, reject){
            if(currency === CURRENCY_SYMBOL_XMG){
                resolve(1);
            }else{
                scopedClient.create(COINMARKETCAP_FREE_API_URL + currency.toUpperCase())
                .header("Accept", "application/json")
                .header(COINMARKETCAP_FREE_API_HEADER_NAME, COINMARKETCAP_FREE_API_KEY)
                .get()((err, res, body) => {
                    if(err){
                        reject(err);
                    } else {
                        var price = JSON.parse(body).data.XMG.quote[currency].price;
                        resolve(price);
                    }
                });
            }
        });
    }
};