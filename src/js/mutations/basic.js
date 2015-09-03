function mutate( data, weights, options ) {
	
	for ( var i = 0, l = data.length; i < l; i++ ) {
		
		if ( Math.random() < weights[i] ) {
			continue;
		}

		
		/* MUTATION FUNCTION */
		if ( i === data.length - 1) {
			continue;
		}

		var temp = data[i];

		data[i] = data[i + 1];
		data[i + 1] = temp;
		
	}

	return data;
}

module.exports = mutate;
