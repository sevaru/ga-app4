var Mutator = require("./Mutator");

var basic = require("./basic"); 


var Mutations = {
	basic: Mutator.make(basic)
};

module.exports = Mutations;