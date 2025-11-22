const mongoose = require("mongoose");
const config = require("../config");
const  mongooseHistory = require('mongoose-history');

const providerSchema =new mongoose.Schema( {
        //Cross-reference to Account schema
        account: {type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true},
        //Cross-reference to Service schema
        services: [{type: mongoose.Schema.Types.ObjectId, ref: 'Service'}],
        //Max services
        servicesLimit: {type: Number, default: config.provider.servicesLimit},
        createdAt: {type: Date, default: Date.now},
        updatedAt: {type: Date, default: Date.now}
    },
);

providerSchema.pre('save', function (next) {
    if (this.isNew) {
        this.createdAt = new Date(); // Or your custom timestamp
    } else {
        this.updatedAt = new Date(); // Or your custom timestamp
    }
    next();
});

providerSchema.plugin(mongooseHistory)

module.exports = mongoose.model('Provider', providerSchema);