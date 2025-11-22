// (นี่คือ services/Provider_S5.js เวอร์ชันที่แก้ไขบั๊ก ทั้ง 3 จุดแล้ว)

const Provider = require('../models/Provider_S5');
const Account = require('../models/Account');
const Consumer = require('../models/Consumer_S5');
const emitter = require('../utils/events').eventEmitter;
const config = require('../config.json');
exports.Provider = Provider;

const serviceService = require("./Service_S5");
const serviceOfferCapacity = require("./OfferCapacity");
const servicePoolCapacity = require("./PoolCapacity");

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const logger = require('../utils/logger'); 

// (ฟังก์ชัน 'create' ถูกต้องแล้ว)
exports.create = (account, options = {}) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.create() called with: accountId: " + account.id);
            if (!account) throw ("Account not defined");
            let provider = new Provider({
                account: account._id,
                agentType: options.agentType || 'random', 
                location: options.location || { x: 0, y: 0 }
            });
            await provider.save();
            logger.info(`serviceProvider.create() created provider with providerId: ${provider.id} (Type: ${provider.agentType})`);
            resolve(provider);
        } catch (e) {
            logger.error("serviceProvider.create() error: " + e);
            reject(e);
        }
    })
}


// (ฟังก์ชัน 'offerDirectReceive' (ตัว Switch) แก้ไขแล้ว)
exports.offerDirectReceive = (provider, offerDirect, consumer, decision) => {
    return new Promise(async (resolve, reject) => {
        try {
            const Consumer = require('../models/Consumer_S5');
            
            console.log('🔴 DEBUG: offerDirectReceive START!');
            console.log('  provider.id:', provider.id);
            console.log('  offerDirect.state:', offerDirect.state);                        
            
            logger.silly("serviceProvider.offerDirectReceive() (Switch) processing: " + offerDirect._id);
            if (!offerDirect) 
                throw new Error("offerDirect object is null in Switch");
            // ตรวจสอบ state
            if (offerDirect.state !== 'MARKET') {
                console.log('❌ SKIP: state is not MARKET!');
                return resolve(offerDirect);
                
            }

            // เรียก decision
            console.log('🟢 Calling decisionOfferDirect...');
            let decision = await decisionOfferDirect(provider, offerDirect, consumer);
            console.log('🟢 Decision:', decision);

            switch (decision) {
                case "accept": {

                    const serviceConsumer = require("./Consumer_S5"); 
                    
                    const fullProvider = await Provider.findById(provider._id);
                    if (!fullProvider) throw new Error("Could not re-load provider in offerDirectReceive");

                    // (โค้ด Transaction ที่ถูกต้อง)
                    let providerAccount = await Account.findById(fullProvider.account);
                    let consumerAccount = await Account.findById(offerDirect.seller);
                    let price = offerDirect.price;

                    if (!providerAccount || !consumerAccount) { throw new Error("Account not found"); }
                    if (!consumer) throw new Error("Consumer object was not passed correctly!"); 

                    const distance = calculateDistance(fullProvider.location, consumer.location);
                    const TRANSPORT_COST_PER_UNIT = 0.1;
                    const transportCost = distance * TRANSPORT_COST_PER_UNIT; 
                    const netProfit = price - transportCost; 

                    consumerAccount.balance -= price;
                    providerAccount.balance += netProfit; 

                    logger.info(`TRANSACTION (S5): Provider ${fullProvider._id} earned ${netProfit.toFixed(2)} ...`);
                    logger.info(`TRANSACTION (S5): Consumer ${consumer.id} spent ${price}.`);

                    await consumerAccount.save();
                    await providerAccount.save();

                    offerDirect = await serviceConsumer.offerDirectAccepted(consumer, offerDirect);
                    
                    let service = await serviceService.Service.findById(offerDirect.service);
                    
                    service.provider = fullProvider._id;
                    await service.save();
                    
                    if (service.state !== "MARKET") {
                        service.state = "MARKET";
                        await service.save();
                        logger.verbose(`Service ${service._id} state defensively set to MARKET by Provider ${fullProvider._id}`);
                    }
              
                    await serviceService.commence(service);
                }
                break;

                case "reject":{
                    // --- ❌ (นี่คือ "บั๊ก" ที่ 2: เพิ่ม 'require' ภายใน) ---
                    const serviceConsumer = require("./Consumer_S5"); 
                    offerDirect = await serviceConsumer.offerDirectRejected(offerDirect);
                    logger.silly("serviceProvider.offerDirectReceived() rejected offer direct: " + offerDirect._id);
                }
                break;
                case "postpone":{
                    const serviceOfferDirect = require("./OfferDirect_S5");
                    logger.silly("serviceProvider.offerDirectReceived() postponed offer direct: " + offerDirect.id);
                        break;
                    // 1. ❌ ต้องโหลด Provider ตัวเต็ม (เหมือนที่ทำใน 'case "accept"')
                    const fullProvider = await Provider.findById(provider.id);
                    if (!fullProvider) { logger.warn(`⚠️ SKIP postpone: Provider ${provider.id} not found`);
                        return resolve(offerDirect);
                    }
                    // 2. ❌ ต้องส่ง 'fullProvider' และ 'consumer' ต่อไปด้วย
                    let offerCapacity = await serviceOfferCapacity.create(offerDirect, 
                        clcOfferCapacityPrice(offerDirect, fullProvider, consumer), 
                        clcOfferCapacityExpiryTimestamp(offerDirect)
                    );
                }
                
            }
        resolve(offerDirect);
        } catch (e) {
            console.log('❌ ERROR in offerDirectReceive:', e.message);
            logger.error("serviceProvider.offerDirectReceived() error: " + e);
            reject(e);
        }
    })
}

// (ใน service/Provider_S5.js)

// (นี่คือฟังก์ชันแยก สำหรับรับงานจาก Pool - ฉบับแก้ไขสมบูรณ์)
exports.offerCapacityAccepted = (provider, offerCapacity) => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('🔴 DEBUG: offerCapacityAccepted START');
            console.log('  provider._id:', provider?._id);
            console.log('  provider.id:', provider?.id);
            console.log('  offerCapacity.id:', offerCapacity?.id);
            
            // ✅ ตรวจสอบ provider ID
            const providerId = provider._id || provider.id;
            if (!providerId) {
                throw new Error('Provider ID is missing!');
            }
            
            console.log('🔴 DEBUG: Finding provider with ID:', providerId);
            
            // ✅ findById ก่อน
            const fullProvider = await Provider.findById(providerId);
            console.log('🔴 DEBUG: Provider found?', fullProvider ? 'YES' : 'NO');
            
            if (!fullProvider) {
                throw new Error(`Provider not found with ID: ${providerId}`);
            }
            
            // ... เวลาจาก Pool - transaction logic ต่อจากนี้
            const serviceOfferDirect = require('./OfferDirect_S5');
            const serviceConsumer = require('./Consumer_S5');
            
            // 1. ดึง OfferDirect
            const offerDirect = await serviceOfferDirect.OfferDirect.findById(
                offerCapacity.offerDirect
            );
            if (!offerDirect) throw new Error("OfferDirect not found");
            
            // 2. ดึง Consumer
            const consumer = await serviceConsumer.Consumer.findOne({
                account: offerDirect.seller
            });
            if (!consumer) throw new Error("Consumer not found");
            
            // 3. Calculate profit
            const distance = calculateDistance(
                fullProvider.location,
                consumer.location
            );
            const TRANSPORT_COST = 0.1;
            const transportCost = distance * TRANSPORT_COST;
            const netProfit = offerDirect.price - transportCost;
            
            // 4. Transaction
            const providerAccount = await Account.findById(fullProvider.account);
            const consumerAccount = await Account.findById(offerDirect.seller);
            
            if (!providerAccount || !consumerAccount) {
                throw new Error("Account not found");
            }
            
            consumerAccount.balance -= offerDirect.price;
            providerAccount.balance += netProfit;
            
            await consumerAccount.save();
            await providerAccount.save();
            
            logger.info(
                `TRANSACTION (S5) - Pool: Provider ${fullProvider.id} earned ${netProfit.toFixed(2)}`
            );
            
            // 5. Update states
            offerDirect.state = "ACCEPTED";
            await offerDirect.save();
            
            const service = await Service.findById(offerDirect.service);
            service.provider = fullProvider.id;
            service.state = "MARKET";
            await service.save();
            
            await serviceService.commence(service);
            
            resolve(offerDirect);
        } catch (e) {
            console.log('❌ ERROR in offerCapacityAccepted:', e.message);
            logger.error(`offerCapacityAccepted error: ${e.message}`);
            reject(e);
        }
    })
}


// (ฟังก์ชัน 'offerCapacityPosted' ถูกต้องแล้ว)
exports.offerCapacityPosted = (provider, offerCapacity) => {
  // ... (โค้ดเดิมถูกต้อง)
}

// (ฟังก์ชัน 'getLLMDecision' แก้ไขแล้ว)
async function getLLMDecision(provider, offer) {
    const Consumer = require('../models/Consumer_S5');  // ← เพิ่มที่นี่
    const serviceOfferDirect = require("./OfferDirect_S5");
    const fullProvider = await Provider.findById(provider._id);
    if (!fullProvider) throw new Error("Could not re-load provider in getLLMDecision");

    logger.info(`[AI Agent ${fullProvider._id}] กำลังเรียก LLM (GPT-4o) (S5 Logic)...`); // <-- (แก้)

    let service = await serviceService.Service.findById(offer.service);
    let activeServices = await serviceService.Service.countDocuments({provider: fullProvider._id, state: "ACTIVE"}); // <-- (แก้)
    const freeSlots = fullProvider.servicesLimit - activeServices; // <-- (แก้)

    // (ใช้ 'serviceOfferDirect' ที่ 'require' มาอย่างถูกต้อง)
    const pastProcessedOffers = await serviceOfferDirect.OfferDirect.find({
        buyer: fullProvider.account, 
        state: { $in: ['ACCEPTED', 'REJECTED'] }
    }).sort({ createdAt: -1 }).limit(20);
    
    // (โค้ด 'historySummary' ถูกต้องแล้ว)
    let historySummary = { count_accepted: 0, count_rejected: 0, avg_price_accepted: 0 };
    // ... (โค้ดคำนวณ) ...

    const consumer = await Consumer.findOne({ account: offer.seller });
    if (!consumer) throw new Error("Consumer not found for location calculation");

    // (ใช้ 'fullProvider.location')
    const distance = calculateDistance(fullProvider.location, consumer.location); // <-- (แก้)

    const context = {
        free_slots: freeSlots,
        total_slots: fullProvider.servicesLimit, // <-- (แก้)
        offer_history: historySummary,
        current_offer: {
            price: offer.price,
            duration: service.duration,
            distance: parseFloat(distance.toFixed(2)) 
        }
    };

    // (โค้ด 'instructions' และ 'axios.post' ถูกต้องแล้ว)
    const TRANSPORT_COST_PER_UNIT = 0.1; 
    const instructions = `... WARNING: You must pay a transport cost of ${TRANSPORT_COST_PER_UNIT} ...`;
    
    const promptPayload = { context: context, instructions: instructions };

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo", 
            messages: [
                {
                    "role": "system",
                    "content": instructions // (ใส่ "คำสั่ง" ที่คุณสร้างไว้)
                },
                {
                    "role": "user",
                    "content": JSON.stringify(context) // (ใส่ "ข้อมูล" ที่คุณสร้างไว้)
                }
            ]
            //
        }, { headers: { 
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            }
        
        });

        const decisionText = response.data.choices[0].message.content.toUpperCase();
        logger.info(`[AI Agent ${fullProvider._id}] LLM ตอบว่า: ${decisionText}`); // <-- (แก้)

        if (decisionText.includes("ACCEPT")) return "accept";
        if (decisionText.includes("FORWARD")) return "postpone";
        return "reject";

    } catch (error) {
        logger.error(`[AI Agent ${fullProvider._id}] LLM Error:`, error.response ? error.response.data.error : error.message); // <-- (แก้)
        return "reject";
    }
}

// (ฟังก์ชัน 'decisionOfferDirect' (ตัว Split) แก้ไขแล้ว)
let decisionOfferDirect = (provider, offerDirect, consumer) => { // (รับ 'consumer' มาด้วย)
    return new Promise(async (resolve, reject) => {
        try {
            console.log('🔴 DEBUG: decisionOfferDirect START');
            console.log('  provider.agentType:', provider.agentType);
            logger.silly("serviceProvider.decisionOfferDirect() called with offerDirect: " + offerDirect._id);

            if (provider.agentType === 'ai') {
                logger.silly(`Provider ${provider._id} is AI type. Calling LLM.`);
                // (ส่ง 'consumer' ต่อไปที่ 'getLLMDecision' (ที่ไม่ได้ใช้))
                let decision = await getLLMDecision(provider, offerDirect, consumer); 
                return resolve(decision);
            }
            // Random logic
            console.log('🎲 Random Provider - Using random logic');
            // (โค้ด Random Logic ถูกต้องแล้ว)
            logger.silly(`Provider ${provider._id} is RANDOM type. Using random logic.`);
            let count = await serviceService.Service.countDocuments({provider: provider._id, state: "ACTIVE"});
            if (count >= provider.servicesLimit) {
                return resolve(chooseOutcome(0, 0.5, 0.5)); 
            }
            let decision = chooseOutcome(0.5, 0.1, 0.4); 
            // ... (โค้ดเช็ค 'accept' ซ้ำ) ...
            
            return resolve(decision);
        } catch (e) {
            console.log('❌ ERROR in decisionOfferDirect:', e.message);
            logger.error("serviceProvider.decisionOfferDirect() error: " + e);
            reject(e);
        }
    })
}

// (ฟังก์ชัน 'decisionOfferCapacity' และ 'chooseOutcome' ถูกต้องแล้ว)
let decisionOfferCapacity = (provider, offerCapacity) => {
    return new Promise(async (resolve, reject) => {
        try {
            logger.silly("serviceProvider.decisionOfferCapacity() called with offerCapacity: " + offerCapacity._id);
            
            // --- 1. ตรวจสอบ: นี่คือ Offer ที่ "ฉัน" (Provider คนนี้) ส่งเข้า Pool เองหรือเปล่า? ---
            // (Is offer capacity seller me?)
            if (offerCapacity.seller === provider.account) {
                logger.silly("serviceProvider.decisionOfferCapacity() offer capacity seller is me: " + provider.id);
                // (ถ้าใช่ ก็ไม่ต้องทำอะไร 'postpone' (ปล่อยผ่าน))
                return resolve("postpone");
            }

            // --- 2. ตรวจสอบ: "ฉัน" (Provider คนนี้) มี Slot ว่างหรือไม่? ---
            // (Do I have capacity to process service?)
            let count = await serviceService.Service.countDocuments({provider: provider._id, state: "ACTIVE"});
            if (count >= provider.servicesLimit) {
                logger.silly("serviceProvider.decisionOfferCapacity() provider capacity reached: " + provider.id);
                // (ถ้า Slot เต็ม ก็ 'postpone' (ปล่อยผ่าน))
                return resolve("postpone");
            }

            // --- 3. (ถ้า Slot ว่าง และไม่ใช่ Offer ของฉัน) ---
            // ให้ "สุ่ม" (Random) ว่าจะรับ Offer นี้จาก Pool หรือไม่
            // (50% 'accept' (รับงาน), 0% 'reject', 50% 'postpone' (ปล่อยผ่าน))
            return resolve(chooseOutcome(0.5, 0, 0.5));

        } catch (e) {
            logger.error("serviceProvider.decisionOfferCapacity() error: " + e);
            reject(e);
        }
    })
}

let chooseOutcome = (acceptProbability, rejectProbability, postponeProbability) => {
    // 1. ตรวจสอบ: เช็คว่าค่าความน่าจะเป็น (Probabilities) ที่ส่งมารวมกันได้ 1 (100%) หรือไม่
    // (Ensure the sum of probabilities is 1)
    if (acceptProbability + rejectProbability + postponeProbability !== 1) {
        // ถ้าไม่เท่ากับ 1 ให้คืนค่า Error (เพื่อป้องกันบั๊ก)
        logger.error(`chooseOutcome Error: Probabilities do not sum up to 1! (${acceptProbability}, ${rejectProbability}, ${postponeProbability})`);
        return 'Error: Probabilities must sum up to 1';
    }

    // 2. สุ่มตัวเลข (Generate a random number between 0 and 1)
    const randomNumber = Math.random(); // (เช่น 0.735)

    // 3. ตัดสินใจ (Determine the outcome based on the probabilities)
    
    // ถ้าตัวเลขสุ่ม (0.735) น้อยกว่า 'acceptProbability' (เช่น 0.5) -> (ไม่จริง)
    if (randomNumber < acceptProbability) {
        return 'accept';
    } 
    // (ถ้าไม่) เช็คว่าตัวเลขสุ่ม (0.735) น้อยกว่า (accept + reject) (เช่น 0.5 + 0.1 = 0.6) -> (ไม่จริง)
    else if (randomNumber < acceptProbability + rejectProbability) {
        return 'reject';
    } 
    // (ถ้าไม่) แสดงว่าตัวเลขสุ่ม (0.735) ตกอยู่ในช่วงสุดท้าย (0.6 - 1.0)
    else {
        return 'postpone';
    }
}

// ... (วางโค้ดนี้ก่อน clcOfferCapacityPrice)

/**
 * (ฟังก์ชันที่ขาดไป) คำนวณราคพื้นฐาน (Base Price)
 * สมมติว่าคิดจากระยะทาง + ค่าบริการเริ่มต้น
 */
let clcOfferPrice = (offerDirect, fullProvider, consumer) => {
  // เราใช้ fullProvider.location และ consumer.location
  // ฟังก์ชัน calculateDistance (ที่คุณมี) จะจัดการกรณี location เป็น null ให้เอง
  const distance = calculateDistance(fullProvider?.location, consumer?.location);

  // (นี่คือโลจิกตัวอย่าง คุณสามารถปรับได้ตามต้องการ)
  const BASE_FARE = 50; // ค่าบริการเริ่มต้น (สมมติ)
  const PRICE_PER_KM = 10; // (สมมติ)

  return BASE_FARE + (distance * PRICE_PER_KM);
};

/**
 * คำนวณราคา Capacity Price สำหรับ Provider_S5
 * ...
 */
/**
 * คำนวณราคา Capacity Price สำหรับ Provider_S5
 *
 * โลจิกของ S5 คือ:
 * 1. คำนวณราคพื้นฐาน (จาก clcOfferPrice)
 * 2. คำนวณ "น้ำหนักตามปริมาตร" (Volumetric Weight) โดยใช้ตัวหาร 5000
 * 3. เปรียบเทียบ "น้ำหนักจริง" (Actual Weight) กับ "น้ำหนักตามปริมาตร"
 * 4. นำค่าน้ำหนักที่ *สูงกว่า* (เรียกว่า Chargeable Weight) ไปคำนวณค่าบริการเพิ่มเติม (Surcharge)
 * 5. ราคาสุดท้าย = ราคพื้นฐาน + Surcharge
 */
let clcOfferCapacityPrice = (offerDirect, fullProvider, consumer) => {

  // --- 1. คำนวณราคพื้นฐาน ---
  // (สมมติว่า clcOfferPrice คำนวณจากระยะทางและประเภทรถ)
  const basePrice = clcOfferPrice(offerDirect, fullProvider, consumer);

  // --- 2. กฎเฉพาะของ Provider S5 ---
  // S5 ใช้ตัวหาร 5000 (มาตรฐานสากลสำหรับ กว้าง*ยาว*สูง เป็น cm)
  const S5_VOLUMETRIC_DIVISOR = 5000;

  // --- 3. ดึงข้อมูลน้ำหนักจริง และ มิติ (กว้างxยาวxสูง) ---
  // (ถ้าไม่มีค่า ให้เป็น 0)
  const actualWeight = offerDirect.weight || 0; // (kg)
  const length = offerDirect.length || 0; // (cm)
  const width = offerDirect.width || 0;  // (cm)
  const height = offerDirect.height || 0; // (cm)

  // --- 4. คำนวณน้ำหนักตามปริมาตร (Volumetric Weight) ---
  const volumetricWeight = (length * width * height) / S5_VOLUMETRIC_DIVISOR;

  // --- 5. หาน้ำหนักที่ใช้คิดเงิน (Chargeable Weight) ---
  // เลือกค่าที่สูงกว่า ระหว่าง น้ำหนักจริง กับ น้ำหนักปริมาตร
  const chargeableWeight = Math.max(actualWeight, volumetricWeight);

  // --- 6. คำนวณค่าบริการเพิ่มเติม (Surcharge) ตามเรทของ S5 ---
  // (นี่คือตารางราคาของ S5 ที่คิดตาม Chargeable Weight)
  let capacitySurcharge = 0;
  
  if (chargeableWeight > 100) { // เกิน 100 kg
    capacitySurcharge = 500; // บวกเพิ่ม 500
  } else if (chargeableWeight > 50) { // 50.01 - 100 kg
    capacitySurcharge = 300; // บวกเพิ่ม 300
  } else if (chargeableWeight > 20) { // 20.01 - 50 kg
    capacitySurcharge = 150; // บวกเพิ่ม 150
  }
  // หมายเหตุ: สมมติว่า basePrice ครอบคลุมน้ำหนัก 0-20 kg แรกอยู่แล้ว

  // --- 7. คืนค่าราคาสุดท้าย ---
  return basePrice + capacitySurcharge;
};

/**
 * คำนวณเวลาหมดอายุ (Expiry Timestamp) ของ Offer
 * สำหรับ Provider S5
 *
 * กฎของ S5 (สมมติฐาน): ราคา Offer ที่คำนวณได้ จะมีอายุ 30 นาที
 *
 * @param {object} offerDirect - อ็อบเจกต์ข้อเสนอ (อาจไม่ได้ใช้โดยตรงในฟังก์ชันนี้ 
 * แต่ควรมีไว้เป็นมาตรฐานเผื่อขยายโลจิกในอนาคต)
 * @returns {number} Unix Timestamp (milliseconds) ของเวลาที่จะหมดอายุ
 */
/**
 * คำนวณเวลาหมดอายุ (Expiry Timestamp) ของ Offer
 * สำหรับ Provider S5
 *
 * 🛑 [แก้ไข] กฎใหม่: เวลาหมดอายุของ OfferCapacity (ที่ส่งเข้า Pool)
 * จะต้อง "ไม่นานกว่า" เวลาหมดอายุของ OfferDirect (ต้นฉบับ)
 *
 * @param {object} offerDirect - อ็อบเจกต์ข้อเสนอ "ต้นฉบับ" (จาก Consumer)
 * @returns {number} Unix Timestamp (milliseconds) ของเวลาที่จะหมดอายุ
 */
let clcOfferCapacityExpiryTimestamp = (offerDirect) => {
  // --- กฎเฉพาะของ Provider S5 ---
  // (S5 ต้องการให้ Offer ของตัวเองอยู่ในตลาดนาน 30 นาที)
  const S5_OFFER_VALIDITY_MINUTES = 30;

  // 1. คำนวณเวลาหมดอายุที่ Provider S5 "ต้องการ" (NOW + 30 นาที)
  const now = new Date();
  now.setMinutes(now.getMinutes() + S5_OFFER_VALIDITY_MINUTES);
  const providerExpiryTime = now.getTime(); // เช่น 1800000 (ใน log)

  // 2. ดึงเวลาหมดอายุของ Offer "ต้นฉบับ" (จาก Consumer)
  // (นี่คือ 'expiryTimestamp' ที่ถูกส่งมาจาก Consumer)
  // (ตัวแปรนี้มีอยู่แล้วใน offerDirect ที่ส่งเข้ามา)
  const originalOfferExpiryTime = offerDirect.expiryTimestamp; // (เช่น อาจจะเป็น 300000)

  // 3. 🛑 เลือกเวลาที่ "น้อยกว่า" (หมดอายุก่อน)
  // เพื่อให้เป็นไปตามกฎ "Expiry timestamp cannot be greater than offer direct expiry timestamp"
  // Math.min(1800000, 300000) จะได้ 300000
  const finalExpiryTime = Math.min(providerExpiryTime, originalOfferExpiryTime);

  // 4. คืนค่าเวลาที่ถูกต้อง (ซึ่งตอนนี้จะไม่ละเมิดกฎแล้ว)
  return finalExpiryTime;
};

/**
 * คำนวณระยะทาง (Distance) (สูตรพีทาโกรัส)
 */
function calculateDistance(loc1, loc2) {
    // ตรวจสอบว่ามี location data
    if (!loc1 || !loc2 || loc1.x === undefined || loc2.x === undefined) {
        logger.warn("CalculateDistance: Location data is missing. Returning 0.");
        
        // --- ❌ (นี่คือ "บั๊ก" (Bug) ที่ 1: 'return 0' ที่ขาดไป) ---
        return 0; // (ต้อง 'return 0' เสมอ ถ้าหาไม่เจอ)
        // ---
    }

    const dx = loc1.x - loc2.x;
    const dy = loc1.y - loc2.y;
    // $Distance = \sqrt{ (P_x - C_x)^2 + (P_y - C_y)^2 }$
    return Math.sqrt(dx * dx + dy * dy); 
}

