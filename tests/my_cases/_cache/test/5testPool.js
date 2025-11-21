/**
 * Test 4
 *
 * Number of consumers: 2
 * Number of providers: 2
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

const {promises} = require('../utils/events')

let numConsumers = 2;
let numProviders = 2;

mongoose.connect(config.db.url).then(async () => {
    //Drop account collection
    try {
        //Drop account collection
        await serviceAccount.Account.deleteMany({});
        await serviceConsumer.Consumer.deleteMany({});
        await serviceService.Service.deleteMany({});
        await serviceProvider.Provider.deleteMany({});
        await serviceOfferDirect.OfferDirect.deleteMany({});
        await serviceOfferCapacity.OfferCapacity.deleteMany({});
        await servicePoolCapacity.PoolCapacity.deleteMany({});

        let providers = [];
        for(let i = 0; i < numProviders; i++){
            providers.push(await serviceProvider.create(await serviceAccount.create()));
        }

        let consumers = [];
        for(let i = 0; i < numConsumers; i++){
           consumers.push(await serviceConsumer.create(await serviceAccount.create()));
        }

        //Create a pool capacity
        let poolCapacity = await servicePoolCapacity.create();
        //Add providers to pool capacity
        for(let provider of providers){
            await servicePoolCapacity.addProvider(poolCapacity, provider);
        }

        for(let consumer of consumers){
            await serviceConsumer.rentService(consumer);
        }

        for (let i = 0; i < 10000; i++) {
            await clock.tickAsync(1);
            //Flush all promises in queue
            await Promise.all(promises);

        }
    } catch (e) {
        console.log(e);
    }

        // clock.tickAsync(3000);
});


//
// clock.tick(5000);
// clock.runAllAsync();
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
//
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
//
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);
// clock.tick(1000);

