const utils = require("utils");
function MessageBusMessage({ Id, headers, body, data, statusCode, statusMessage, channel, success }) {
    this.Id = Id;
    this.headers = headers;
    this.data = data || body || {};
    this.data = utils.getJSONObject(this.toString());
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.channel = channel ||  this.data.channel;
    this.success = success;
};
MessageBusMessage.prototype.validate = function() {
    if (!this.Id) {
        throw new Error("messagebus message requires an Id");
    }
    if (!this.headers) {
        throw new Error("messagebus message requires valid headers");
    }
    if (!this.data) {
        throw new Error("messagebus message requires data");
    }
    if (typeof this.data !== "object") {
        throw new Error("messagebus message requires valid data");
    }
    if (this.success === undefined) {
        throw new Error("messagebus message requires a success boolen value");
    }
    if (!this.channel) {
        throw new Error("messagebus message requires a channel");
    }
};
MessageBusMessage.prototype.toString = function() {
    if (typeof this.body === "object") {
        return utils.getJSONString(this.data);    
    } else {
        return this.data;
    }
};
module.exports = { MessageBusMessage };