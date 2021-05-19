const utils = require("utils");
const MessageBusMessageStatus = require("./messagebus.message.status.js");
const { CommunicationStatus } = require("component.communication");

const extendedMessages = [];

function MessageBusMessage({ Id, headers, body, status, statusCode }) {
    this.Id = Id || utils.generateGUID();
    this.status = (MessageBusMessageStatus[status] || CommunicationStatus[statusCode]) || MessageBusMessageStatus.None;
    if (headers) {
        for(const property in headers) {
            this.extend({
                propertyName: property,
                propertyValue: headers[property],
                isHeader: true
            });
        };
    }
    if (body) {
        for(const property in body) {
            this.extend({
                propertyName: property,
                propertyValue: body[property],
                isHeader: false
            });
        };
    }
    this.setProperties();
};

MessageBusMessage.prototype.validate = function() {
    if (!this.Id) {
        throw new Error("messagebus message requires a valid id");
    }
    if (!this.status || (this.status && MessageBusMessageStatus[this.status] === undefined) ) {
        throw new Error("messagebus message requires a valid status");
    }
    if (!this.getProperties().find(prop => prop.name === "channel" && prop.value)) {
        throw new Error("messagebus message requires a valid channel");
    }
};

MessageBusMessage.prototype.extend = function({ propertyName, propertyValue, isHeader = false }) {
    if (!propertyName) {
        throw new Error("propertyName is required");
    }
    if (propertyName && !propertyValue) {
        throw new Error(`${propertyName} has no value`);
    }
    const extendedMessageProperties = this.getProperties();
    let messageProperty = extendedMessageProperties.find(extM => extM.name === propertyName);
    
    if (messageProperty) { //overwrite
        messageProperty.value = propertyValue;
        messageProperty.isHeader = isHeader;
    } else {
        messageProperty = {
            Id: this.Id,
            name: propertyName,
            value: propertyValue,
            isHeader
        };
        extendedMessages.push(messageProperty);
    }
    this.setProperties();
};
MessageBusMessage.prototype.clone = function(headersOnly) {
    this.setProperties();
    const clonedMessage = {};
    for(const property of this.getProperties(headersOnly)) {
        clonedMessage[property.name] = property.value;
    };
    return clonedMessage;
};
MessageBusMessage.prototype.update = function(message) {
    if (message instanceof MessageBusMessage) {
        for(const property of this.getProperties()) {
            this[property.name] = property.value;
        };
        this.setProperties();
    } else {
        throw new Error("messagebus message is not of type: MessageBusMessage");
    }
};
MessageBusMessage.prototype.getProperties = function(headersOnly) {
    return extendedMessages.filter(extM => extM.Id === this.Id && ((headersOnly !== undefined && extM.isHeader === headersOnly) || headersOnly === undefined) );
};
MessageBusMessage.prototype.setProperties = function() {
    for(const property of this.getProperties()) {
        this[property.name] = property.value;
    };
};
MessageBusMessage.prototype.getBody = function() {
    return utils.getJSONString(this.clone(false));
};
MessageBusMessage.prototype.getHeaders = function() {
    return utils.getJSONString(this.clone(true));
};
module.exports = { MessageBusMessage };