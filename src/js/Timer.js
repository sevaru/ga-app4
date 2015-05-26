var _timing = null;
var _started = false;
var _message = "";

function start( message ) {
	if ( message ) {
		_message = message;
	}
	
	if ( _started ) {
		console.warn("Timer already started");
	} 
	
	_started = true;
	_timing = Date.now();
}

function end( message ) {
	if ( message ) {
		_message = message;
	}
	
	console.log(_message + ": "+ (Date.now() - _timing) + " msec");
	
	_timing = null;
	_started = false;
}

module.exports = {
	start: start,
	end: end
};