function MessageBusSubscription({ callback, callbackValidate }) {
    this.channel = null;
    this.callback = callback;
    this.callbackValidate = callbackValidate? callbackValidate : () => true;
};
MessageBusSubscription.prototype.validate = function() {
    if (!this.channel) {
        throw new Error("messagebus subscription requires an channel");
    }
    if (!this.callback) {
        throw new Error("messagebus subscription requires a callback function");
    }
    if (!this.callbackValidate) {
        throw new Error("messagebus subscription requires a callback validate function");
    }
};
module.exports = { MessageBusSubscription };