function Message({ componentName, success = false, message = {} }) {
    this.success = success;
    this.message = message;
    this.componentName = componentName;
};
module.exports = { Message };