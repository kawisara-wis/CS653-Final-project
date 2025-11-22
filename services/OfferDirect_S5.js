const OfferDirect = require('../models/OfferDirect_S5');
const emitter = require('../utils/events').eventEmitter;

exports.OfferDirect = OfferDirect;

const Service = require("../models/Service_S5");      
const Consumer = require("../models/Consumer_S5");
const Provider = require("../models/Provider_S5"); 
const logger = require('../utils/logger');
const {promises} = require('../utils/events');


exports.create = (service, price, expiryTimestamp, buyerAccount) => { // <-- (1) แก้ไขพารามิเตอร์
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceOfferDirect.create() (S5) called");
            
            // (ใช้ 'Consumer' (S5) ที่เรา require ไว้ด้านบน)
            let consumer = await Consumer.findById(service.consumer); 
            
            let offerDirect = new OfferDirect({
                seller: consumer.account,
                buyer: buyerAccount, // <-- (2) เพิ่ม "Buyer" (ผู้ซื้อ) (นี่คือจุดที่แก้บั๊ก!)
                service: service.id,
                price: price,
                expiryTimestamp: expiryTimestamp,
                scenario: 5
            });

            await offerDirect.save(); // (บันทึก)

            logger.info("serviceOfferDirect.create() (S5) created offer direct: " + offerDirect.id);
            resolve(offerDirect);
        } catch (e) {
            logger.error("serviceOfferDirect.create() (S5) error: " + e);
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
            const serviceConsumer = require("./Consumer_S5");
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

// --- (โค้ด exports.expire จบที่นี่) ---

// --- (นี่คือ "exports.send" เวอร์ชันที่แก้ไขแล้ว) ---
exports.send = (offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            const serviceProvider = require("./Provider_S5");
            
            console.log('serviceProvider:', serviceProvider);
            console.log('offerDirectReceived:', serviceProvider.offerDirectReceived);
            console.log('🔴 DEBUG: OfferDirect.send() START');
            console.log('  offerDirect.id:', offerDirect.id);
            
            logger.silly("serviceOfferDirect.send() (S5) called with offerDirect: " + offerDirect.id);

            offerDirect.state = "MARKET";

            await offerDirect.save(); 
            logger.silly(`Offer ${offerDirect.id} state set to MARKET and saved.`);

            let provider = await Provider.findOne({ account: offerDirect.buyer });
            let consumer = await Consumer.findOne({ account: offerDirect.seller }); 
            
            console.log('  provider:', provider?.id);
            console.log('  consumer:', consumer?.id);
            console.log('  provider:', provider?.id);
            console.log('  consumer:', consumer?.id);
            
            
            
            
            
            if (!provider) throw new Error("Provider (S5) not found in send");
            if (!consumer) throw new Error("Consumer (S5) not found in send");
            console.log('🟢 Calling serviceProvider.offerDirectReceive...');

            await serviceProvider.offerDirectReceive(provider, offerDirect, consumer);
            console.log('🟢 offerDirectReceive DONE!');

            logger.info("serviceOfferDirect.send() (S5) sent offer: " + offerDirect.id + " to provider: " + provider.id);
            resolve(offerDirect);
        } catch (e) {
            console.log('❌ ERROR in send:', e.message);
            logger.error("serviceOfferDirect.send() (S5) error: " + e);
            reject(e);
        }
    })
}
// --- สิ้นสุด ---