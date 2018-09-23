const scopedClient = require('scoped-http-client');
const https = require("https");
const fs = require("fs");
const URL = require('url').URL;

const SLACK_WEB_API_BASE_URL = process.env.npm_package_config_slack_url; 
const SLACK_BOT_TOKEN = process.env.HUBOT_SLACK_TOKEN;

const POST_MESSAGE = "chat.postMessage";

module.exports = {
    postNewAccountImage: function postNewAccountImage(username, channel, message, imageUrl){
        var payload = {
            "text": message,
            "channel" : channel, 
            "as_user": true,
             "attachments": [
                {
                    "fallback": message,
                    "color": "#36a64f",        
                    "image_url": imageUrl
                }]
            };

        return new Promise ( function(resolve, reject){
            scopedClient.create(SLACK_WEB_API_BASE_URL + POST_MESSAGE)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + SLACK_BOT_TOKEN)
                .post(JSON.stringify(payload))((err, res, body) => {
                    var data = JSON.parse(body);
                    if(err || !data.ok){
                        reject(err);
                    } else {
                        resolve(data);
                    }
                }); 
        });       
    },
    downloadImage: function downloadImage(imageUrl){
        let url = new URL(imageUrl);
        return new Promise ( function(resolve, reject){   
            var fileName = "." + process.env.npm_package_config_qr_temp_folder + (new Date()).getTime().toString() + ".jpg"

            https.get({ 
                host: url.host, 
                path: url.pathname,
                headers: {"Authorization" : "Bearer " + SLACK_BOT_TOKEN}
                },
            function(res) {
                if (res.statusCode === 200){
                    var newFileStream = fs.createWriteStream(fileName);
                    var responseStream = res.pipe(newFileStream);
                    responseStream.on('finish', function () { 
                        resolve(fileName);    
                    });
                } else {
                    reject();
                }
            });
        });       
    }
};