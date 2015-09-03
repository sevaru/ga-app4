var Mutator = require("./Mutator");
var utils = require("../utils");
var Config = require("../Config");


var basic = require("./basic"); 
var upAndDown = require("./upAndDown");

var Mutations = {
	basic: Mutator.make(basic),
	upAndDown: Mutator.make(upAndDown, function( data ) {
		return utils.array.make(Config.mutations.upAndDown, data.length);
	})
};

module.exports = Mutations;