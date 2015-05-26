var Individual = require("./Individual");

module.exports = {
    create: function( params ) {
        return new Individual(params);
    }
};
