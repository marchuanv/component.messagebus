function MessageBusMessage({ component, success = false, message = { headers: {} }, issubscription = false }) {
    this.Id = null;
    this.subscriptionId = null;
    this.success = success;
    this.message = message;
    this.component = component;
};
module.exports = { MessageBusMessage };



{ component, callback, callbackValidate }
if (!component || !callback) {
    throw new Error("missing parameters: component OR callback");
}
callbackValidate = callbackValidate? callbackValidate : () => true;
const newSubscription = { Id: utils.generateGUID(), component, callback, callbackValidate };
this.subscribers.push(newSubscription);
const messageToSend = new Message({ component, success: false, message: { headers: {}, subscriptionId: newSubscription.Id }, issubscription: true });