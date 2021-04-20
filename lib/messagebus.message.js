const utils = require("utils");
function MessageBusMessage({ Id, headers, body, statusCode, statusMessage, channel, success }) {
    this.Id = Id;
    this.headers = headers;
    this.body = body;
    this.body = utils.getJSONObject(this.toString()) || {};
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.channel = channel ||  this.body.channel;
    this.success = success;
};
MessageBusMessage.prototype.validate = function() {
    if (!this.Id) {
        throw new Error("messagebus message requires an Id");
    }
    if (!this.headers) {
        throw new Error("messagebus message requires valid headers");
    }
    if (!this.body) {
        throw new Error("messagebus message requires a body");
    }
    if (typeof this.body !== "object") {
        throw new Error("messagebus message requires a valid body");
    }
    if (this.success === undefined) {
        throw new Error("messagebus message requires a success boolen value");
    }
    if (!this.channel) {
        throw new Error("messagebus message requires a channel");
    }
};
MessageBusMessage.prototype.toString = function() {
    return utils.getJSONString(this.body);
};
module.exports = { MessageBusMessage };