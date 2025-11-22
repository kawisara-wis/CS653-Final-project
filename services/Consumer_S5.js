// --- นี่คือเวอร์ชันที่ถูกต้อง ---
const config = require('../config.json');
const Consumer = require('../models/Consumer_S5');
const emitter = require('../utils/events').eventEmitter;

const serviceOfferDirect = require("./OfferDirect_S5");  
const serviceAccount = require("./Account");    
const logger = require('../utils/logger');
const {promises} = require("../utils/events");
// --- สิ้นสุด ---

exports.Consumer = Consumer;

exports.create = (account, options = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceCustomer.create() called with: accountId: " + account.id);
            //Reject if account not defined
            if (!account) throw ("Account not defined");
            let consumer = new Consumer({
                account: account.id,
                location: options.location || { x: 0, y: 0 } // (รับค่า location หรือใช้ 0,0)
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

            const Provider = require('../models/Provider_S5');
            const Service = require('../models/Service_S5');
            const serviceService = require("./Service_S5");
            
            logger.silly("serviceConsumer.rentService() (Scenario 5) called with: " + consumer.id);

            // 1. ดึง location (พิกัด) ของ Consumer
            const consumerLocation = consumer.location;
            if (!consumerLocation) throw new Error("Consumer " + consumer.id + " has no location.");

            // 2. Query (ค้นหา) Provider (คลังสินค้า) ทั้งหมด
            const allProviders = await Provider.find({});

            // 3. คำนวณ "ระยะทาง" (Distance)
            const providersWithDistance = allProviders.map(provider => {
                const distance = calculateDistance(consumerLocation, provider.location);
                return { provider, distance };
            });

            // 4. "เรียงลำดับ" (Sort) โดยเอาตัวที่ "ใกล้ที่สุด" (Closest) ขึ้นก่อน
            providersWithDistance.sort((a, b) => a.distance - b.distance);

            // 5. ส่ง OfferDirect ไปให้ Provider ที่อยู่ใกล้ที่สุด (เช่น 3 อันดับแรก)
            const K_NEAREST_PROVIDERS = 3; 
            const nearestProviders = providersWithDistance.slice(0, K_NEAREST_PROVIDERS);

            logger.info(`Consumer ${consumer.id} is sending offers to ${nearestProviders.length} closest providers.`);

            let service = await serviceService.create(consumer);
            
            // --- (ตรรกะใหม่: คำนวณ Price/Duration ก่อน) ---
            let price = await clcOfferPrice(service);
            let expiryTimestamp = await clcOfferDuration(service);
            // ---

            // --- 🛑 (นี่คือจุดที่แก้ไข) ---
            for (const item of nearestProviders) {
                
                // 1. (เพิ่มเข้ามา) ตรวจสอบสถานะ Service "ก่อน" ส่ง
                // (ต้องโหลด Service ใหม่ทุกครั้ง เพื่อเอาค่าล่าสุดจาก DB)
                const currentService = await Service.findById(service.id);
                if (currentService.state === 'ACTIVE' || currentService.state === 'DONE') {
                    logger.warn(`Service ${service.id} already accepted/done, stopping send loop.`);
                    break; // 🛑 หยุดลูปทันที
                }
                
                // 2. (เหมือนเดิม) สร้างและส่ง Offer
                let offerDirect = await serviceOfferDirect.create(service, price, expiryTimestamp, item.provider.account);
                await serviceOfferDirect.send(offerDirect);
                
                // 3. (เพิ่มเข้ามา) ป้องกันการ Crash ของ serviceService.offerDirect
                // (ต้องโหลด Service ใหม่อีกครั้ง เพราะ 'send' อาจทำให้ State เปลี่ยน)
                const serviceAfterSend = await Service.findById(service.id);
                if (serviceAfterSend.state === 'IDLE') {
                    // เรียกฟังก์ชันนี้ "เฉพาะ" เมื่อ Service ยังเป็น IDLE เท่านั้น
                    await serviceService.offerDirect(service, offerDirect);
                }
                // --- 🛑 (สิ้นสุดการแก้ไข) ---
            }
            
            resolve(service);

        } catch (e) {
            logger.error("serviceConsumer.rentService() (S5) error: " + e.message); // (ใช้ .message)
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
            // const serviceService = require("./Service_S5");
            let count = await serviceProvider.Provider.count();
            let random = Math.floor(Math.random() * count);
            let provider = await serviceProvider.Provider.findOne().skip(random);
            resolve(provider);
        } catch (e) {
            reject(e);
        }
    })
}
/**
 * คำนวณระยะทาง (Distance) (สูตรพีทาโกรัส)
 */
function calculateDistance(loc1, loc2) {
    // ตรวจสอบว่ามี location data
    if (!loc1 || !loc2 || loc1.x === undefined || loc2.x === undefined) {
        logger.warn("CalculateDistance: Location data is missing. Returning 0.");
        return 0; 
    }
    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    // $Distance = \sqrt{ (P_x - C_x)^2 + (P_y - C_y)^2 }$
    return Math.sqrt(dx * dx + dy * dy); 
}