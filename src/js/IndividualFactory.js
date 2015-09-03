var Individual = require("./Individual");

module.exports = {
    create: function( params, param2 ) {
        return new Individual(params, param2);
    }
};
