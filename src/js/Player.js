var Synth = require("./Synth");

var Player = (function(Synth) {

    var INTERVAL = 200;
    var _cursor = 0;
    var _content = [];
    var _stopped = true;
	var _timerId = null;

    var _options = {
        tempo: 128,
        grid: 8,
        scale: "Cmaj",
        octaves: 2
    };

    var _referenceTable = {
        0: false
    };

    function options() {
        switch ( arguments.length ) {
            case 0:
                return;

            case 1:
                if ( typeof arguments[0] === "object" ) {
                    _options = arguments[0];
                } 
                break;

            case 2:
                _options[arguments[0]] = arguments[1];
                break;
        }
        _prepareReferenceTable();
    }

    function _prepareReferenceTable() {
        _referenceTable = {
			"-1": true,
            0: false,
            1: 261.66, //C
            2: 293.66, //D
            3: 329.63, //E
            4: 349.23, //F
            5: 392, //G
            6: 440, //A
            7: 493.88, //B
            8: 523.25, //C2
            9: 587.33, //D
            10: 659.26, //E
            11: 698.46, //F
            12: 783.99,  //G
            13: 880, //A
            14: 987.77, //B
        };
    }

    function _next() {

        if ( _cursor >= _content.length - 1 ) {
            _stopped = true;
        }

        if ( _stopped ) {
            Synth.stopNote();
            return;
        }

        var note = _content[_cursor];
		
		if ( _timerId ) {
			clearTimeout(_timerId);
		}
		
		_timerId = setTimeout(function() {
            _tone(note);
            _next();
        }, INTERVAL);

        _cursor++;
    }

    function _tone(note) {
        switch( note ) {
            case 0:
                Synth.stopNote();
                break;
            case -1:
                break;

            default:
                var frequency = _referenceTable[note];
                console.log(frequency);
                Synth.playNote(frequency);
                break;
        }
    }

    function play( content ) {
        _prepareReferenceTable();
        _stopped = false;
        _content = content;
		_timerId = null;
		_cursor = 0;
        _next();
    }

    function stop() {
        _stopped = true;
    }

    return {
        play: play,
        stop: stop
    };

}(Synth));

module.exports = Player;