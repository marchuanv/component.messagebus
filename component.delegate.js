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

const buildSuccessfulResponse = (results) => {
    return { success: true, reasons: null, results };
};

const buildUnsuccessfulResponse = (error) => {
    return { success: false, reasons: new Error(error), results: null };
};

const generateControlId = ({ context, name, wildcard }) => {
    let controlId = context;
    if(name) {
        controlId = controlId + name.toString();
    }
    if(wildcard) {
        controlId = controlId + wildcard.toString();
    }
    controlId = `CONTEXT:[${controlId}]GUID:[${utils.generateGUID()}]`;
    return utils.stringToBase64(controlId);
};

const callstack = [];

const addToCallstack = ({ Id, context }) => {
    callstack.unshift({Id, context});
};

module.exports = {
    pointers: [],
    call: async ({ context, name, wildcard }, params) => {
        if (!context){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse("failed to invoke callback, no context provided.");
        }
        let controlId = generateControlId({ context, name, wildcard });
        if (currentControlId) {
            if (matchCurrentControlId(controlId)) { //wait until control is released
                return new Promise((resolve) => {
                    const intervalId = setInterval( async () => {
                        if (!currentControlId) {
                            clearInterval(intervalId);
                            await resolve(await module.exports.call({ context, name, wildcard }, params));
                        }
                    },1000);
                });
            }
        } else {
            currentControlId = controlId;
        }

        addToCallstack({Id : currentControlId, context })
        
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (!pointer){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(`no pointers found for the ${context} module.`);
        }

        const callbacks =  pointer.callbacks;
        if (!callbacks || !Array.isArray(callbacks)){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(`expected pointer 'callbacks' to be an array`);
        }

        const filteredCallbacks = callbacks.filter(c => c.name.toString().startsWith(wildcard) || ( (wildcard === undefined || wildcard === null || wildcard === "") && (c.name === name || !name )) );
        if (filteredCallbacks.length === 0){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(`no callbacks for context: ${context}`);
        }
        
        for(const callback of filteredCallbacks){
            try {
                if (await callback.filterCallback(params)) {
                    const { success, reasons, results } = await callback.finalCallback(params);
                    if (success || reasons || results) {
                        callback.result = { success, reasons, results };
                        callback.timeout = 500;
                        callback.retry = 1;
                    } else {
                        throw new Error(`the ${callback.name} callback did not respond with { success, reasons, results }`);
                    }
                } else {
                    callback.result = null;
                    callback.timeout = 500;
                    callback.retry = 1;
                }
            } catch (error) {
                callback.result = error;
                if (callback.retry <= 2){
                    callback.retry = callback.retry + 1;
                    setTimeout(async () => {
                        await module.exports.call( { context, name: callback.name, wildcard }, params);
                    }, callback.timeout);
                }
                callback.timeout = callback.timeout * 2;
            }
        };

        //Errors before promises resolved
        for(const errorResult of filteredCallbacks.filter(cb => cb.result && cb.result.message && cb.result.stack)){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(errorResult.result);
        };

        await Promise.all(filteredCallbacks.map(c => c.result));
        
        const filteredCallbacksCloned = JSON.parse(JSON.stringify(filteredCallbacks));
        filteredCallbacks.forEach(x => x.result = null );

        //Errors after promises resolved
        for(const errorResult of filteredCallbacksCloned.filter(cb => cb.result && cb.result.message && cb.result.stack)){
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(errorResult.result);
        };

        if (filteredCallbacksCloned.filter(cb => cb.result).length > 1) {
            releaseControl(currentControlId);
            return buildUnsuccessfulResponse(new Error(`expected at most one of all the functions registered for "${context}" to return results`));
        }
        releaseControl(currentControlId);
        const firstCallbackWithResult = filteredCallbacksCloned.find(cb => cb.result);
        return buildSuccessfulResponse(firstCallbackWithResult.result);
    },
    register: async ({ context, name, overwriteDelegate = true }, finalCallback, filterCallback) => {
        if (!name || !context || !finalCallback){
            throw new Error("missing parameters: context | name | finalCallback");
        }
        filterCallback = filterCallback? filterCallback: () => true;
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (pointer){
            if (overwriteDelegate){
                const duplicateCallbackIndex = pointer.callbacks.findIndex(x => x.name === name);
                if (duplicateCallbackIndex > -1){
                    pointer.callbacks.splice(duplicateCallbackIndex,1);
                }
            }
            pointer.callbacks.push( { name, finalCallback, filterCallback, retry: 1, timeout: 500, result: null });
        } else {
            module.exports.pointers.push({ 
                context, 
                callbacks: [{ name, finalCallback, filterCallback, retry: 1, timeout: 500, result: null }]
            });
        }
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