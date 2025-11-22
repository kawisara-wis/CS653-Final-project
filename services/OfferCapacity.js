const logger = require("../utils/logger");
const OfferCapacity = require("../models/OfferCapacity");
const serviceAccount = require("./Account");


exports.OfferCapacity = OfferCapacity;

exports.create = (offerDirect, price, expiryTimestamp) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceOfferCapacity.create() called with offer direct: " + offerDirect.id + " price: " + price + " expiryTimestamp: " + expiryTimestamp);
            //Get buyer provider to which the offer direct was send
            let buyer = await serviceAccount.Account.findById(offerDirect.buyer);
            //Reject if fee is negative
            if (price - offerDirect.price < 0) {
                reject("Fee cannot be negative");
            }
            //Reject if timestamp is greater than offer direct expiry timestamp
            if (expiryTimestamp > offerDirect.expiryTimestamp) {
                reject("Expiry timestamp cannot be greater than offer direct expiry timestamp");
            }
            let offerCapacity = new OfferCapacity({
                seller: buyer,
                price: price,
                fee:price - offerDirect.price,
                expiryTimestamp: expiryTimestamp,
                offerDirect: offerDirect
            });
            logger.info("serviceOfferCapacity.create() created offer capacity: " + offerCapacity.id);
            resolve(offerCapacity);
        } catch (e) {
            logger.error("serviceOfferCapacity.create() error: " + e);
            reject(e);
        }
    })
}