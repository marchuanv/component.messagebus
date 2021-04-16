process.on('SIGTERM', () => saveCallstack() );
process.on('exit', () => saveCallstack() );
process.on('SIGINT', () => saveCallstack() );
process.on('SIGUSR1', () => saveCallstack() );
process.on('SIGUSR2', () => saveCallstack() );
process.on('uncaughtException', () => saveCallstack() );
const utils = require("utils");

let currentControlId;

const decodeControlId = (controlId) => {
    const Id = utils.base64ToString(controlId);
    return {
        context: Id.split("CHANNEL:")[1].split("GUID:")[0],
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

const generateControlId = (channel) => {
    const controlId = `CHANNEL:[${channel}]GUID:[${utils.generateGUID()}]`;
    return utils.stringToBase64(controlId);
};


const addToCallstack = ({ Id, channel }) => {
    callstack.unshift({ Id, channel });
};

const callstack = [];
const subscribers = [];

module.exports = {
    publish: async ({ channel, message }) => {
        if (!channel){
            releaseControl(currentControlId);
            throw new Error("publish failed, no channel provided.");
        }
        let controlId = generateControlId(channel);
        if (currentControlId) {
            if (matchCurrentControlId(controlId)) { //wait until control is released
                return new Promise((resolve) => {
                    const intervalId = setInterval( async () => {
                        if (!currentControlId) {
                            clearInterval(intervalId);
                            await resolve(await module.exports.publish(channel, message));
                        }
                    },1000);
                });
            }
        } else {
            currentControlId = controlId;
        }

        addToCallstack({Id : currentControlId, channel })
        
        const subscriptions = await Promise.all(subscribers.filter(subscriber => subscriber.channel === channel && subscriber.validateCallback(message)));
        if (subscriptions.length === 0){
            releaseControl(controlId);
            throw new Error(`no ${channel} subscribers.`);
        }
        
        for(const subscription of subscriptions){
            try {
                ({ 
                    success: subscription.success,
                    message: subscription.message
                } = await subscription.callback(message));
                if (
                    subscription.success === undefined || 
                    subscription.message === undefined ||
                    (subscription.message && typeof subscription.message !== "object") ||
                    (subscription.success && typeof subscription.success !== "boolean")
                ) {
                    throw new Error(`one or more ${channel} subscribers did not respond with: { success: true | false, reasons: [], message: String }`);
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
                        await module.exports.publish(channel, message);
                    }, subscription.timeout);
                }
                subscription.timeout = subscription.timeout * 2;
            }
        };
        releaseControl(controlId);
        return subscriptions;
    },
    subscribe: async ({ channel, callback, validateCallback }) => {
        if (!channel || !callback) {
            throw new Error("missing parameters: channel OR callback");
        }
        if (!validateCallback) {
            validateCallback = () => true;
        }
        const subscriberIndex = subscribers.findIndex(s => s.channel === channel);
        if (subscriberIndex > -1) {
            subscribers.splice(subscriberIndex,1);
        }
        subscribers.push({ 
            channel, 
            callback, 
            validateCallback, 
            success: false,
            reasons: [],
            message: null
        });
    },
    inCallstack: async ({ context, success = true }) => {
        return callstack.find(csi => csi.context === context && csi.success === success);
    },
    getCallstack: async ({ context, latest = true }) => {
        const clonedCallstack = utils.getJSONObject(utils.getJSONString(callstack));
        const {Id} = clonedCallstack.find(csi => csi.context === context) || {}; //get the first element in the array
        if (!latest) {
            clonedCallstack.reverse();
            ({ Id } = clonedCallstack.find(csi => csi.context === context) || {}); //get the first element in the array after reversing
            clonedCallstack.reverse(); //restore the original order
        }
        return clonedCallstack.filter(csi => csi.Id === Id);
    }
};