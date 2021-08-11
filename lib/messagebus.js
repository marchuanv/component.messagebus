const { Communication, CommunicationIncomingMessage, CommunicationOutgoingMessage, CommunicationResponseMessage } = require("component.communication");
const utils = require("utils");
const logging = require("component.logging");
const { MessageBusMessage } = require("./messagebus.message.js");
const { MessageBusSubscription } = require("./messagebus.subscription.js");
const MessageBusMessageStatus = require("./messagebus.message.status.js")

logging.register({ componentName: "component.messagebus" });

function MessageBus({ host, port, ishttp }) {
    this.subscribers = [];
    const communication = new Communication({ host, port, ishttp });
    communication.receive(async (incomingCommMessage) => {
        if (incomingCommMessage instanceof CommunicationIncomingMessage) {
            
            await incomingCommMessage.validate();

            logging.write("component.messagebus",`received message from the communication component: `, incomingCommMessage);
            
            const incomingMessageBusMessage = new MessageBusMessage(incomingCommMessage);

            logging.write("component.messagebus",`validating the message from the communication component`);
            
            await incomingMessageBusMessage.validate();

            logging.write("component.messagebus",`message validation from the communication component passed`);
            logging.write("component.messagebus",`converting message from the communication component to a messagebus message`);
            logging.write("component.messagebus",`finding all channel subscribers`);
            
            const messageSubscribers = this.subscribers.filter(s => s.channels.find( channel => channel === incomingMessageBusMessage.channel));
            logging.write("component.messagebus",`channel subscribers: `, messageSubscribers);
            
            if (messageSubscribers.length > 0) {
                const responseMessages = [];
                for(const messageSubscriber of messageSubscribers) {
                    
                    logging.write("component.messagebus",`validation callback to subscriber: ${messageSubscriber.Id} to check if it meets subscriber criteria`);
                    
                    if (await messageSubscriber.callbackValidate(incomingMessageBusMessage)) {
                        
                        logging.write("component.messagebus",`validation callback to subscriber ${messageSubscriber.Id} passed`);
                        logging.write("component.messagebus",`callback to subscriber ${messageSubscriber.Id} to get response message`);
                        
                        const receivedMessage = await messageSubscriber.callback(incomingMessageBusMessage);
                        if (receivedMessage && receivedMessage instanceof MessageBusMessage) {
                            
                            logging.write("component.messagebus",`validating callback returned message for subscriber ${messageSubscriber.Id}`);
                            await receivedMessage.validate();
                            logging.write("component.messagebus",`validation of callback returned message for subscriber ${messageSubscriber.Id} passed`);

                            const Id = receivedMessage.Id;
                            const status = receivedMessage.status;
                            const headers = receivedMessage.clone(true);
                            const body = receivedMessage.clone(false);

                            const responseMessage = new CommunicationResponseMessage({ Id, headers, body, status });

                            logging.write("component.messagebus",`created outgoing communication message from callback returned message for subscriber ${messageSubscriber.Id}. Message: `, responseMessage);
                            
                            await responseMessage.validate();
                            
                            responseMessages.push(responseMessage);
                            
                        } else {
                            return new CommunicationResponseMessage({
                                Id: incomingMessageBusMessage.Id,
                                headers: {},
                                body: {},
                                status: MessageBusMessageStatus.Fail_Error
                            });
                        }
                    }
                };
                if (outgoingMessages.length > 0) {
                   return responseMessages;
                }
                return new CommunicationResponseMessage({
                    Id: incomingMessageBusMessage.Id,
                    headers: {},
                    body: {},
                    status: MessageBusMessageStatus.Fail_Error
                });
            } else {
                return new CommunicationResponseMessage({
                    Id: incomingMessageBusMessage.Id,
                    headers: {},
                    body: {},
                    status: MessageBusMessageStatus.Success
                });
            }
        } else {
            return new CommunicationResponseMessage({
                Id: incomingMessageBusMessage.Id,
                headers: {},
                body: {},
                status: MessageBusMessageStatus.Fail_Error
            });
        }
    });
};

MessageBus.prototype.subscribe = async function (subscription)  {
    if (subscription instanceof MessageBusSubscription) {
        await subscription.validate();
        logging.write("component.messagebus",`subscribing with ${subscription.Id} on channels: ${utils.getJSONString(subscription.channels)}`);
        this.subscribers.push(subscription);
    } else {
        throw new Error("subscription parameter is not of type: MessageBusSubscription");
    }
};

MessageBus.prototype.publish = async function (message) {
    if (message instanceof MessageBusMessage) {
        try {
            
            await message.validate();

            const headers = message.clone(true);
            const body = message.clone(false);
          
            const messageToSend = new CommunicationOutgoingMessage({ Id: message.Id, headers, body });
            await messageToSend.validate();

            logging.write("component.messagebus",`publishing ${message.Id}`);
            const receivedMessage = await communication.send(messageToSend);
            if (receivedMessage instanceof CommunicationResponseMessage) {
                const receivedMessageBusMessage =  new MessageBusMessage(receivedMessage);
                await receivedMessageBusMessage.validate();
                await message.update(receivedMessageBusMessage);
            } else {
                throw new Error("received message is not of type: CommunicationResponseMessage");
            }
           
        } catch (err) {
           throw err;
        }
    } else {
        throw new Error("message parameter is not of type: MessageBusMessage");
    }
};

module.exports = { MessageBusSubscription, MessageBusMessage, MessageBusMessageStatus, MessageBus };