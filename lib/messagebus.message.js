const utils = require("utils");
function MessageBusMessage({ Id, headers, body, statusCode, statusMessage, callback, callbackValidate, subscriptionId }) {
    this.Id = Id;
    this.headers = headers;
    this.body = body;
    this.body = utils.getJSONObject(this.toString()) || {};
    this.statusCode =  statusCode;
    this.statusMessage =  statusMessage;
    this.subscriptionId = subscriptionId || this.body.subscriptionId || null;
    this.callback = callback;
    this.callbackValidate = callbackValidate? callbackValidate : () => true;
};
MessageBusMessage.prototype.validate = function() {
    if (!this.headers) {
        throw new Error("messagebus message requires valid headers");
    }
    if (!this.body) {
        throw new Error("messagebus message requires a body");
    }
    if (typeof this.body !== "object") {
        throw new Error("messagebus message requires a valid body");
    }
    if (!this.Id) {
        throw new Error("messagebus message requires a valid Id");
    }
    if (this.subscriptionId && !this.callback) {
        throw new Error("messagebus message requires a callback function");
    }
    if (!this.callbackValidate) {
        throw new Error("messagebus message requires a callback validate function");
    }
    if (!this.statusCode) {
        throw new Error("messagebus message requires a valid statusCode");
    }
    if (!this.statusMessage) {
        throw new Error("messagebus message requires a valid statusMessage");
    }
};
MessageBusMessage.prototype.toString = function() {
    return utils.getJSONString(this.body);
};
module.exports = { MessageBusMessage };