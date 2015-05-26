var $ = require("jquery");
var PubSub = $({});

PubSub.subscribe = function() {
	PubSub.on.apply(PubSub, arguments);
};

PubSub.unsubscribe = function() {
	PubSub.off.apply(PubSub, arguments);
};

PubSub.publish = function() {
	PubSub.trigger.apply(PubSub, arguments);
};


module.exports = PubSub;