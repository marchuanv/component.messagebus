function Message({ success = false, message = {} }) {
    this.success = success;
    this.message = message;
    this.subscribers = { count: 0 }
};
module.exports = { Message };