var rules = {
	range: (function() {
		var prefix = "range:";
		var regexp = /\[(\d),(\d)\]/;
		
		
		function getParams( string ) {
			
			var result = regexp.exec(string);
			
			if ( !result ) {
				return false;
			}
			
			return { 
				"from": result[1],
				"to": result[2] 
		    };
		}
				
		function run( data, paramsString ) {
			var params = getParams(paramsString);
			if ( !params ) {
				return false;
			}
			
			return data >= params.to && data <= params.from; 
		}
				
		return {
			prefix: prefix,
			run: run
		};
	})()
};



function validate( value, rule ) {

/*	var rulesObjs = Object.keys(rules).filter(function( key ) {
		return rule.indexOf(rule[key].prefix) !== -1;
	});
*/	
	if ( !rulesObjs || !rulesObjs.length ) {
		return false;
	}
	
	
}


module.exports = validate;