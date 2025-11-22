/**
 * Test 4 (MODIFIED)
 *
 * การทดลอง 4 Randoms vs 1 AI (ตาม Scenario 4 )
 * Number of consumers: 25
 * Number of providers: 5 (4 Random, 1 AI)
 * Time of simulation: 10000 units
 *
 */

const config = require('../config.json');

const {mongoose} = require('mongoose');

const FakeTimers = require("@sinonjs/fake-timers");
const clock = FakeTimers.install();

const serviceAccount = require('../services/Account');
const serviceConsumer = require('../services/Consumer');
const serviceProvider = require('../services/Provider');
const serviceOfferDirect = require('../services/OfferDirect');
const serviceService = require('../services/Service');
const serviceOfferCapacity = require("../services/OfferCapacity");
const servicePoolCapacity = require("../services/PoolCapacity");

const {promises} = require('../utils/events');

// --- เปลี่ยน 2 บรรทัดนี้ (ตาม Scenario 4 [cite: 701]) ---
let numConsumers = 5; //sc2=25 sc3=5
let numProviders = 5; // sc2=5 sc3=5
let simulationTime = 10000; // cs3=10000
// --- สิ้นสุด ---

mongoose.connect(config.db.url).then(async () => {
    //Drop account collection
    try {
        console.log("--- เริ่มการล้างฐานข้อมูล ---");
        await serviceAccount.Account.deleteMany({});
        await serviceConsumer.Consumer.deleteMany({});
        await serviceService.Service.deleteMany({});
        await serviceProvider.Provider.deleteMany({});
        await serviceOfferDirect.OfferDirect.deleteMany({});
        await serviceOfferCapacity.OfferCapacity.deleteMany({});
        await servicePoolCapacity.PoolCapacity.deleteMany({});
        console.log("--- ฐานข้อมูลสะอาดแล้ว ---");


        // --- แก้ไข Logic การสร้าง Provider ---
        console.log("--- กำลังสร้าง Agents ---");
        let providers = [];
        
        // สร้าง 4 Random Agents
        for(let i = 0; i < numProviders - 1; i++){
            let acc = await serviceAccount.create();
            // agentType จะเป็น 'random' อัตโนมัติ (จาก Model ที่เราแก้)
            providers.push(await serviceProvider.create(acc)); 
        }

        // สร้าง 1 AI Agent
        let accAI = await serviceAccount.create();
        // ส่ง { agentType: 'ai' } เข้าไปใน options ตอนสร้าง
        let providerAI = await serviceProvider.create(accAI, { agentType: 'ai' }); 
        providers.push(providerAI);
        
        console.log(`--- สร้าง Providers เสร็จแล้ว (ทั้งหมด ${providers.length} ตัว) ---`);
        // --- สิ้นสุดการแก้ไข ---


        let consumers = [];
        for(let i = 0; i < numConsumers; i++){
           consumers.push(await serviceConsumer.create(await serviceAccount.create()));
        }
        console.log(`--- สร้าง Consumers เสร็จแล้ว (ทั้งหมด ${consumers.length} ตัว) ---`);


        //Create a pool capacity
        let poolCapacity = await servicePoolCapacity.create();
        console.log("--- สร้าง Pool (ตลาดกลาง) 1 อัน ---");

        //Add providers to pool capacity
        for(let provider of providers){
            await servicePoolCapacity.addProvider(poolCapacity, provider);
        }
        console.log(`--- ลงทะเบียน Provider ทั้ง ${providers.length} ตัวเข้า Pool ---`);


        for(let consumer of consumers){
            await serviceConsumer.rentService(consumer);
        }
        console.log(`--- Consumers ทั้ง ${consumers.length} ตัว เริ่มร้องขอ service ---`);


        console.log("--- เริ่มการจำลองเวลา 10000 ticks ---");
        for (let i = 0; i < 10000; i++) {
            await clock.tickAsync(1);
            //Flush all promises in queue
            await Promise.all(promises);
        }
        console.log("--- การจำลองเสร็จสิ้น ---");

    } catch (e) {
        console.log(e);
    }
});