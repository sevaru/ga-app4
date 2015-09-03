//IMPORTS
var GA = require("./GA");
var Converter = require("./Converter");
var ABCJS = require("ABCJS");
var Player = require("./Player");
var $ = require("jquery");
var PubSub = require("./lib/PubSub");
var Templates = require("./Templates");
var Timer = require("./Timer");
var Config = require("./Config");

//VARIABLES
var population = null;
var current = null;
var _elKeys = ["individuals", "abc-content", "play", "stop", "generate", "config"];
var $els = {};

function applySubscriptions() {
	PubSub.subscribe("render", render);
	PubSub.subscribe("rebind", rebind);
}

function init() {
	Timer.start("(Cache DOM elements) Timing");
	_cacheEls();
	Timer.end();
	
	Config.init($els["config"]);
	applySubscriptions();
	PubSub.publish("rebind");
}

function generatePopulation( config ) {
	Timer.start("(Generate Population) Timing");
	population = GA.run(config);

	population = population.map(function(item) {
		item.abc = Converter.convert(item.content());
		return item;
	});

	Timer.end();
	PubSub.publish("render");
	PubSub.publish("rebind");
}

function _cacheEls() {
	_elKeys.forEach(function( item ) {
		var $el = $("[data-id='" + item + "']");
		
		if ( !$el || $el.length === 0 ) {
			return;
		}
		
		$els[item] = $el;
	});
}

function render() {
	
	var dom = [];
	
	population.forEach(function( item, index ) {
		var data = {
			index: index,
			fitness: item.fitness()
		};
		var $html = Templates["individual"](data);
		dom.push($html);
	});
	
	$els["individuals"].empty();
	$els["individuals"].append(dom);
	
}

function rebind() {
	var callbackBindings = $("[data-type='callback']");
	
	$els["individuals"].off("click").on("click", function() {
		callbackBindings.removeClass("active");
	});
	
	$els["play"].off("click").on("click", function() {
		play();
	});
	
	$els["stop"].off("click").on("click", function() {
		stop();
	});
	
	$els["generate"].off("click").on("click", function() {
		generatePopulation(Config.collect());
	});
	
	callbackBindings.off('click').on('click', function(e) {
		var $this = $(this);
		
		var callback = $this.data("callback");
		
				
		switch( callback ) {
			case "select":
				e.stopPropagation();
				var id = $this.data("id");

				if ( id === null || id === undefined ) {
					return;
				}
				
				callbackBindings.removeClass("active");
				$this.addClass("active");
				select(id);
				abc();
				break;
		}
	});
}

function abc() {
	if ( !current ) {
		return false;
	}
	
	renderScores(current.abc);
}

function play() {
	Player.stop();
	if ( !current ) {
		return false;
	}
	console.log("play");
	Player.play(current.content());
}

function stop() {
	console.log("stopped");
	Player.stop();
}

function renderScores( abcScores ) {
	var $el = $els["abc-content"];
	$el.empty();
	console.log(abcScores);
	ABCJS.renderAbc($el.get(0), abcScores, null, {
		scale: 1
	});
}

function select( id ) {
	if ( !population[id] ) {
		throw new TypeError("id should be index in array: " + id + " not found.");
	}
	
	current = population[id];
	current.id = id;
}

module.exports = {
	init: init,
	play: play,
	stop: stop,
	select: select
};
