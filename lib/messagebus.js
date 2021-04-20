const { Communication, CommunicationMessage } = require("component.communication");
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
        const incomingMessageBusMessage = new MessageBusMessage(incomingCommMessage);
        incomingMessageBusMessage.success = true;
        incomingMessageBusMessage.validate();
        const messageSubscribers = this.subscribers.filter(s => s.channel === incomingMessageBusMessage.channel);
        if (messageSubscribers.length > 0) {
            const subscriberMessages = [];
            for(const messageSubscriber of messageSubscribers) {
                if (await messageSubscriber.callbackValidate(incomingMessageBusMessage)) {
                    const message = await messageSubscriber.callback(incomingMessageBusMessage);
                    const outgoingMessageBusMessage = new MessageBusMessage(message);
                    outgoingMessageBusMessage.Id = incomingMessageBusMessage.Id;
                    outgoingMessageBusMessage.channel = incomingMessageBusMessage.channel;
                    outgoingMessageBusMessage.validate();
                    subscriberMessages.push(outgoingMessageBusMessage);
                }
            };
            const firstSuccesfulSubscriber = subscriberMessages.find(s => s.success);
            if (!firstSuccesfulSubscriber) {
                const firstUnsuccesfulSubscriber = subscriberMessages.find(s => !s.success);
                return new CommunicationMessage(firstUnsuccesfulSubscriber);
            }
        } else {
            return new CommunicationMessage({ 
                Id: incomingMessageBusMessage.Id,
                headers: {},
                body: {},
                statusCode: 404,
                statusMessage: `${incomingMessageBusMessage.Id} does not have any subscribers`
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
            message.validate();
            const outgoingCommMessage = new CommunicationMessage(message);
            outgoingCommMessage.validate();
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
                component: message.channel
            });
            releaseControl(controlId);
            return await communication.send(outgoingCommMessage);
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