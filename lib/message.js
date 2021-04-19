function Message({ component, success = false, message = { headers: {} }, issubscription = false }) {
    this.success = success;
    this.message = message;
    this.issubscription = issubscription;
    this.component = component;
};
module.exports = { Message };