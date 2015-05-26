var Mutations = require("./mutations/Mutations");
var Utils = require("./utils");

// 1. Init
// 2. Mutate/Crossover      -|
// 3. Selection              |
// 4. Create new population -|
// 5. Is done -> Finish!
var Individual = function( referenceIndividualContent )  {
	
	var _reference = referenceIndividualContent;
	var _content = _reference.slice() || [];

    function mutate() {
		var mutateFunction = Utils.obj.randomElement(Mutations);
		_content = mutateFunction(_content);
    }
    

    function crossover( someone ) {
        var someoneGens = someone.content();
        var myGens = content();
		
        for ( var i = 0, l = _content.length; i < l; i++ ) {
            var item = (Math.random() > 0.5)? myGens[i] : someoneGens[i];
            _content[i] = item; 
        }
    }

    function content() {
        return _content;
    }

    function fitness() {
		/*1) Fitness by reference individual*/
		/* assume check notes or structure ([14,]-1,-1,-1 == [15,]-1,-1,-1 ) */
		var length = _content.length;
		var weight = 0;
		
		for ( var i = 0; i < length; i++ ) {
			weight += +(_content[i] === _reference[i]);
		}
		
		return weight/length;
    }
 
    /* PUBLIC INTERFACE */
    this.crossover = crossover;
    this.mutate = mutate;
    this.content = content;
    this.fitness = fitness;
};

module.exports = Individual;