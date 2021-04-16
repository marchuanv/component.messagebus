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
        context: Id.split("CONTEXT:")[1].split("GUID:")[0],
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
    publish: async ({ channel, data }) => {
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
                            await resolve(await module.exports.publish(channel, data));
                        }
                    },1000);
                });
            }
        } else {
            currentControlId = controlId;
        }

        addToCallstack({Id : currentControlId, channel })
        
        const subscriptions = subscribers.filter(async subscriber => subscriber.channel === channel && await subscriber.validateCallback(data));
        if (subscriptions.length === 0){
            releaseControl(currentControlId);
            throw new Error(`no ${channel} subscribers.`);
        }
        
        for(const subscription of subscriptions){
            try {
                ({ 
                    success: subscription.success,
                    reasons: subscription.reasons,
                    data: subscription.data
                } = await subscription.callback(data));
                if (subscription.success === undefined || subscription.reasons === undefined || subscription.data === undefined) {
                    throw new Error(`one or more ${channel} subscribers did not respond with: { success: true | false, reasons: [], data: Object }`);
                }
                subscription.timeout = 500;
                subscription.retry = 1;
            } catch (error) {
                subscription.reasons = subscription.reasons? subscription.reasons.push(error) : [error];
                if (subscription.retry <= 2){
                    subscription.retry = subscription.retry + 1;
                    setTimeout(async () => {
                        await module.exports.publish(channel, data);
                    }, subscription.timeout);
                }
                subscription.timeout = subscription.timeout * 2;
            }
        };

        return subscriptions;
    },
    subscribe: async ({ channel, callback, validateCallback = () => true, data }) => {
        if (!channel || !finalCallback) {
            throw new Error("missing parameters: channel OR finalCallback");
        }
        subscribers.push({ 
            channel, 
            callback, 
            validateCallback, 
            success: false,
            reasons: [],
            data: {
                input: data,
                output: null
            }
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