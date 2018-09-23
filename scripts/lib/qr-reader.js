var QrCode = require('qrcode-reader');
var Jimp = require("jimp");

module.exports = {
    getQRData: function getQRData(filename){
        return new Promise(function(resolve,reject){
            Jimp.read(filename, 
                function(err, image) {
                if (err) {
                    console.error(err);
                    reject(err);
                } else  {
                    var qr = new QrCode();
                    qr.callback = function(err, value) {
                        if (err || value.result === undefined) {
                            image.write("." + process.env.npm_package_config_qr_temp_folder + "lst-qr-code.png");
                            reject(err);
                        } else {
                            resolve(value.result)
                        }
                    };
                    image.contrast(1);
                    image.scale(0.2, Jimp.RESIZE_BEZIER);
                    qr.decode(image.bitmap);
                }
            });    
        });
    }
};