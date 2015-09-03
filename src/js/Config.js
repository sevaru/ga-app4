var PubSub = require("./lib/PubSub");
var Templates = require("./Templates");
var validate = require("./validate");
var $ = require("jquery");
var utils = require("./utils");


var localConfig = {
	items: [
		{
			"field": "maxIterations",
			"description": "Max count of iterations in GA",
			"type": "number",
			"additionalAttributes": "max=1000 min=0"
		},
		{
			"field": "deathLimit",
			"description": "Threshold for selection",
			"type": "number",
			"additionalAttributes": "max=1 min=0"
		},
		{
			"field": "count",
			"description": "Count of individual in population",
			"type": "number",
			"additionalAttributes": "max=1000 min=0"
		},
		{
			"field": "threshold",
			"description": "Threshold for Algorithm",
			"type": "number",
			"additionalAttributes": "max=1 min=0"
		},
		{
			"field": "mutationProbability",
			"type": "number"
		},
		{
			"field": "useRandomInitialIndividuals",
			"type": "boolean"
		}
	]
};


var $host = null;

function generateHTML() {
	return Templates["config"](localConfig);
}

function collect() {
	var result = {};
	$host.find("[data-config-field]").each(function( index, element ) {
		var field, info, value, $element;
		
		$element = $(element);
		field = $element.data("config-field");
		info = utils.array.findObjectByKey(localConfig.items, "field", field);
		
		if ( !info ) {
			return void(0);
		}
		
		value = $element.val();
		
		switch( info.type ) {
			case "number":
				value = +value;
				break;
			case "boolean":
				value = !!value;
				break;
			case "string":
				value = "" + value;
				break;
		}

		//value = validate(value, info.validation);
		
		result[field] = value;
	});
	
	return result;
}

var Config = {
	init: function( $el ) {
		$host = $el;
		//$host.empty();
		//$host.append(generateHTML());
		PubSub.publish("Config/inited");
	},
	
	collect: collect,

	mutations: {
		upAndDown: 0.7
	}
};


module.exports = Config;