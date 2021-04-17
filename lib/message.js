function Message({ component, success = false, message = {} }) {
    this.success = success;
    this.message = message;
    this.component = component;
};
module.exports = { Message };