const { Communication, CommunicationMessage } = require("component.communication");
const utils = require("utils");
const config = require("../package.json");
const { MessageBusMessage } = require("./messagebus.message.js");

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
        incomingMessageBusMessage.validate();
        const messageSubscribers = this.subscribers.filter(s => s.messageId === incomingMessageBusMessage.Id);
        if (messageSubscribers) {
            if (!messageSubscribers.find(s => s.subscriptionId === incomingMessageBusMessage.subscriptionId)) {
                const subscriberMessages = [];
                for(const messageSubscriber of messageSubscribers) {
                    if (await messageSubscriber.callbackValidate(incomingMessageBusMessage)) {
                        const outgoingMessageBusMessage = new MessageBusMessage(await messageSubscriber.callback(incomingMessageBusMessage));
                        outgoingMessageBusMessage.validate();
                        subscriberMessages.push(outgoingMessageBusMessage);
                    }
                };
                const firstSuccesfulSubscriber = subscriberMessages.find(s => s.success);
                if (!firstSuccesfulSubscriber) {
                    const firstUnsuccesfulSubscriber = subscriberMessages.find(s => !s.success);
                    return firstUnsuccesfulSubscriber;
                }
                return firstSuccesfulSubscriber;
            } else {
                await this.subscribe({ component: received.component, callback: async (data) => {
                    return await this.publish({ component: received.component, message: data });
                }});
            }
        }
    });
};

// MessageBus.prototype.inCallstack = async function ({ context, success = true }) {
//     return callstack.find(csi => csi.context === context && csi.success === success);
// };

// MessageBus.prototype.getCallstack = async function  ({ context, latest = true }) {
//     const clonedCallstack = utils.getJSONObject(utils.getJSONString(callstack));
//     const {Id} = clonedCallstack.find(csi => csi.context === context) || {}; //get the first element in the array
//     if (!latest) {
//         clonedCallstack.reverse();
//         ({ Id } = clonedCallstack.find(csi => csi.context === context) || {}); //get the first element in the array after reversing
//         clonedCallstack.reverse(); //restore the original order
//     }
//     return clonedCallstack.filter(csi => csi.Id === Id);
// };

MessageBus.prototype.subscribe = async function (message)  {
    try {
        const outgoingMessageBusMessage = new MessageBusMessage(message);
        outgoingMessageBusMessage.validate();
        const outgoingCommMessage = new CommunicationMessage(outgoingMessageBusMessage);
        outgoingCommMessage.validate();
        return await communication.send(outgoingCommMessage);
    } catch (err) {
        console.log(err);
    }
};

MessageBus.prototype.publish = async function (message) {
    try {
        const outgoingMessageBusMessage = new MessageBusMessage(message);
        outgoingMessageBusMessage.validate();
        const outgoingCommMessage = new CommunicationMessage(outgoingMessageBusMessage);
        outgoingCommMessage.validate();
        let controlId = generateControlId(outgoingMessageBusMessage.component);
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
            component: outgoingMessageBusMessage.component
        });
        releaseControl(controlId);
        return await communication.send(outgoingCommMessage);
    } catch (err) {
        releaseControl(currentControlId);
        console.log(err);
    }
};
module.exports = { MessageBusMessage, MessageBus };