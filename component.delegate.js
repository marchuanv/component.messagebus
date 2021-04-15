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

module.exports = {
    pointers: [],
    call: async ({ context, name, wildcard }, params) => {
        if (!context){
            const error = "failed to invoke callback, no context provided.";
            return new Error(error);
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
        
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (!pointer){
            const error = `no pointers found for the ${context} module.`;
            releaseControl(controlId);
            return new Error(error);
        }

        const callbacks =  pointer.callbacks;
        if (!callbacks || !Array.isArray(callbacks)){
            const error = `expected pointer 'callbacks' to be an array`;
            releaseControl(controlId);
            return  new Error(error);
        }

        const filteredCallbacks = callbacks.filter(c => c.name.toString().startsWith(wildcard) || ( (wildcard === undefined || wildcard === null || wildcard === "") && (c.name === name || !name )) );
        if (filteredCallbacks.length === 0){
            const error = `no callbacks`;
            releaseControl(controlId);
            return new Error(error);
        }
        
        for(const callback of filteredCallbacks){
            try {
                if (await callback.filterCallback(params)) {
                    callback.result = await callback.finalCallback(params);
                    callback.timeout = 500;
                    callback.retry = 1;
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
            releaseControl(controlId);
            return  {
                controlId : currentControlId,
                results: errorResult.result
            };
        };

        await Promise.all(filteredCallbacks.map(c => c.result));
        
        const filteredCallbacksCloned = JSON.parse(JSON.stringify(filteredCallbacks));
        filteredCallbacks.forEach(x => x.result = null );

        //Errors after promises resolved
        for(const errorResult of filteredCallbacksCloned.filter(cb => cb.result && cb.result.message && cb.result.stack)){
            releaseControl(controlId);
            return  {
                controlId : currentControlId,
                results: errorResult.result
            };
        };

        if (filteredCallbacksCloned.filter(cb => cb.result).length > 1){
            releaseControl(controlId);
            return  {
                controlId : currentControlId,
                results: new Error(`expected at most one of all the functions registered for "${context}" to return results`)
            };
        }

        const firstCallbackWithResult = filteredCallbacksCloned.find(cb => cb.result);
        const response =  {
            controlId : currentControlId,
            results: firstCallbackWithResult? firstCallbackWithResult.result : null
        };
        releaseControl(controlId);
        return response;
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
    }
};