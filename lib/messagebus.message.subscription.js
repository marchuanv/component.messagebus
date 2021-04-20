const utils = require("utils");
function MessageBusMessageSubscription({ messageId, callback, callbackValidate }) {
    this.messageId = messageId;
    this.callback = callback;
    this.callbackValidate = callbackValidate? callbackValidate : () => true;
};
MessageBusMessageSubscription.prototype.validate = function() {
    if (!this.messageId) {
        throw new Error("messagebus message subscription requires an message Id value");
    }
    if (!this.callback) {
        throw new Error("messagebus message subscription requires a callback function");
    }
    if (!this.callbackValidate) {
        throw new Error("messagebus message subscription requires a callback validate function");
    }
};
MessageBusMessageSubscription.prototype.toString = function() {
    return utils.getJSONString(this.body);
};
module.exports = { MessageBusMessageSubscription };