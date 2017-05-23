var _ = require("lodash");

function LoadGenerator(config) {
    this.config = config;
    this.qps = this.config.qps;
    this.time = this.config.time * 1000; //convert in ms
}

LoadGenerator.prototype.start = function() {
    console.log("starting load test with config", this.config);

    var self = this;

    _.each(this.config.series, function(item, index) {
        setTimeout(function() {
            sendRequest(item.qps, item.time, new Date().getTime());
        }, totalPreviousSum(self.config.series, index) * 1000);
    });

    function totalPreviousSum(array, index) {
        if (index === 0) {
            return 0;
        }
        var total = 0;
        for (var i = index - 1; i >= 0; i--) {
            total = total + array[i].time;
        }
        
        return total;
    }

    function sendRequest(qps, time, startTime) {
        for (var i = 0; i < qps; i++) {
            self.config.callback(self);
        }

        var currentTime = new Date().getTime();

        if ((currentTime - startTime) >= (time * 1000)) {
            //console.log("load test complete", qps, time);
        } else {
            setTimeout(function() {
                sendRequest(qps, time, startTime);
            }, 1000);
        }
    }

};

module.exports = LoadGenerator;