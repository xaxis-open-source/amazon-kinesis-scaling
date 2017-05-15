module.exports = {

    isNull: function(v) {
        return v === null || typeof v === "undefined";
    },

    isNotNull: function(v) {
        return !(v === null || typeof v === "undefined");
    },

    isEmpty: function(str) {
        return !str;
    },

    isNotEmpty: function(str) {
        return (!str || 0 === str.length);
    },

    isFunction: function(functionToCheck) {
        var getType = {};
        return functionToCheck && getType.toString.call(functionToCheck) === '[object Function]';
    }
};
