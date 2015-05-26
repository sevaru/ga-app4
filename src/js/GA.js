var IndividualFactory = require('./IndividualFactory');
var Reporter = require('./Reporter');
var REFERENCE_INDIVIDUAL = require('./REFERENCE_INDIVIDUAL');
var $ = require("jquery");

var GA = (function( IndividualFactory, Reporter, referenceIndividual ) {

    var options = {
        deathLimit: 0.3,
        count: 20,
		threshold: 0.8,
        maxIterations: 100
    };

    var population = [];
    var bestGuys = [];



    //-----------------------------
    //  1. Initial Population
    //-----------------------------
    function _createInitialPopulation() {
        population = [];

        for ( var i = 0; i < options.count; i++ ) {
            population.push(IndividualFactory.create(referenceIndividual));    
        }
    }



    //-----------------------------
    //  2. Mutate/Crossover
    //-----------------------------
    function _crossover() {
        population.forEach(function( item, index, array ) {
            var neightbour = (array.length === population.length)? array[0] : array[index + 1];
            item.crossover(neightbour);
        });
    }

    function _mutate() {
        population.forEach(function( item ) {
            item.mutate();
        });
    }



    //-----------------------------
    //  3. Selection
    //-----------------------------
    function _selection() {
        bestGuys = population.filter(function( item ) {
			var itemFitness = item.fitness();
			return itemFitness > options.deathLimit;
        });
    }



    //-----------------------------
    //  4. Create New Population
    //-----------------------------
    function _createNewPopulation() {
        var newPopulation = [];

        for ( var i = 0, l = (options.count - bestGuys.length); i < l; i++ ) {
            newPopulation.push(IndividualFactory.create(referenceIndividual));
        }

        population = bestGuys.concat(newPopulation);
    }



    //-----------------------------
    //  5. Finish!
    //-----------------------------
    function _isDone() {
        return population.some(function( item ) {
			return !item.fitness() && item.fitness() > options.threshold;
        });
    }

    function run( preferences ) {
		options = $.extend({}, options, preferences);
		
        var i = 0;
		
        _createInitialPopulation();

        do {
            _mutate();
            _crossover();
            _selection();
            _createNewPopulation();
			i++;
			
			console.log("iteration: " + i);
			
        } while ( !_isDone() && i < options.maxIterations );
		
		population.unshift(IndividualFactory.create(referenceIndividual));
		
        return population;
    }

    return {
        run: run
    };

}( IndividualFactory, Reporter, REFERENCE_INDIVIDUAL ));

module.exports = GA;