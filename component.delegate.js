const component = require("component");
const fs = require("fs");

const callstackFile = `${__dirname}/callstack.json`;
let stack = [];

const saveCallstack = () => {
    console.log('saving callstack.');
    fs.writeFileSync(callstackFile,JSON.stringify(stack,null,4));
};

process.on('SIGTERM', () => saveCallstack() );
process.on('exit', () => saveCallstack() );
process.on('SIGINT', () => saveCallstack() );
process.on('SIGUSR1', () => saveCallstack() );
process.on('SIGUSR2', () => saveCallstack() );
process.on('uncaughtException', () => saveCallstack() );

const locks = [];
module.exports = {
    pointers: [],
    call: async ( { context, name, wildcard }, params) => {
        
        const contextLockName = context || "global";
        let contextLock = locks.find(x => x.context === contextLockName);
        if (!contextLock) {
            contextLock = { isLocked: true, context: contextLockName };
            locks.push(contextLock);
        } else if (!contextLock.isLocked) {
            contextLock.isLocked = true;
        } else {
            return new Promise((resolve)=> {
                setTimeout(async () => {
                    const results = await module.exports.call( { context, name, wildcard }, params);
                    resolve(results);
                }, 1000);
            });
        }

        if (!context){
            const error = "failed to invoke callback, no context provided.";
            componentLogging.write("Delegating", error);
            contextLock.isLocked = false
            return new Error(error);
        }
        
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (!pointer){
            const error = `no pointers found for the ${context} module.`;
            componentLogging.write("Delegating", error);
            contextLock.isLocked = false
            return new Error(error);
        }

        const callbacks =  pointer.callbacks;
        if (!callbacks || !Array.isArray(callbacks)){
            const error = `expected pointer 'callbacks' to be an array`;
            componentLogging.write("Delegating",error);
            contextLock.isLocked = false
            return  new Error(error);
        }

        const filteredCallbacks = callbacks.filter(c => c.name.toString().startsWith(wildcard) || ( (wildcard === undefined || wildcard === "") && (c.name === name || !name )) );
        if (filteredCallbacks.length === 0){
            const error = `no callbacks`;
            componentLogging.write("Delegating", error);
            contextLock.isLocked = false
            return new Error(error);
        }
        
        for(const callback of filteredCallbacks){
            try {
                componentLogging.write("Delegating", "invoking callback");
                const stackItem = { context, name: callback.name, retry: callback.retry, date: new Date() };
                stack.push(stackItem);
                callback.result = await callback.func(params);
                componentLogging.write("Delegating", "callback invoked");
                callback.timeout = 500;
                callback.retry = 1;
            } catch (error) {
                componentLogging.write("Delegating", `${callback.name} failed with: ${error.message || error}, retrying ${callback.retry} of 3`);
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
            contextLock.isLocked = false
            return errorResult.result;
        };

        await Promise.all(filteredCallbacks.map(c => c.result));
        
        componentLogging.write("Delegating", "callback(s) invoked");

        const filteredCallbacksCloned = JSON.parse(JSON.stringify(filteredCallbacks));
        filteredCallbacks.forEach(x => x.result = null );

        //Errors after promises resolved
        for(const errorResult of filteredCallbacksCloned.filter(cb => cb.result && cb.result.message && cb.result.stack)){
            contextLock.isLocked = false
            return errorResult.result;
        };

        if (filteredCallbacksCloned.filter(cb => cb.result).length > 1){
            contextLock.isLocked = false
            return new Error(`expected at most one of all the functions registered for "${context}" to return results`);
        }

        contextLock.isLocked = false

        const firstCallbackWithResult = filteredCallbacksCloned.find(cb => cb.result);
        return  firstCallbackWithResult? firstCallbackWithResult.result : null;
    },
    register: async ({ context, name, callback, overwriteDelegate = true}) => {
        const event = component.events.find({ moduleName: name, eventType: "module" });
        const pointer = module.exports.pointers.find(p => p.context === context);
        if (pointer){
            if (overwriteDelegate){
                const duplicateCallbackIndex = pointer.callbacks.findIndex(x => x.name === name);
                if (duplicateCallbackIndex > -1){
                    pointer.callbacks.splice(duplicateCallbackIndex,1);
                }
            }
            pointer.callbacks.push( { name, func: event.callback, retry: 1, timeout: 500, result: null });
        } else {
            module.exports.pointers.push({ 
                context, 
                callbacks: [{ name, func: callback, retry: 1, timeout: 500, result: null }]
            });
            componentLogging.write("Delegating", `Registered ${name} callback on ${context}`);
        }
    }
};