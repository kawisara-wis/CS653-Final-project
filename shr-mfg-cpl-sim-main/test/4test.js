/**
 * Test 4
 *
 * Number of consumers: 10
 * Number of providers: 5
 * Time of simulation: 100000 units
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

const {promises} = require('../utils/events')
mongoose.connect(config.db.url).then(async () => {
    //Drop account collection
    try {
        //Drop account collection
        await serviceAccount.Account.deleteMany({});
        await serviceConsumer.Consumer.deleteMany({});
        await serviceService.Service.deleteMany({});
        await serviceProvider.Provider.deleteMany({});
        await serviceOfferDirect.OfferDirect.deleteMany({});

        let providers = [];
        for(let i = 0; i < 5; i++){
            providers.push(await serviceProvider.create(await serviceAccount.create()));
        }
        let consumers = [];
        for(let i = 0; i < 10; i++){
           consumers.push(await serviceConsumer.create(await serviceAccount.create()));
        }

        for(let i = 0; i < 10; i++){
            await serviceConsumer.rentService(consumers[i]);
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

