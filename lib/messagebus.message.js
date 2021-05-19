const utils = require("utils");
const MessageBusMessageStatus = require("./messagebus.message.status.js");
const { CommunicationStatus } = require("component.communication");

let extendedMessages = [];

function MessageBusMessage({ Id, headers, body, status, statusCode }) {
    this.Id = Id || utils.generateGUID();
    status = MessageBusMessageStatus[status] || CommunicationStatus[statusCode] || MessageBusMessageStatus.None;
    this.defineProperty({
        name: "status",
        value: status,
        isHeader: false
    });
    if (headers) {
        for(const property in headers) {
            this.defineProperty({
                name: property,
                value: headers[property],
                isHeader: true
            });
        };
    }
    if (body) {
        for(const property in body) {
            this.defineProperty({
                name: property,
                value: body[property],
                isHeader: false
            });
        };
    }
};

MessageBusMessage.prototype.validate = function() {
    if (!this.Id) {
        throw new Error("messagebus message requires a valid id");
    }
    if (!this.status || (this.status && MessageBusMessageStatus[this.status] === undefined) ) {
        throw new Error("messagebus message requires a valid status");
    }
    if (!this.getProperties({}).find(prop => prop.name === "channel" && prop.value)) {
        throw new Error("messagebus message requires a valid channel");
    }
};

MessageBusMessage.prototype.defineProperty = function({ name, value, isHeader = false }) {
    if (!name) {
        throw new Error("propertyName is required");
    }
    if (name && !value) {
        throw new Error(`${name} has no value`);
    }

    name = name.toLowerCase();

    let thisExtendedMessageProperties = this.getProperties({});
    thisExtendedMessageProperties = thisExtendedMessageProperties.filter(p => p.name !== name);
    extendedMessages = extendedMessages.filter(p => p.Id !== this.Id);
    extendedMessages = extendedMessages.concat(thisExtendedMessageProperties);
    let newId = name === "Id"? value : this.Id;
    let newProperty = this.getProperties({ name })[0] || { Id: newId, name, value, isHeader };
    extendedMessages.push(newProperty);
    if (Object.getOwnPropertyNames(this).find(propName => propName === name)) {
        this[name] = value;
    } else {
        Object.defineProperty(this, name, {
            get : () => this.getProperties({ name })[0].value,
            set : (value) => { 
                this.getProperties({ name })[0].value = value;
            }
        });
    }
};
MessageBusMessage.prototype.clone = function(headersOnly) {
    const clonedMessage = {};
    for(const property of this.getProperties({headersOnly})) {
        clonedMessage[property.name] = property.value;
    };
    return clonedMessage;
};
MessageBusMessage.prototype.update = function(message) {
    if (message instanceof MessageBusMessage) {
        for(const property of message.getProperties({})) {
            this.defineProperty({ name: property.name, value: property.value, isHeader: property.isHeader});
        };
    } else {
        throw new Error("messagebus message is not of type: MessageBusMessage");
    }
};
MessageBusMessage.prototype.getProperties = function( { headersOnly, name }) {
    return extendedMessages.filter(extM => extM.Id === this.Id 
        && ((headersOnly !== undefined && extM.isHeader === headersOnly) || headersOnly === undefined) 
        && ( (name && extM.name === name) || name === undefined)
    );
};
MessageBusMessage.prototype.getBody = function() {
    return utils.getJSONString(this.clone(false));
};
MessageBusMessage.prototype.getHeaders = function() {
    return utils.getJSONString(this.clone(true));
};
module.exports = { MessageBusMessage };