const config = require('../config.json');
const Consumer = require('../models/Consumer');
const emitter = require('../utils/events').eventEmitter;

const serviceService = require("./Service");
const serviceProvider = require("./Provider");
const serviceOfferDirect = require("./OfferDirect");
const serviceAccount = require("./Account");
const logger = require('../utils/logger');
const {promises} = require("../utils/events");

exports.Consumer = Consumer;

exports.create = (account) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceCustomer.create() called with: accountId: " + account.id);
            //Reject if account not defined
            if (!account) throw ("Account not defined");
            let consumer = new Consumer({
                account: account.id,
            });
            await consumer.save();
            logger.info("serviceCustomer.create() created consumer with consumerId: " + consumer.id);
            resolve(consumer);
        } catch (e) {
            logger.error("serviceCustomer.create() error: " + e);
            reject(e);
        }
    })
}

exports.rentService = (consumer) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceConsumer.rentService() called with: consumerId:  " + consumer._id);
            //Reject if consumer not defined
            if (!consumer) reject("Consumer not defined");
            //Find services of consumer and sort by count from highest to lowest
            let service = (await serviceService.Service.find({consumer: consumer}).sort({count: -1}))[0];
            if (service) {
                //Reject if last service is in state ACTIVE
                if (service.state === "ACTIVE") reject("Last service is in state ACTIVE");

                if (service.state === "MARKET") {
                    //Reject if last offer direct is in state MARKET
                    let offerDirect = await serviceOfferDirect.OfferDirect.findOne({service: service});
                    if (offerDirect.state === "MARKET") reject("Last offer direct is in state MARKET");
                }
                if (service.state === "DONE") {
                    logger.silly("serviceConsumer.rentService() no service found for consumer: " + consumer._id);
                    service = await serviceService.create(consumer);
                }
            } else {
                logger.silly("serviceConsumer.rentService() no service found for consumer: " + consumer._id);
                service = await serviceService.create(consumer);
            }
            // Calculate price
            let price = await clcOfferPrice(service);
            logger.debug("serviceConsumer.rentService() calculated price: " + price);
            // Calculate expiry timestamp
            let expiryTimestamp = (await clcOfferDuration(service)) + Date.now();
            logger.debug("serviceConsumer.rentService() calculated expiryTimestamp: " + expiryTimestamp);
            // Calculate offer provider
            let provider = await clcOfferProvider(service);
            logger.debug("serviceConsumer.rentService() calculated provider: " + provider._id);

            //Create direct offer
            logger.silly("serviceConsumer.rentService() creating offer direct");
            let offer = await serviceOfferDirect.create(service, price, expiryTimestamp);
            logger.silly("serviceConsumer.rentService() created offer direct: " + offer.id);
            service.offers.push(offer.id);
            //Set state to MARKET
            service.state = "MARKET";
            await service.save();
            logger.verbose("serviceConsumer.rentService() service state set to MARKET: " + service._id);
            //Send to provider
            offer.buyer = provider.account;
            offer.state = "MARKET";
            await offer.save();
            logger.verbose("serviceConsumer.rentService() offer direct state set to MARKET: " + offer._id);
            //Send offer to provider
            await serviceProvider.offerDirectReceive(provider, offer);
            logger.silly("serviceConsumer.rentService() offer direct sent to provider: " + offer._id);
            //Commence offer direct (start expiry timer)
            await serviceOfferDirect.commence(offer);
            logger.silly("serviceConsumer.rentService() offer direct commenced: " + offer._id);
            resolve(service);
        } catch (e) {
            logger.error("serviceConsumer.rentService() error: " + e);
            reject(e);
        }
    })
}

exports.offerDirectAccepted = (consumer, offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceConsumer.offerDirectAccepted() called with offerDirect: " + offerDirect._id);
            //Reject if offer not defined
            if (!offerDirect) reject("Offer not defined");
            //Reject if offer not in state MARKET
            if (offerDirect.state !== "MARKET") {
                logger.error("serviceConsumer.offerDirectAccepted() offer direct not in state MARKET: " + offerDirect._id);
                reject("Offer not in state MARKET");
            }
            if (!consumer) {
                logger.error("serviceConsumer.offerDirectAccepted() consumer not defined: " + offerDirect._id);
                reject("Consumer not defined");
            }
            //Change state of offer direct to ACCEPTED
            offerDirect.state = "ACCEPTED";
            await offerDirect.save();
            logger.verbose("serviceConsumer.offerDirectAccepted() offer direct state set to ACCEPTED: " + offerDirect._id);
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceConsumer.offerDirectAccepted() error: " + e);
            reject(e);
        }
    })

}

exports.offerDirectRejected = (offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceConsumer.offerDirectRejected() called with offerDirect: " + offerDirect._id);
            //Reject if offer not defined
            if (!offerDirect) reject("Offer not defined");
            //Reject if offer not in state MARKET
            if (offerDirect.state !== "MARKET") reject("Offer not in state MARKET");
            //Get consumer of service
            let consumer = await Consumer.findOne({account: offerDirect.seller});
            //Reject if consumer not found
            if (!consumer) reject("Consumer not found to rent service");
            //Change state of offer direct to REJECTED
            offerDirect.state = "REJECTED";
            await offerDirect.save();
            logger.verbose("serviceConsumer.offerDirectRejected() offer direct state set to REJECTED: " + offerDirect._id);
            //Timout for 100 units
            setTimeout(async () => {
                //Rent service again
                logger.silly("serviceConsumer.offerDirectRejected() renting service again: " + offerDirect._id);
                promises.push(this.rentService(consumer));
            }, 100);
            resolve(offerDirect);
        } catch (e) {
            reject(e);
        }
    })

}

exports.offerDirectExpired = (offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceConsumer.offerDirectExpired() called with offerDirect: " + offerDirect._id);
            //Reject if offer not defined
            if (!offerDirect) reject("Offer not defined");
            //Get consumer of service
            let consumer = await Consumer.findOne({account: offerDirect.seller});
            //Reject if consumer not found
            if (!consumer) reject("Consumer not found to rent service");
            logger.verbose("serviceConsumer.offerDirectExpired() offer direct state set to EXPIRED: " + offerDirect._id);
            //Rent service again
            logger.silly("serviceConsumer.offerDirectExpired() renting service again: " + offerDirect._id);
            await this.rentService(consumer);
            resolve(offerDirect);
        } catch (e) {
            reject(e);
        }
    })
}

exports.serviceCompleted = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceConsumer.serviceCompleted() called with service: " + service._id);
            //Reject if service not defined
            if (!service) reject("Service not defined");
            //Reject if service not in state DONE
            if (service.state !== "DONE") reject("Service not in state DONE");
            //Get consumer of service
            let consumer = await Consumer.findOne({_id: service.consumer});
            //Reject if consumer not found
            if (!consumer) reject("Consumer not found to rent service");
            //Rent service again
            logger.silly("serviceConsumer.serviceCompleted() renting service again: " + service._id);
            await this.rentService(consumer);
            resolve(service);
        } catch (e) {
            reject(e);
        }
    })
}

let clcOfferPrice = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            //Random price from 1 to 10
            let price = Math.floor(Math.random() * 10) + 1;
            resolve(price);
        } catch (e) {
            reject(e);
        }
    })
}

let clcOfferDuration = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(3600);
        } catch (e) {
            reject(e);
        }
    })
}

let clcOfferProvider = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            let count = await serviceProvider.Provider.count();
            let random = Math.floor(Math.random() * count);
            let provider = await serviceProvider.Provider.findOne().skip(random);
            resolve(provider);
        } catch (e) {
            reject(e);
        }
    })
}