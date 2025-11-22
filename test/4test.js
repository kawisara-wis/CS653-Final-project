/// Test - SCENARIO 1 & 2  
const config = require('../config.json');

const {mongoose} = require('mongoose');

const FakeTimers = require("@sinonjs/fake-timers");
const clock = FakeTimers.install();

const serviceAccount = require('../services/Account');
const serviceConsumer = require('../services/Consumer');
const serviceProvider = require('../services/Provider');
const serviceOfferDirect = require('../services/OfferDirect');
const serviceService = require('../services/Service');

const {promises} = require('../utils/events')

// --- ตั้งค่า Scenario 1 ---
//let numConsumers = 5;
//let numProviders = 5;
//let simulationTime = 100000; // เพิ่มเวลาจำลองตามงานวิจัย
// ---
/**
 * Test - SCENARIO 2 (MODIFIED)
 *
 * Number of consumers: 25
 * Number of providers: 5 (4 Random, 1 AI)
 * Time of simulation: 100000 units
 * NO POOL
 */
// ... (imports) ...

// --- ตั้งค่า Scenario 2  ---
let numConsumers = 25; // (เปลี่ยนจาก 5 เป็น 25)
let numProviders = 5;
let simulationTime = 100000;
// ---
mongoose.connect(config.db.url).then(async () => {
    //Drop account collection
    try {
        console.log("--- SCENARIO 1: 4 Random vs 1 AI (No Pool) ---");
        await serviceAccount.Account.deleteMany({});
        await serviceConsumer.Consumer.deleteMany({});
        await serviceService.Service.deleteMany({});
        await serviceProvider.Provider.deleteMany({});
        await serviceOfferDirect.OfferDirect.deleteMany({});
        
        console.log("--- กำลังสร้าง Agents ---");
        let providers = [];
        
        // สร้าง 4 Random Agents
        for(let i = 0; i < numProviders - 1; i++){
            let acc = await serviceAccount.create();
            providers.push(await serviceProvider.create(acc)); 
        }

        // สร้าง 1 AI Agent
        let accAI = await serviceAccount.create();
        let providerAI = await serviceProvider.create(accAI, { agentType: 'ai' }); 
        providers.push(providerAI);
        
        console.log(`--- สร้าง Providers ${providers.length} ตัว (Limit: 1 slot) ---`);

        let consumers = [];
        for(let i = 0; i < numConsumers; i++){
           consumers.push(await serviceConsumer.create(await serviceAccount.create()));
        }
        console.log(`--- สร้าง Consumers ${consumers.length} ตัว ---`);

        for(let consumer of consumers){
            await serviceConsumer.rentService(consumer);
        }
        console.log(`--- Consumers ทั้ง ${consumers.length} ตัว เริ่มร้องขอ service ---`);


        console.log(`--- เริ่มการจำลองเวลา ${simulationTime} ticks ---`);
        for (let i = 0; i < simulationTime; i++) {
            await clock.tickAsync(1);
            //Flush all promises in queue
            await Promise.all(promises);
        }
        console.log("--- การจำลองเสร็จสิ้น ---");

    } catch (e) {
        console.log(e);
    }
});