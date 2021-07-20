const utils = require("utils");
function MessageBusSubscription() {
    this.Id = Id || utils.generateGUID();
    this.channels = [];
    this.callback = null;
    this.callbackValidate = () => true;
};
MessageBusSubscription.prototype.validate = function() {
    if (!this.channels || !Array.isArray(this.channels)) {
        throw new Error("messagebus subscription requires a channels array");
    }
    if (!this.callback || typeof this.callback !== "function") {
        throw new Error("messagebus subscription requires a callback function");
    }
    if (!this.callbackValidate || typeof this.callbackValidate !== "function") {
        throw new Error("messagebus subscription requires a callback validate function");
    }
};
module.exports = { MessageBusSubscription };