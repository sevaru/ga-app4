module.exports = function mutate( data, weights, options ) {
	for ( var i = 0, l = data.length; i < l; i++ ) {
		
		if ( Math.random() < weights[i] ) {
			continue;
		}

		if ( Math.random() > 0.5 ) {
			if ( data[i] < 14 ) {
				data[i] = data[i] + 1;
			}
		} else {
			if ( data[i] > 2 ) {
				data[i] = data[i] - 1;
			}
		}
		
	}

	return data;
}