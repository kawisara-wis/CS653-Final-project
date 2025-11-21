/**
 * Test 1
 *
 * Number of consumers: 5
 * Number of providers: 1
 * Time of simulation: 20000 units
 *
 * Provider random offerDirect response [accept/reject/expire]
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

        let consumer1 = await serviceConsumer.create(await serviceAccount.create());
        let consumer2 = await serviceConsumer.create(await serviceAccount.create());
        let consumer3 = await serviceConsumer.create(await serviceAccount.create());
        let consumer4 = await serviceConsumer.create(await serviceAccount.create());

        let provider1 = await serviceProvider.create(await serviceAccount.create());
        let provider2 = await serviceProvider.create(await serviceAccount.create());
        let provider3 = await serviceProvider.create(await serviceAccount.create());
        let provider4 = await serviceProvider.create(await serviceAccount.create());

        await serviceConsumer.rentService(consumer1);
        await serviceConsumer.rentService(consumer2);
        await serviceConsumer.rentService(consumer3);
        await serviceConsumer.rentService(consumer4);
        //
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

