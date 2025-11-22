const OfferDirect = require('../models/OfferDirect');
const emitter = require('../utils/events').eventEmitter;

exports.OfferDirect = OfferDirect;

const serviceConsumer = require("./Consumer");

const logger = require('../utils/logger');

const {promises} = require('../utils/events');


exports.create = (service, price, expiryTimestamp) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceOfferDirect.create() called with service: " + service.id + " price: " + price + " expiryTimestamp: " + expiryTimestamp);
            //Get consumer
            let consumer = await serviceConsumer.Consumer.findById(service.consumer);
            let offerDirect = new OfferDirect({
                seller: consumer.account,
                service: service.id,
                price: price,
                expiryTimestamp: expiryTimestamp
            });
            logger.info("serviceOfferDirect.create() created offer direct: " + offerDirect.id);
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceOfferDirect.create() error: " + e);
            reject(e);
        }
    })
}

exports.commence = (offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceOfferDirect.commence() called with offerDirect: " + offerDirect.id);
            setTimeout(async () => {
                //Check if offer is in state ACCEPTED or REJECTED
                promises.push(this.expire(offerDirect));
            }, offerDirect.expiryTimestamp - Math.floor(Date.now()));
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceOfferDirect.commence() error: " + e);
            reject(e);
        }
    })
}

exports.expire = (offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            if (offerDirect.state !== "ACCEPTED" && offerDirect.state !== "REJECTED") {
                offerDirect.state = "EXPIRED";
                await offerDirect.save();
                logger.verbose("serviceOfferDirect.expire() offer direct state set to EXPIRED: " + offerDirect.id);
                logger.silly("serviceOfferDirect.expire() offer direct expired: " + offerDirect.id);
                await serviceConsumer.offerDirectExpired(offerDirect);
            }
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceOfferDirect.commence() error: " + e);
            reject(e);
        }
    })
}