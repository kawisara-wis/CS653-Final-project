const PoolCapacity = require('../models/PoolCapacity');
const {Provider} = require("./Provider");
const providerService = require("../services/Provider");

const logger = require('../utils/logger');

exports.PoolCapacity = PoolCapacity;

exports.create = () => {
    return new Promise(async (resolve, reject) => {
        try {
            let poolCapacity = new PoolCapacity({});
            await poolCapacity.save();
            logger.info("poolCapacityService.create() created pool capacity: " + poolCapacity.id);
            resolve(poolCapacity);
        } catch (e) {
            reject(e);
        }
    })
}

exports.addProvider = (poolCapacity, provider) => {
    return new Promise(async (resolve, reject) => {
        try {
            //Get pool capacity
            let poolCapacity = await PoolCapacity.findOne({});
            //Reject if pool capacity not found
            if (!poolCapacity) reject("Pool capacity not found");
            //Reject if provider already in pool capacity
            if (poolCapacity.providers.includes(provider)) reject("Provider already in pool capacity");
            //Add provider to pool capacity
            poolCapacity.providers.push(provider);
            logger.info("poolCapacityService.addProvider() added provider: " + provider.id + " to pool capacity: " + poolCapacity.id);
            await poolCapacity.save();
            resolve();
        } catch (e) {
            reject(e);
        }
    })
}

exports.offerCapacityPost = (offerCapacity) => {
    return new Promise(async (resolve, reject) => {
        try {
            //Get pool capacity
            let poolCapacity = await PoolCapacity.findOne({});
            //Reject if pool capacity not found
            if (!poolCapacity) {
                logger.error("poolCapacityService.offerCapacityPost() error: Pool capacity not found");
                return reject("Pool capacity not found")
            }
            ;
            //Reject if offer capacity already in pool capacity
            if (poolCapacity.offers.includes(offerCapacity)) {
                logger.error("poolCapacityService.offerCapacityPost() error: Offer capacity already in pool capacity");
                return reject("Offer capacity already in pool capacity")
            }
            offerCapacity.state = "MARKET";
            await offerCapacity.save();
            logger.verbose("servicePoolCapacity.offerCapacityPost() changed offer capacity state to MARKET: " + offerCapacity.id);
            //Add offer capacity to pool capacity
            poolCapacity.offers.push(offerCapacity);
            await poolCapacity.save();
            //Get all providers registered to pool capacity
            let providers = await Provider.find({"id": {$in: poolCapacity.providers}});
            //Shuffle providers so that each provider has equal opportunity to receive offer capacity first
            providers = providers.sort(() => Math.random() - 0.5);
            //Async request to each provider to offer capacity
            for (let provider of providers) {
                await providerService.offerCapacityPosted(provider, offerCapacity);
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    })
}


