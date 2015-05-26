function checkArray( arr ) {
	if ( !Array.isArray(arr) ) {
		throw new TypeError("arr should be an array " + arr + " given.");
	}
}

function checkObj( obj ) {
	if ( !obj || typeof obj !== "object" ) {
		throw new TypeError('obj should be an object ${obj} given');
	}
}

var array = {
	make: function( value, length ) {
		var arr = [], i = length;
		while( i-- ) {
			arr[i] = value;
		}
		return arr;
	},
	randomKey: function( arr ) {
		checkArray(arr);
		return Math.floor(Math.random() * arr.length);
	},
	
	randomElement: function( arr ) {
		var randomKey = array.randomKey(arr);
		return arr[randomKey];
	},
	
	findObjectByKey: function( array, field, value ) {
		var filtered = array.filter(function( element ) {
			return (element.hasOwnProperty(field) && element[field] === value);
		});
		
		return filtered[0];
	}
};

var obj = {
	randomElement: function( obj ) {
		checkObj(obj);
		
		var keys = Object.keys(obj);
		
		var randomKey = array.randomElement(keys);
		
		return obj[randomKey];
	}
};

module.exports = {
	array: array,
	obj: obj
};