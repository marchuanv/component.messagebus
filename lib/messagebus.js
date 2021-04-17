const { Communication } = require("component.communication");
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

const generateControlId = (componentName) => {
    const controlId = `COMPONENT:[${componentName}]GUID:[${utils.generateGUID()}]`;
    return utils.stringToBase64(controlId);
};


const addToCallstack = ({ Id, componentName }) => {
    callstack.unshift({ Id, componentName });
};

function MessageBus() {
    this.subscribers = [];
    communication.receive(async (message) => {
        const receivedMsg = new Message(message);
        const subscriber = this.subscribers.find(s => s.componentName === receivedMsg.componentName);
        if (subscriber) {
            if (await subscriber.validateCallback(receivedMsg)) {
                return new Message(await subscriber.callback(receivedMsg));
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

MessageBus.prototype.subscribe = async function ({ componentName, callback, validateCallback })  {
    if (!componentName || !callback) {
        throw new Error("missing parameters: componentName OR callback");
    }
    if (!validateCallback) {
        validateCallback = () => true;
    }
    const foundAtIndex = this.subscribers.findIndex(s => s.componentName === componentName);
    if (foundAtIndex > -1) {
        this.subscribers.splice(foundAtIndex, 1);
    }
    this.subscribers.push({ componentName, callback, validateCallback });
};

MessageBus.prototype.publish = function ({ componentName, message }) {
    if (!componentName){
        releaseControl(currentControlId);
        throw new Error("publish failed, no componentName provided.");
    }
    let controlId = generateControlId(componentName);
    if (currentControlId) {
        if (matchCurrentControlId(controlId)) { //wait until control is released
            return setTimeout(async () => {
                await resolve(await module.exports.publish(componentName, message));
            },1000);
        }
    } else {
        currentControlId = controlId;
    }
    addToCallstack({Id : currentControlId, componentName });
    releaseControl(controlId);
    return await communication.send(componentName, message);
};
