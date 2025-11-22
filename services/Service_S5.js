const Service = require('../models/Service_S5');
const Provider = require('../models/Provider_S5');
const emitter = require('../utils/events').eventEmitter;
const config = require("../config.json");
const logger = require('../utils/logger');
const {promises} = require('../utils/events');
const {clock} = require("../utils/clock");

exports.Service = Service;

exports.create = (consumer) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceService.create() called with consumer: " + consumer.id);
            //Get number of services of consumer
            let count = await Service.countDocuments({consumer: consumer.id});
            let service = new Service({
                consumer: consumer.id,
                duration: config.service.duration,
                count: count
            });
            await service.save();
            logger.info("serviceService.create() created service: " + service.id);
            resolve(service);
        } catch (e) {
            logger.error("serviceService.create() error: " + e);
            reject(e);
        }
    })
}

// (ใน service/Service_S5.js)
exports.commence = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceService.commence() called with service: " + service._id);

            // --- 🛑 (นี่คือจุดที่แก้ไข) ---
            // ลบการตรวจสอบ Provider ที่ซ้ำซ้อนและก่อให้เกิด Race Condition ทิ้ง
            // (เพราะ Provider_S5.js "ปักธง" service.provider มาให้เราแล้ว)

            // let provider = await Provider.findById(service.provider); 
            // if (!provider) throw new Error("Provider not found");
            // --- 🛑 (สิ้นสุดการแก้ไข) ---

            // ตรวจสอบ State (อันนี้ถูกต้อง)
            if (service.state !== "MARKET") reject("Service not in state MARKET");
            
            service.state = "ACTIVE";
            // ... (โค้ดส่วนที่เหลือของ commence() ถูกต้องแล้ว) ...
            
            await service.save();
            logger.verbose("serviceService.commence() service state set to ACTIVE: " + service._id);
            // ... (setTimeout) ...
            resolve(service);
        } catch (e) {
            logger.error("serviceService.commence() error: " + e.message);
            reject(e);
        }
    })
}

exports.complete = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            const serviceConsumer = require("./Consumer_S5");
            // ---
            logger.info("serviceService.complete() called with service: " + service._id);
            //Reject if service not in state ACTIVE
            if (service.state !== "ACTIVE") throw("Service not in state ACTIVE");
            service.state = "DONE";
            await service.save();

            logger.verbose("serviceService.complete() service state set to DONE: " + service._id);
            logger.silly("serviceService.complete() call serviceCompleted on serviceConsumer");
            await serviceConsumer.serviceCompleted(service);
            resolve(service);

        } catch (e) {
            logger.error("serviceService.complete() error: " + e);
            reject(e);
        }
    })
}
// --- (โค้ด 'exports.complete' จบที่นี่) ---

// --- (นี่คือฟังก์ชัน "offerDirect" (S5) ที่ "ขาดหายไป" (Missing)) ---
exports.offerDirect = (service, offerDirect) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceService.offerDirect() (S5) called with service: " + service._id + ", offerDirect: " + offerDirect._id);
            //Reject if service not in state IDLE
            if (service.state !== "IDLE") throw("Service not in state IDLE");
            //Set service state to MARKET
            service.state = "MARKET";
            //Add offerDirect to service
            service.offers.push(offerDirect);
            await service.save();
            logger.verbose("serviceService.offerDirect() (S5) service state set to MARKET: " + service._id);
            resolve(service);
        } catch (e) {
            logger.error("serviceService.offerDirect() (S5) error: " + e);
            reject(e);
        }
    })
}
