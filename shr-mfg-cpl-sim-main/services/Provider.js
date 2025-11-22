const Provider = require('../models/Provider');

exports.Provider = Provider;

const serviceService = require("./Service");
const serviceConsumer = require("./Consumer");
const serviceOfferCapacity = require("./OfferCapacity");
const servicePoolCapacity = require("./PoolCapacity");

const logger = require('../utils/logger');
const serviceOfferDirect = require("./OfferDirect");

exports.create = (account) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.create() called with: accountId: " + account.id);
            //Reject if account not defined
            if (!account) throw ("Account not defined");
            let provider = new Provider({
                account: account._id,
            });
            await provider.save();
            logger.info("serviceProvider.create() created provider with providerId: " + provider.id);
            resolve(provider);
        } catch (e) {
            logger.error("serviceProvider.create() error: " + e);
            reject(e);
        }
    })
}

exports.offerDirectReceive = (provider, offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.offerDirectReceived() called with offerDirect: " + offerDirect._id);
            //Reject if offer not defined
            if (!offerDirect) {
                logger.error("serviceProvider.offerDirectReceived() error: Offer direct not defined");
                return reject("Offer direct not defined");
            }
            //Reject if offer not in state MARKET
            if (offerDirect.state !== "MARKET") {
                logger.error("serviceProvider.offerDirectReceived() error: Offer direct not in state MARKET");
                return reject("Offer direct not in state MARKET");
            }
            if (!provider) {
                logger.error("serviceProvider.offerDirectReceived() error: Provider not found");
                return reject("Provider not found");
            }
            let decision = await decisionOfferDirect(provider, offerDirect);
            //Get consumer that created offerDirect via account
            let consumer = await serviceConsumer.Consumer.findOne({account: offerDirect.seller});
            if (!consumer) {
                logger.error("serviceProvider.offerDirectReceived() error: Consumer not found");
                return reject("Consumer not found");
            }
            //TODO: Remove from testing
            // decision = "postpone";

            switch (decision) {
                case "accept":{
                    offerDirect = await serviceConsumer.offerDirectAccepted(consumer, offerDirect);
                    logger.silly("serviceProvider.offerDirectReceived() accepted offer direct: " + offerDirect.id);
                    //Get service
                    let service = await serviceService.Service.findById(offerDirect.service);
                    //Commence service
                    logger.silly("serviceProvider.offerDirectReceived() commence service: " + service.id);
                    await serviceService.commence(service);
                    logger.silly("serviceProvider.offerDirectReceived() commenced service: " + service.id);
                }
                    break;
                case "reject":{
                    offerDirect = await serviceConsumer.offerDirectRejected(offerDirect);
                    logger.silly("serviceProvider.offerDirectReceived() rejected offer direct: " + offerDirect._id);
                }
                    break;
                case "postpone":{
                    logger.silly("serviceProvider.offerDirectReceived() postponed offer direct: " + offerDirect._id);
                    let offerCapacity = await serviceOfferCapacity.create(offerDirect, clcOfferCapacityPrice(offerDirect), clcOfferCapacityExpiryTimestamp(offerDirect));                 logger.silly("serviceProvider.offerDirectReceived() created offer capacity: " + offerCapacity._id);
                    await servicePoolCapacity.offerCapacityPost(offerCapacity);
                    logger.info("servicePoolCapacity.offerCapacityPost() posted offer capacity: " + offerCapacity._id);
                }
            }
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceProvider.offerDirectReceived() error: " + e);
            reject(e);
        }
    })
}

exports.offerCapacityAccepted = (provider, offerCapacity) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.offerCapacityAccepted() called with offerCapacity: " + offerCapacity._id);
            //Reject if offer not defined
            if (!offerCapacity) {
                logger.error("serviceProvider.offerCapacityAccepted() error: Offer capacity not defined");
                return reject("Offer capacity not defined");
            }
            //Reject if provider not defined
            if (!provider) {
                logger.error("serviceProvider.offerCapacityAccepted() error: Provider not found");
                return reject("Provider not found");
            }
            //Reject if offer not in state ACCEPTED
            if (offerCapacity.state !== "ACCEPTED") {
                logger.error("serviceProvider.offerCapacityAccepted() error: Offer capacity not in state ACCEPTED");
                return reject("Offer capacity not in state ACCEPTED");
            }
            //Get offerDirect from offerCapacity
            let offerDirect = await serviceOfferDirect.OfferDirect.findById(offerCapacity.offerDirect);
            if (!offerDirect) {
                logger.error("serviceProvider.offerCapacityAccepted() error: Offer direct not found");
                return reject("Offer direct not found");
            }
            //Notify consumer that offer direct has been accepted
            let consumer = await serviceConsumer.Consumer.findOne({account: offerDirect.seller});
            if (!consumer) {
                logger.error("serviceProvider.offerCapacityAccepted() error: Consumer not found");
                return reject("Consumer not found");
            }
            offerDirect = await serviceConsumer.offerDirectAccepted(consumer, offerDirect);
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceProvider.offerCapacityAccepted() error: " + e);
            reject(e);
        }
    })

}

exports.offerCapacityPosted = (provider, offerCapacity) => {
    return new Promise(async (resolve, reject) => {
            try {
                logger.silly("serviceProvider.offerCapacityReceived() called with offerCapacity: " + offerCapacity._id);
                //Reject if offer not defined
                if (!offerCapacity) {
                    logger.error("serviceProvider.offerCapacityReceived() error: Offer capacity not defined");
                    return reject("Offer capacity not defined");
                }
                //Reject if provider not defined
                if (!provider) {
                    logger.error("serviceProvider.offerCapacityReceived() error: Provider not found");
                    return reject("Provider not found");
                }
                //Break if offer capacity is expired
                if (offerCapacity.expiryTimestamp < Date.now()) {
                    logger.silly("serviceProvider.offerCapacityReceived() offer capacity expired: " + offerCapacity._id);
                    return resolve();
                }
                //Break if offer capacity not in state MARKET
                if (offerCapacity.state !== "MARKET") {
                    logger.silly("serviceProvider.offerCapacityReceived() offer capacity not in state MARKET: " + offerCapacity._id);
                    return resolve();
                }
                let decision = await decisionOfferCapacity(provider, offerCapacity);

                //TODO: Remove from testing
                // decision = "accept";

                if (decision === "accept") {
                    //Respond to offer capacity seller
                    let seller = await Provider.findOne({account: offerCapacity.seller});
                    //Accept offer capacity
                    offerCapacity.state = "ACCEPTED";
                    offerCapacity.buyer = provider.account;
                    await offerCapacity.save();
                    logger.silly("serviceProvider.offerCapacityReceived() accepted offer capacity: " + offerCapacity._id);
                    await this.offerCapacityAccepted(seller, offerCapacity);
                }
                resolve(offerCapacity);
            } catch (e) {
                logger.error("serviceProvider.offerCapacityReceived() error: " + e);
                reject(e);
            }
        }
    )

}

let decisionOfferDirect = (provider, offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.decisionOfferDirect() called with offerDirect: " + offerDirect._id);
            //Do I have capacity to process service?
            //Get current number of services with state ACTIVE
            let count = await serviceService.Service.countDocuments({provider: provider._id, state: "ACTIVE"});
            if (count >= provider.servicesLimit) {
                logger.silly("serviceProvider.decisionOfferDirect() provider capacity reached: " + provider._id);
                return resolve(chooseOutcome(0, 0.5, 0.5));
            }

            let decision = chooseOutcome(0.5, 0.1, 0.4);
            if (decision === "accept") {
                //Check the availability of the provider capacities
                //Get current number of services with state ACTIVE
                let count = await serviceService.Service.countDocuments({provider: provider._id, state: "ACTIVE"});
                if (count >= provider.servicesLimit) {
                    logger.silly("serviceProvider.decisionOfferDirect() provider capacity reached: " + provider._id);
                    decision = "reject";
                }
            }
            return resolve(decision);
        } catch (e) {
            logger.error("serviceProvider.decisionOfferDirect() error: " + e);
            reject(e);
        }
    })
}

let decisionOfferCapacity = (provider, offerCapacity) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.decisionOfferCapacity() called with offerCapacity: " + offerCapacity._id);
            //Is offer capacity seller me?
            if (offerCapacity.seller === provider.account) {
                logger.silly("serviceProvider.decisionOfferCapacity() offer capacity seller is me: " + provider.id);
                return resolve("postpone");
            }
            // Do I have capacity to process service?
            //Get current number of services with state ACTIVE
            let count = await serviceService.Service.countDocuments({provider: provider._id, state: "ACTIVE"});
            if (count >= provider.servicesLimit) {
                logger.silly("serviceProvider.decisionOfferCapacity() provider capacity reached: " + provider.id);
                return resolve("postpone");
            }
            return resolve(chooseOutcome(0.5, 0, 0.5));

        } catch (e) {
            logger.error("serviceProvider.decisionOfferCapacity() error: " + e);
            reject(e);
        }
    })
}

let chooseOutcome = (acceptProbability, rejectProbability, postponeProbability) => {
    // Ensure the sum of probabilities is 1
    if (acceptProbability + rejectProbability + postponeProbability !== 1) {
        return 'Error: Probabilities must sum up to 1';
    }

    // Generate a random number between 0 and 1
    const randomNumber = Math.random();

    // Determine the outcome based on the probabilities
    if (randomNumber < acceptProbability) {
        return 'accept';
    } else if (randomNumber < acceptProbability + rejectProbability) {
        return 'reject';
    } else {
        return 'postpone';
    }
}

let clcOfferCapacityPrice=(offerDirect)=>{
    return offerDirect.price+1;
}

let clcOfferCapacityExpiryTimestamp=(offerDirect)=>{
    return offerDirect.expiryTimestamp-1;
}