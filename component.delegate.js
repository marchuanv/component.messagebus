const path = require("path");
const fs = require('fs');
const { exec } = require("child_process");
const delegate = require("component.delegate");

const capitalize = (s) => {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

const formatModuleName = (moduleName) => {
    let parts = moduleName.split(".");
    let name = parts[0];
    delete parts[0];
    for(const part of parts){
        name = name + capitalize(part);
    };
    return name;
};

const installModule = ({ gitUsername, moduleName }) => {
    return new Promise(async (resolve, reject) => {
        let moduleToInstall = moduleName;
        if (gitUsername) {
            moduleToInstall = `${gitUsername}/${moduleName}`;
        }
        exec(`npm install ${moduleToInstall} --no-save`, () => {
            const id = setInterval(() => {
                let resolvedPath = path.join(__dirname,"node_modules", moduleName);
                if (__dirname.indexOf("node_modules") > -1){
                    resolvedPath = path.join(__dirname,"../");
                    resolvedPath = path.join(resolvedPath, moduleName);
                }
                if (fs.existsSync(resolvedPath)){
                    clearInterval(id);
                    const packagePath = path.join(resolvedPath,"package.json");
                    const package = require(packagePath);
                    resolve({
                        resolvedPath: path.join(resolvedPath,package.main),
                        packagePath
                    });
                }
            },100);
        });
    });
};

const canResolveModule = (moduleName) => {
    try {
        return require.resolve(moduleName);
    } catch(err) {
        console.log(err);
        return false;
    }
};

const getModuleInfo = ({ moduleName, gitUsername }) => {
    return new Promise(async (resolve) => {
        let resolvedPath = canResolveModule(moduleName);
        let packagePath = (resolvedPath || "" ).replace(`${moduleName}.js`,"package.json");
        if (!resolvedPath){
            ( { resolvedPath, packagePath } = await installModule({gitUsername,moduleName}));
        }
        const { name, hostname, port } = require(packagePath);
        let info = {};
        if (moduleName.startsWith("component")){
            info["hostname"]           = hostname;
            info["port"]               = port;
            info["name"]               = name;
            info["friendlyName"]       = formatModuleName(name);
            info["modulePath"]         = resolvedPath;
            if (!hostname || !port){
                throw new Error(`failed to register ${moduleName}, package.json requires hostname and port configuration`);
            }
        }
        await resolve(info);
    });
};

module.exports = {
    global: {
        delegate: {
            register: async ({ name, overwriteDelegate = true }, callback) => {
                await delegate.register({ context: "component", name, overwriteDelegate }, callback);
            },
            call: async ( { name, wildcard }, params) => {
                await delegate.call({ context: "component", name, wildcard }, params);
            }
        }
    },
    load: async ({ moduleName, gitUsername, parentModuleName }) => {
        if (!gitUsername){
            throw new Error("missing parameter: gitUsername");
        }
        if (!moduleName){
            throw new Error("missing parameter: moduleName");
        }
        const moduleInfo = await getModuleInfo({ moduleName, gitUsername });
        const instance = require(moduleInfo.modulePath);
        module.exports[moduleInfo.friendlyName] = instance;
        module.exports["config"] = moduleInfo;
        if (parentModuleName) {
            module.exports[formatModuleName(parentModuleName)] = {
                delegate = {
                    register: async ({ context, name, overwriteDelegate = true }, callback) => {
                        await delegate.register({ context, name, overwriteDelegate }, callback);
                    },
                    call: async ( { context, name, wildcard }, params) => {
                        await delegate.call({ context: parentModuleName, name, wildcard }, params);
                    }
                };
            };
        }
        await this.delegate.call( { name: "acquired" }, results );
    }
};