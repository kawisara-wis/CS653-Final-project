const Service = require('../models/Service');
const emitter = require('../utils/events').eventEmitter;
const config = require("../config.json");
const logger = require('../utils/logger');

const {promises} = require('../utils/events');

const serviceConsumer = require("./Consumer");
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

exports.commence = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceService.commence() called with service: " + service._id);
            //Reject if service not in state MARKET
            if (service.state !== "MARKET") throw("Service not in state MARKET");
            service.state = "ACTIVE";
            logger.verbose("serviceService.commence() service state set to ACTIVE: " + service._id);
            let time = Math.floor(Date.now());
            service.startTimestamp = time;
            logger.debug("serviceService.commence() service startTimestamp set to time: " + service.startTimestamp);
            service.endTimestamp = time + service.duration;
            logger.debug("serviceService.commence() service endTimestamp set to time: " + service.endTimestamp);
            await service.save();
            logger.silly("serviceService.commence() serviceCommenced timer started: " + service._id);
            setTimeout(async () => {
                promises.push(this.complete(service));
            }, service.endTimestamp - time);
            resolve(service);
        } catch (e) {
            logger.error("serviceService.commence() error: " + e);
            reject(e);
        }
    })
}

exports.complete = (service) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.info("serviceService.complete() called with service: " + service._id);
            //Reject if service not in state ACTIVE
            if (service.state !== "ACTIVE") throw("Service not in state ACTIVE");
            service.state = "DONE";
            await service.save();
            //await service.save();
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

