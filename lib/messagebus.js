const { Communication, CommunicationIncomingMessage, CommunicationOutgoingMessage, CommunicationResponseMessage } = require("component.communication");
const utils = require("utils");
const config = require("../package.json");
const { MessageBusMessage } = require("./messagebus.message.js");
const { MessageBusSubscription } = require("./messagebus.subscription.js");

const communication = new Communication(config.component);
let currentControlId = null;
const callstack = [];

const decodeControlId = (controlId) => {
    const Id = utils.base64ToString(controlId);
    return {
        context: Id.split("COMPONENT:")[1].split("GUID:")[0],
        guid: Id.split("GUID:")[1]
    };
};

const matchCurrentControlId = (controlId) => {
    const currentControlIdDecoded = decodeControlId(currentControlId);
    const controlIdDecoded = decodeControlId(controlId);
    return currentControlIdDecoded.context === controlIdDecoded.context;
};

const releaseControl = (controlId) => {
    if (matchCurrentControlId(controlId)) {
        currentControlId = null;
    }
};

const generateControlId = (component) => {
    const controlId = `COMPONENT:[${component}]GUID:[${utils.generateGUID()}]`;
    return utils.stringToBase64(controlId);
};


const addToCallstack = ({ Id, component }) => {
    callstack.unshift({ Id, component });
};

function MessageBus() {
    this.subscribers = [];
    communication.receive(async (incomingCommMessage) => {
        if (incomingCommMessage instanceof CommunicationIncomingMessage) {
            
            const incomingMessageBusMessage = new MessageBusMessage(incomingCommMessage);
            incomingMessageBusMessage.validate();

            const messageSubscribers = this.subscribers.filter(s => s.channel === incomingMessageBusMessage.channel);
            if (messageSubscribers.length > 0) {
                const outgoingMessages = [];
                for(const messageSubscriber of messageSubscribers) {
                    if (await messageSubscriber.callbackValidate(incomingMessageBusMessage)) {
                        const receivedMessage = await messageSubscriber.callback(incomingMessageBusMessage);
                        if (receivedMessage && receivedMessage instanceof MessageBusMessage) {
                            const Id = receivedMessage.Id;
                            const headers = receivedMessage.clone(true);
                            const body = receivedMessage.clone(false);
                            const status = receivedMessage.status;
                            const responseMessage = new CommunicationResponseMessage({ Id, headers, body, status });
                            responseMessage.validate();
                            outgoingMessages.push(responseMessage);
                        } else {
                            return new CommunicationResponseMessage({
                                Id: incomingMessageBusMessage.Id,
                                headers: {},
                                body: {},
                                status: "Error"
                            });
                        }
                    }
                };
                if (outgoingMessages.length > 0) {
                    return outgoingMessages[0];
                }
                return new CommunicationResponseMessage({
                    Id: incomingMessageBusMessage.Id,
                    headers: {},
                    body: {},
                    status: "Error"
                });
            } else {
                return new CommunicationResponseMessage({
                    Id: incomingMessageBusMessage.Id,
                    headers: {},
                    body: {},
                    status: "Error"
                });
            }
        } else {
            return new CommunicationResponseMessage({
                Id: incomingMessageBusMessage.Id,
                headers: {},
                body: {},
                status: "Error"
            });
        }
    });
};

MessageBus.prototype.inCallstack = async function ({ context, success = true }) {
    return callstack.find(csi => csi.context === context && csi.success === success);
};

MessageBus.prototype.getCallstack = async function  ({ context, latest = true }) {
    const clonedCallstack = utils.getJSONObject(utils.getJSONString(callstack));
    let { Id } = clonedCallstack.find(csi => csi.context === context) || {}; //get the first element in the array
    if (!latest) {
        clonedCallstack.reverse();
        ({ Id } = clonedCallstack.find(csi => csi.context === context) || {}); //get the first element in the array after reversing
        clonedCallstack.reverse(); //restore the original order
    }
    return clonedCallstack.filter(csi => csi.Id === Id);
};

MessageBus.prototype.subscribe = async function (message)  {
    if (message instanceof MessageBusSubscription) {
        try {
            message.validate();
            this.subscribers.push(message);
        } catch (err) {
            console.log(err);
        }
    } else {
        throw new Error("message parameter is not of type: MessageBusSubscription");
    }
};

MessageBus.prototype.publish = async function (message) {
    if (message instanceof MessageBusMessage) {
        try {
            
            const headers = message.clone(true);
            const body = message.clone(false);

            let controlId = generateControlId(message.Id);
            if (currentControlId) {
                if (matchCurrentControlId(controlId)) { //wait until control is released
                    return setTimeout(async () => {
                        await resolve(await module.exports.publish(message));
                    },1000);
                }
            } else {
                currentControlId = controlId;
            }
            addToCallstack({
                Id : currentControlId,
                component: body.channel
            });
            releaseControl(controlId);
          
            const messageToSend = new CommunicationOutgoingMessage({ Id: message.Id, headers, body });
            messageToSend.validate();

            const receivedMessage = await communication.send(messageToSend);
            if (receivedMessage instanceof CommunicationResponseMessage) {
                const { statusCode, statusMessage } = receivedMessage;
                if (statusCode < 200 && statusCode > 299) {
                    throw new Error(`failed to publish message id ${body.Id} to the ${body.channel} channel. Error: ${statusCode} ${statusMessage}`);
                }
            } else {
                throw new Error("received message is not of type: CommunicationResponseMessage");
            }
           
        } catch (err) {
            if (currentControlId) {
                releaseControl(currentControlId);
            }
           throw err;
        }
    } else {
        throw new Error("message parameter is not of type: MessageBusMessage");
    }
};
module.exports = { MessageBusSubscription, MessageBusMessage, MessageBus };