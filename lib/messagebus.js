const { Communication } = require("component.communication");
const utils = require("utils");
const config = require("../package.json");
const communication = new Communication(config.component);
const { Message } = require("./message.js");
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
    communication.receive(async ({ headers, text }) => {
        const received = new Message(utils.getJSONObject(text));
        received.message.headers = headers;
        const subscriber = this.subscribers.find(s => s.component === received.message.component);
        if (subscriber) {
            if (await subscriber.validateCallback(received.message)) {
                return new Message(await subscriber.callback(received.message));
            }
        }
    });
};

MessageBus.prototype.inCallstack = async function ({ context, success = true }) {
    return callstack.find(csi => csi.context === context && csi.success === success);
};

MessageBus.prototype.getCallstack = async function  ({ context, latest = true }) {
    const clonedCallstack = utils.getJSONObject(utils.getJSONString(callstack));
    const {Id} = clonedCallstack.find(csi => csi.context === context) || {}; //get the first element in the array
    if (!latest) {
        clonedCallstack.reverse();
        ({ Id } = clonedCallstack.find(csi => csi.context === context) || {}); //get the first element in the array after reversing
        clonedCallstack.reverse(); //restore the original order
    }
    return clonedCallstack.filter(csi => csi.Id === Id);
};

MessageBus.prototype.subscribe = async function ({ component, callback, validateCallback })  {
    if (!component || !callback) {
        throw new Error("missing parameters: component OR callback");
    }
    if (!validateCallback) {
        validateCallback = () => true;
    }
    const foundAtIndex = this.subscribers.findIndex(s => s.component === component);
    if (foundAtIndex > -1) {
        this.subscribers.splice(foundAtIndex, 1);
    }
    this.subscribers.push({ component, callback, validateCallback });
};

MessageBus.prototype.publish = async function ({ component, message }) {
    const messageToSend = new Message({ component: component, success: false, message });
    if (!messageToSend.component){
        releaseControl(currentControlId);
        throw new Error("publish failed, could not create message with given publish parameters");
    }
    let controlId = generateControlId(messageToSend.component);
    if (currentControlId) {
        if (matchCurrentControlId(controlId)) { //wait until control is released
            return setTimeout(async () => {
                await resolve(await module.exports.publish({
                    component: messageToSend.component,
                    message: messageToSend.message 
                }));
            },1000);
        }
    } else {
        currentControlId = controlId;
    }
    addToCallstack({
        Id : currentControlId,
        component: messageToSend.component
    });
    releaseControl(controlId);
    return await communication.send(messageToSend);
};
module.exports = { MessageBus };