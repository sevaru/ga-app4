var IndividualFactory = require('./IndividualFactory');
var Reporter = require('./Reporter');
var REFERENCE_INDIVIDUAL = require('./REFERENCE_INDIVIDUAL');
var $ = require("jquery");

var GA = (function( IndividualFactory, Reporter, referenceIndividual ) {

    var _options = {
        deathLimit: 0.7,
        count: 25,
		threshold: 0.9, /* End processing when someone near good (best 1) */
        maxIterations: 500,
        mutationProbability: 0.2,
        useRandomInitialIndividuals: true
    };

    var population = [];
    var bestGuys = [];



    //-----------------------------
    //  1. Initial Population
    //-----------------------------
    function _createInitialPopulation( options ) {
        population = [];

        for ( var i = 0; i < options.count; i++ ) {
            population.push(IndividualFactory.create(referenceIndividual, options.useRandomInitialIndividuals));    
        }
    }



    //-----------------------------
    //  2. Mutate/Crossover
    //-----------------------------
    function _crossover( options ) {
        population.forEach(function( item, index, array ) {
            var neightbour = (array.length === population.length)? array[0] : array[index + 1];
            item.crossover(neightbour);
        });
    }

    function _mutate( options ) {
        population.forEach(function( item ) {
            if ( Math.random() < options.mutationProbability ) {
                item.mutate(options);
            }
        });
    }



    //-----------------------------
    //  3. Selection
    //-----------------------------
    function _selection( options ) {
        bestGuys = population.filter(function( item ) {
			var itemFitness = item.fitness();
			return itemFitness > options.deathLimit;
        });
    }



    //-----------------------------
    //  4. Create New Population
    //-----------------------------
    function _createNewPopulation( options ) {
        var newPopulation = [];

        for ( var i = 0, l = (options.count - bestGuys.length); i < l; i++ ) {
            newPopulation.push(IndividualFactory.create(referenceIndividual));
        }

        population = bestGuys.concat(newPopulation);
    }



    //-----------------------------
    //  5. Finish!
    //-----------------------------
    function _isDone( options ) {
        return population.some(function( item ) {
			return !item.fitness() && item.fitness() > options.threshold;
        });
    }

    function run( preferences ) {
		var options = $.extend({}, _options, preferences);
		
        var i = 0;
		
        _createInitialPopulation(options);

        do {
            _mutate(options);
            _crossover(options);
            _selection(options);
            _createNewPopulation(options);
			i++;
			
			console.log("iteration: " + i);
			
        } while ( !_isDone(options) && i < options.maxIterations );
		
		population.unshift(IndividualFactory.create(referenceIndividual));
		
        return population;
    }

    return {
        run: run
    };

}( IndividualFactory, Reporter, REFERENCE_INDIVIDUAL ));

module.exports = GA;