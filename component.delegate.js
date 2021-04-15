process.on('SIGTERM', () => saveCallstack() );
process.on('exit', () => saveCallstack() );
process.on('SIGINT', () => saveCallstack() );
process.on('SIGUSR1', () => saveCallstack() );
process.on('SIGUSR2', () => saveCallstack() );
process.on('uncaughtException', () => saveCallstack() );

let currentControlId;

const releaseControl = (controlId) => {
    if (controlId === currentControlId) {
        currentControlId = null;
    }
};

module.exports = {
    pointers: [],
    call: async ({ context, name, wildcard }, params) => {
        
        if (!context){
            const error = "failed to invoke callback, no context provided.";
            return new Error(error);
        }

        let newControlId = context;
        if(name) {
            newControlId = newControlId + name;
        }
        if(wildcard) {
            newControlId = newControlId + wildcard;
        }

        if (currentControlId) {
            if (currentControlId === newControlId) { //wait until control is released
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
            currentControlId = newControlId;
        }
        
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (!pointer){
            const error = `no pointers found for the ${context} module.`;
            releaseControl(newControlId);
            return new Error(error);
        }

        const callbacks =  pointer.callbacks;
        if (!callbacks || !Array.isArray(callbacks)){
            const error = `expected pointer 'callbacks' to be an array`;
            releaseControl(newControlId);
            return  new Error(error);
        }

        const filteredCallbacks = callbacks.filter(c => c.name.toString().startsWith(wildcard) || ( (wildcard === undefined || wildcard === null || wildcard === "") && (c.name === name || !name )) );
        if (filteredCallbacks.length === 0){
            const error = `no callbacks`;
            releaseControl(newControlId);
            return new Error(error);
        }
        
        for(const callback of filteredCallbacks){
            try {
                callback.result = await callback.func(params);
                callback.timeout = 500;
                callback.retry = 1;
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
            releaseControl(newControlId);
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
            releaseControl(newControlId);
            return  {
                controlId : currentControlId,
                results: errorResult.result
            };
        };

        if (filteredCallbacksCloned.filter(cb => cb.result).length > 1){
            releaseControl(newControlId);
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
        releaseControl(newControlId);
        return response;
    },
    register: async ({ context, name, overwriteDelegate = true }, callback) => {
        if (!name || !context || !callback){
            throw new Error("missing parameters: context | name | callback");
        }
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (pointer){
            if (overwriteDelegate){
                const duplicateCallbackIndex = pointer.callbacks.findIndex(x => x.name === name);
                if (duplicateCallbackIndex > -1){
                    pointer.callbacks.splice(duplicateCallbackIndex,1);
                }
            }
            pointer.callbacks.push( { name, func: callback, retry: 1, timeout: 500, result: null });
        } else {
            module.exports.pointers.push({ 
                context, 
                callbacks: [{ name, func: callback, retry: 1, timeout: 500, result: null }]
            });
        }
    }
};