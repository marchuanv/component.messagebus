function MessageBusSubscription({ callback, callbackValidate }) {
    this.channels = [];
    this.callback = callback;
    this.callbackValidate = callbackValidate? callbackValidate : () => true;
};
MessageBusSubscription.prototype.validate = function() {
    if (!this.channels) {
        throw new Error("messagebus subscription requires channels");
    }
    if (!this.callback) {
        throw new Error("messagebus subscription requires a callback function");
    }
    if (!this.callbackValidate) {
        throw new Error("messagebus subscription requires a callback validate function");
    }
};
module.exports = { MessageBusSubscription };