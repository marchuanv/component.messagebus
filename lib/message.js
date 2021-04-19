function Message({ component, success = false, message = {}, issubscription = false }) {
    this.success = success;
    this.message = message;
    this.issubscription = issubscription;
    this.component = component;
};
module.exports = { Message };