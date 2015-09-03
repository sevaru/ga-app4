var Synth = (function() {

    // Create Web Audio Context.
    var context = new AudioContext(),
        currentOscillator;

    function playNote(frequency) {
        // Create oscillator and gain node.
        var oscillator = context.createOscillator(),
            gainNode = context.createGain();

        // Disconnect existing oscillator if there is one.
        if (currentOscillator) {
            currentOscillator.disconnect();
        }

        // Set the type and frequency of the oscillator.
        oscillator.type = "square";
        oscillator.frequency.value = frequency;

        // Set volume of the oscillator.
        gainNode.gain.value = 0.3;

        // Route oscillator through gain node to speakers.
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        // Set the current oscillator to the one we've just created.
        currentOscillator = oscillator;

        // Start oscillator playing.
        oscillator.start(0); // This will be replaced by start() soon.
    }

    function stopNote() {
        if (!currentOscillator) {
            return;
        }
        // Stop the current Oscillator from playing then disconnect it.
        currentOscillator.stop(0); // This will be replace by stop() soon.
        currentOscillator.disconnect();
    }

    return {
        playNote: playNote,
        stopNote: stopNote
    };

}());

module.exports = Synth;
