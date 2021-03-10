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
const pointers = [];
    
module.exports = function({ context, callbackContext }) {
    if (!context){
        const error = "no context provided.";
        return new Error(error);
    }
    if (!callbackContext){
        const error = "no callback context provided.";
        return new Error(error);
    }

    this.context = context;
    this.callbackContext = callbackContext;

    this.call = async ( { name, wildcard }, params) => {
        const contextLockName = callbackContext || "global";
        let contextLock = locks.find(x => x.context === contextLockName);
        if (!contextLock) {
            contextLock = { isLocked: true, context: contextLockName };
            locks.push(contextLock);
        } else if (!contextLock.isLocked) {
            contextLock.isLocked = true;
        } else {
            return new Promise((resolve)=> {
                setTimeout(async () => {
                    const results = await this.call( { name, wildcard }, params);
                    resolve(results);
                }, 1000);
            });
        }
        
        const pointer = pointers.find(p => p.context === callbackContext);
        if (!pointer){
            const error = `no pointers found for the ${callbackContext} module.`;
            contextLock.isLocked = false
            return new Error(error);
        }

        const callbacks =  pointer.callbacks;
        if (!callbacks || !Array.isArray(callbacks)){
            const error = `expected pointer 'callbacks' to be an array`;
            contextLock.isLocked = false
            return new Error(error);
        }

        const filteredCallbacks = callbacks.filter(c => c.name.toString().startsWith(wildcard) || ( (wildcard === undefined || wildcard === "") && (c.name === name || !name )) );
        if (filteredCallbacks.length === 0){
            const error = `no callbacks`;
            contextLock.isLocked = false
            return new Error(error);
        }
        
        for(const callback of filteredCallbacks){
            try {
                const stackItem = { context: callbackContext, name: callback.name, retry: callback.retry, date: new Date() };
                stack.push(stackItem);
                callback.result = await callback.func(params);
                callback.timeout = 500;
                callback.retry = 1;
            } catch (error) {
                callback.result = error;
                if (callback.retry <= 2){
                    callback.retry = callback.retry + 1;
                    setTimeout(async () => {
                        await this.call( { context: callbackContext, name: callback.name, wildcard }, params);
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
        
        const filteredCallbacksCloned = JSON.parse(JSON.stringify(filteredCallbacks));
        filteredCallbacks.forEach(x => x.result = null );

        //Errors after promises resolved
        for(const errorResult of filteredCallbacksCloned.filter(cb => cb.result && cb.result.message && cb.result.stack)){
            contextLock.isLocked = false
            return errorResult.result;
        };

        if (filteredCallbacksCloned.filter(cb => cb.result).length > 1){
            contextLock.isLocked = false
            return new Error(`expected at most one of all the functions registered for "${callbackContext}" to return results`);
        }

        contextLock.isLocked = false

        const firstCallbackWithResult = filteredCallbacksCloned.find(cb => cb.result);
        return  firstCallbackWithResult? firstCallbackWithResult.result : null;
    };
    this.register = async ({ name, overwriteDelegate = true }, callback) => {
        const pointer = pointers.find(p => p.context === context);
        if (pointer){
            if (overwriteDelegate){
                const duplicateCallbackIndex = pointer.callbacks.findIndex(x => x.name === name);
                if (duplicateCallbackIndex > -1){
                    pointer.callbacks.splice(duplicateCallbackIndex,1);
                }
            }
            pointer.callbacks.push( { name, func: callback, retry: 1, timeout: 500, result: null });
        } else {
            pointers.push({ 
                context, 
                callbacks: [{ name, func: callback, retry: 1, timeout: 500, result: null }]
            });
        }
    };
};