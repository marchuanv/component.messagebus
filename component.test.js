const fs = require("fs");
module.exports = {
    module,
    changeModuleParent: (parentName) => {
        const package = require("./package.json");
        package.parentName = parentName;
        fs.writeFileSync(JSON.stringify(package));
    }
};