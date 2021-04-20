const utils = require("utils");
function MessageBusMessage({ Id, headers, body, statusCode, statusMessage, success }) {
    this.Id = Id;
    this.headers = headers;
    this.body = body;
    this.body = utils.getJSONObject(this.toString()) || {};
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.success = success;
};
MessageBusMessage.prototype.validate = function() {
    if (!this.Id) {
        throw new Error("messagebus message requires a valid Id");
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
};
MessageBusMessage.prototype.toString = function() {
    return utils.getJSONString(this.body);
};
module.exports = { MessageBusMessage };