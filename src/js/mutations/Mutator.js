var utils = require("../utils");

function _defaultWeights( data ) {
	return utils.array.make(0.5, data.length);
}

/* 
	#Contract 
	data is an array;
*/
function _validate( data, mutationFunc, weightsFunction ) {

	if ( !Array.isArray( data ) ) {
		throw new TypeError("Invalid argument data. Should be an array.");
	}
	
	if ( typeof mutationFunc !== "function" ) {
		throw new TypeError("Invalid argument mutateFunc. Should be function.");
	}
	
	if ( weightsFunction && typeof weightsFunction !== "function" ) {
		throw new TypeError("Invalid argument weightsFunction. Should be function.");
	}

}

function make( mutationFunc, weightsFunction ) {
	return function( data, options ) {
		/*Throw on errors*/
		_validate( data, mutationFunc, weightsFunction );
		
		options = options || {};
		
		/* Default weights or custom if specified */
		var weights = weightsFunction? weightsFunction(data) : _defaultWeights(data);
		return mutationFunc( data.slice(), weights, options );
	};
} 

module.exports = {
	make: make
};