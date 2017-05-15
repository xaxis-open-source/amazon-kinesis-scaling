/**
 * This class encapsulate cloudwatch wrapper for aws.
 * All cloudwatch related functions should be inside this file.
 * You can initialize cloudwatch it passing it aws object.
 * var cloudwatch = new(require("./cloudwatch"))(aws);
 * 
 */

/**
 * constructor to initialize cloudwatch service.
 */
function CloudWatch(aws) {
    this.cloudwatch = new aws.CloudWatch();
}

/**
 * This method return metric statistics as per given params
 * This method is used to get shard level metrics.
 * If startTime is not present in params then by default it fetch data for last 1 hour.
 * If endTime is not present in params then by default it fetch data upto current time.
 */
CloudWatch.prototype.getMetricStatistics = function(params, callback) {
    var endTime = new Date();
    var startTime = new Date();
    startTime.setMinutes(startTime.getMinutes() - 60); //last 1 hour data

    if (!params.StartTime) {
        params.StartTime = startTime.toISOString();
    }
    if (!params.EndTime) {
        params.EndTime = endTime.toISOString();
    }

    this.cloudwatch.getMetricStatistics(params, callback);
};

module.exports = CloudWatch;
