const { Communication } = require("component.communication");
const config = require("../package.json");
const communication = new Communication(config.component);
let currentControlId = null;
const callstack = [];
const subscribers = [];

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
    const subscriberIndex = subscribers.findIndex(s => s.componentName === componentName);
    if (subscriberIndex > -1) {
        subscribers.splice(subscriberIndex,1);
    }
    subscribers.push({ 
        componentName, 
        callback, 
        validateCallback, 
        success: false,
        reasons: [],
        message: null
    });
};

MessageBus.prototype.publish = async function ({ componentName, message }) {
    if (!componentName){
        releaseControl(currentControlId);
        throw new Error("publish failed, no componentName provided.");
    }
    let controlId = generateControlId(componentName);
    if (currentControlId) {
        if (matchCurrentControlId(controlId)) { //wait until control is released
            return new Promise((resolve) => {
                const intervalId = setInterval( async () => {
                    if (!currentControlId) {
                        clearInterval(intervalId);
                        await resolve(await module.exports.publish(componentName, message));
                    }
                },1000);
            });
        }
    } else {
        currentControlId = controlId;
    }

    addToCallstack({Id : currentControlId, componentName })
    
    const subscriptions = await Promise.all(subscribers.filter(subscriber => subscriber.componentName === componentName && subscriber.validateCallback(message)));
    if (subscriptions.length === 0){
        releaseControl(controlId);
        throw new Error(`no ${componentName} subscribers.`);
    }
    
    for(const subscription of subscriptions){
        try {
            ({ 
                success: subscription.success,
                message: subscription.message
            } = await communication.send(componentName, message ));
            if (
                subscription.success === undefined || 
                subscription.message === undefined ||
                (subscription.message && typeof subscription.message !== "object") ||
                (subscription.success && typeof subscription.success !== "boolean")
            ) {
                throw new Error(`one or more ${componentName} subscribers did not respond with: { success: true | false, reasons: [], message: String }`);
            }
            subscription.timeout = 500;
            subscription.retry = 1;
        } catch (error) {
            subscription.success = false;
            subscription.message = {
                error: error.message,
                stack: error.stack
            };
            if (subscription.retry <= 2){
                subscription.retry = subscription.retry + 1;
                setTimeout(async () => {
                    await module.exports.publish(componentName, message);
                }, subscription.timeout);
            }
            subscription.timeout = subscription.timeout * 2;
        }
    };
    releaseControl(controlId);
    return subscriptions;
};
