/**
 * This file contains method to watch cloudwatch for kinesis shards metrics and split or merge shards based on traffic.
 * Enhanced Monitoring must be enabled for stream to get shard level metrics.
 * This application check if enhanced monitoring is enabled or not for stream.
 * If enhanced monitoring is not enabled then it first enable enhance monitoring.
 * If for some reason enhanced monitoring is not enable then exit by calling error callback.
 * 
 * Do not do both splitting and merging in same iteration. If application is doing any splitting/merging then wait for sometime and again gather
 * metrics.

 * Every 1 minute we get stream details which contains information about all shards.
 * Filter only open shard and sort shards based on StartingHashKey
 * Iterate every shard and collect incomingrecords for each shard and then call autoScale by passing all shards and shard metrics
 * We first check for splitting.
 * Iterate each shard and check if any shard exceeded threshold(shardLimit) for last n minute(defined by scalingDuration).
 * It it exceeded and maxShard limit has not reached then split shard by selecting mid value of current shard as new starting key for child shard.
 * Wait for stream to become active and again check for scaling after n minute(defined by splitNextInterval).
 * If there is any splitting process going on then don't check for merging
 * If no splitting is need then check if any shards need merging.
 * If number of shards is 1 then we don't need to do anything and again check after autoScaleInterval minute.
 * Iterate each shard and calculate sum for current shard and adjacent shard.
 * If sum of 2 adjacent shards is below than shardLimit for last scalingDuration minute then merge these shards.
 * Wait for stream to become active and again check after mergeNextInterval minute.
 */

var _ = require("lodash");
var util = new require("./util");

module.exports = scaling;

function scaling(options) {

    console.log("input params ", options);

    var defaults = require("./defaults");

    var config = _.extend({}, defaults, options);

    this.config = config;

}

/**
 * User need to call these method to start monitoring of shards
 */
scaling.prototype.start = function(fnError, fnSuccess) {
    //check if all(4 user supplied required fields) are given or not.
    var error = validate(this.config);

    if (error !== null) {
        fnError.call(this, {
            error: error,
            message: "input is invalid"
        });
        return error;
    }

    var configPrint = _.clone(this.config);//we print this object to console after removing accessKey and secretKey
    configPrint.accessKeyId = "accessKeyId";
    configPrint.secretAccessKey = "secretAccessKey";
    console.log("initialize kinesis scaling with ", configPrint);

    var aws = new require("./aws")(this.config);
    var kinesis = new(require("./kinesis"))(aws);
    var cloudwatch = new(require("./cloudwatch"))(aws);
    var sns = new(require("./sns"))(aws);
    var that = this;
    var streamName = that.config.streamName;
    var scalingSplitDuration = that.config.scalingSplitDuration;
    var scalingMergeDuration = that.config.scalingMergeDuration;
    var maxShard = that.config.maxShard;
    var shardLimit = that.config.shardLimit * 60; //convert into minutes
    var spareShard = that.config.spareShard;
    var snsTopic = that.config.snsTopic;
    var splitNextIntervalInMs = that.config.splitNextInterval * (60 * 1000); //convert into ms
    var mergeNextIntervalInMs = that.config.mergeNextInterval * (60 * 1000); //convert into ms
    var autoScaleIntervalInMs = that.config.autoScaleInterval * (60 * 1000); //convert into ms

    //this contains shard creation time, we use it while checking for merging, do not merge shards whose creation time is less than mergeNextInterval
    var shardsInfo = {};
    validateStream(fnError, fnSuccess, 0);

    /**
     * This method check if stream has enhanced monitoring enabled.
     * If it is not enable then call enhanced monitoring.
     * If enhanced monitoring is successfull then call scale to start monitoring shards traffic.
     * If it not able to set enhanced monitoring then exit after calling user supplied fnError
     */
    function validateStream(fnError, fnSuccess, index) {
        console.log("checking if stream has enhancedmonitoring enabled");

        kinesis.describeStream(that.config.streamName, function(err, data) {
            if (err) {
                console.log("error while getting stream details", err);
                fnError.call(this, {
                    error: err,
                    message: "error while getting stream details"
                });
                return;
            }
            var isShardMetrics = isEnhancedMonitoring(data);

            if (isShardMetrics === true) {
                scale();
            } else {
                //calling kinesis to enable enhanced monitoring
                kinesis.enableEnhancedMonitoring(that.config.streamName, function(err, data) {
                    if (err) {
                        console.log("error in enabling enhanced monitoring for stream");
                        fnError.call(this, {
                            error: "shard level metrics are not enable.",
                            message: "error while setting enhancedmonitoring : " + JSON.stringify(err)
                        });
                        return;
                    }
                    console.log("after calling enable enhanced monitoring, data = ", data);

                    kinesis.waitsFor(streamName, function(err, data) {
                        if (err) {
                            fnError.call(this, {
                                error: "shard level metrics are not enable.",
                                message: "error while setting enhancedmonitoring : " + JSON.stringify(err)
                            });
                            return;
                        }
                        scale();
                    });
                });
            }
        });
    }

    function scale() {
        console.log("start scaling for streamName = ", that.config.streamName);

        kinesis.describeStream(that.config.streamName, function(err, data) {
            if (err) {
                console.log("error in fetching stream details", err);
                return;
            }

            //filter closed shards, open shard has null SequenceNumberRange.EndingSequenceNumber
            //closed shard has not null SequenceNumberRange.EndingSequenceNumber
            var shards = _.filter(data.StreamDescription.Shards, function(item) {
                return _.isUndefined(item.SequenceNumberRange.EndingSequenceNumber) || _.isNull(item.SequenceNumberRange.EndingSequenceNumber);
            });

            shards = _.sortBy(shards, function(item) {
                return String("000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" + item.HashKeyRange.StartingHashKey).slice(-100);
            });

            console.log("total number of shards after filtering and sorting = " + JSON.stringify(shards));

            var shardsMetrics = [];

            _.each(shards, function(shard) {
                getShardMetrics(shard, function(data) {
                    var dataPoints = _.sortBy(data.Datapoints, ["Timestamp"]).reverse();

                    shardsMetrics.push({
                        shardId: shard.ShardId,
                        dataPoints: dataPoints,
                        startingHashKey: shard.HashKeyRange.StartingHashKey,
                        endingHashKey: shard.HashKeyRange.EndingHashKey
                    });

                    if(util.isNull(shardsInfo[shard.ShardId])){
                        //this is most probably new shard or our application just started
                        console.log('shardsInfo is null for' + shard.ShardId);
                        shardsInfo[shard.ShardId] = {
                            creation: new Date()
                        };
                    } else {
                        console.log('shardsInfo is not null for' + shard.ShardId);
                        console.log(shardsInfo[shard.ShardId]);
                    }

                    //only call checking for splitting and merging after getting shard metrics for all shards
                    if (shardsMetrics.length >= shards.length) {
                        var sortedShardsMetrics = _.sortBy(shardsMetrics, function(item) {
                            return String("000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" + item.startingHashKey).slice(-100);
                        });
                        autoScale(shards, sortedShardsMetrics);
                    }
                });
            });

        });
    }

    /**
     * This method return error if any of 4 required fields are missing.
     */
    function validate(config) {
        var error = [];

        if (_.isEmpty(config.accessKeyId)) {
            error.push("aws accessKeyId must be present");
        }
        if (_.isEmpty(config.secretAccessKey)) {
            error.push("aws secretAccessKey must be present");
        }
        if (_.isEmpty(config.region)) {
            error.push("aws region must be present");
        }
        if (_.isEmpty(config.streamName)) {
            error.push("aws streamName must be present");
        }

        return error.length === 0 ? null : error;
    }

    function isEnhancedMonitoring(data) {
        var isEnhancedMonitoringEnable = false;
        var enhancedmonitoring = data.StreamDescription.EnhancedMonitoring;
        for (var i = 0; i < enhancedmonitoring.length; i++) {
            var item = enhancedmonitoring[i];

            if (item.ShardLevelMetrics) {
                if (item.ShardLevelMetrics.indexOf("IncomingRecords") > -1) {
                    isEnhancedMonitoringEnable = true;
                }
            }
        }
        return isEnhancedMonitoringEnable;
    }

    function getShardMetrics(shard, callback) {
        console.log("getting shard metrics for shardId = " + shard.ShardId);
        var endTime = new Date();
        var startTime = new Date();
        var maxDuration = Math.max(that.config.scalingSplitDuration, that.config.scalingMergeDuration);
        startTime.setMinutes(startTime.getMinutes() - (maxDuration + 10));
        var shardMetricsParam = {
            Statistics: [
                'Sum'
            ],
            StartTime: startTime.toISOString(),
            EndTime: endTime.toISOString(),
            Unit: 'Count',
            Period: 60,
            MetricName: 'IncomingRecords',
            Namespace: 'AWS/Kinesis',
            Dimensions: [{
                Name: 'StreamName',
                Value: that.config.streamName
            }, {
                Name: 'ShardId',
                Value: shard.ShardId
            }]
        };
        console.log("calling shard metrics : params = " + JSON.stringify(shardMetricsParam));
        //get metrics from cloudwatch for every shard
        cloudwatch.getMetricStatistics(shardMetricsParam, function(err, data) {
            if (err) {
                console.log("erro after calling shard metrics , shardId = " + shard.ShardId + ", error " + JSON.stringify(err));
                return;
            }
            console.log('shard metrics , data = ' + JSON.stringify(data));
            callback.call(this, data);
        });
    }

    function autoScale(shards, shardsMetrics) {
        console.log("checking for shard scaling : shardsMetrics = " + JSON.stringify(shardsMetrics));
        console.log("shards creation time =", shardsInfo);
        var datesSplit = [];
        for (var i = 0; i < that.config.scalingSplitDuration; i++) {
            var date = new Date();
            date.setSeconds(0);
            date.setMinutes(date.getMinutes() - (i + 1));//1 minute before
            date.setMilliseconds(0);
            datesSplit.push({
                date: date.toISOString()
            });
        }

        var datesMerge = [];
        for (var i = 0; i < that.config.scalingMergeDuration; i++) {
            var date = new Date();
            date.setSeconds(0);
            date.setMinutes(date.getMinutes() - (i + 1));//1 minute before
            date.setMilliseconds(0);
            datesMerge.push({
                date: date.toISOString()
            });
        }

        var isSplit = false;

        //checking if shard needs to be split
        if ((shards.length < maxShard) && isSplit === false) {
            for (i = 0; i < shards.length; i++) {
                var shard = shards[i];
                //check if every datapoints(last scalingSplitDuration minute) is greater than shardLimit then split current shard
                var countBreachSplit = 0;
                for (j = 0; j < that.config.scalingSplitDuration; j++) {
                    //dataPoints from cloudwatch may contain less data
                    var shardData = getShardData(shardsMetrics, shard.ShardId, datesSplit[j].date);
                    console.log("shardId = " + shard.ShardId + ", date = " + datesSplit[j].date + " , data = " + shardData);
                    if (shardData > shardLimit) {
                        countBreachSplit++;
                    }
                }
                console.log("checking for spliting shardId = " + shard.ShardId + " , countBreachSplit = " + countBreachSplit + " , scalingSplitDuration = " + scalingSplitDuration);
                if (countBreachSplit >= scalingSplitDuration) {
                    isSplit = true;
                    splitShard(shard);

                    //we split only shard at one go, do not check for other shards.If needed other shards will be split in next round.
                    break;
                }
            }
        } else {
            console.log("maxShard limit reaches, no need to check for splitting");
        }

        //check if shards need merging
        var isMerge = false;

        if (shards.length > 1 && isSplit === false) {
            console.log("checking if shards need merging");

            var currentDate = new Date();
            console.log("shardsInfo ", shardsInfo);
            for (i = 0; i < shards.length - 1; i++) {

                var shard1 = shards[i];
                var shard2 = shards[i + 1];

                if(util.isNull(shardsInfo[shard1.ShardId])){
                    console.log("no info for this shard in shardsinfo, skipping this shard");
                    continue;
                }

                if((currentDate.getTime() - shardsInfo[shard1.ShardId].creation.getTime()) < mergeNextIntervalInMs){
                    console.log("creation time for shards1 is less than merge interval, moving to next shard", shard1);
                    continue;
                }     

                if((currentDate.getTime() - shardsInfo[shard2.ShardId].creation.getTime()) < mergeNextIntervalInMs){
                    console.log("creation time for shards2 is less than merge interval, moving to next shard", shard2);
                    continue;
                }     

                var countBreachMerge = 0;

                for (var j = 0; j < that.config.scalingMergeDuration; j++) {
                    var shard1Data = getShardData(shardsMetrics, shard1.ShardId, datesMerge[j].date);
                    var shard2Data = getShardData(shardsMetrics, shard2.ShardId, datesMerge[j].date);

                    console.log("shard1Data = " + shard1Data + ", shard2Data = " + shard2Data + ", timeStamp = " + datesMerge[j].date);
                    if ((shard1Data + shard2Data) < shardLimit) {
                        countBreachMerge++;
                    }
                    
                }

                if (countBreachMerge >= that.config.scalingMergeDuration) {
                    isMerge = true;
                    console.log("countBreachMerge = " + countBreachMerge + ", scalingMergeDuration = " + scalingMergeDuration + ", merge shards");
                    mergeShard(shard1, shard2);

                    //no need to process further as we already started merging process
                    break;
                } else {
                    console.log("countBreachMerge = " + countBreachMerge + ", scalingMergeDuration = " + scalingMergeDuration + ", no need to merge");
                }
            }

        } else {
            console.log("no need to merge, shard.length = " + shards.length + ", and isSplit = " + isSplit);
        }

        if (isSplit === false && isMerge === false) {
            console.log("no splitting and merging : again check after " + that.config.autoScaleInterval + " min");
            setTimeout(function() {
                scale();
            }, autoScaleIntervalInMs);
        }

    }

    function splitShard(shard) {
        console.log("splitting shard = " + shard.ShardId);
        //StartingHashKey and EndingHashKey for kinesis is very big number like 340282366920938463463374607431768211455, so use big-number
        var diffStartEndKey = require("big-number")(shard.HashKeyRange.EndingHashKey).minus(shard.HashKeyRange.StartingHashKey);
        diffStartEndKey = diffStartEndKey.divide(2);
        var newStartingKey = require("big-number")(shard.HashKeyRange.StartingHashKey).plus(diffStartEndKey);

        var params = {
            NewStartingHashKey: newStartingKey.toString(),
            ShardToSplit: shard.ShardId,
            StreamName: streamName
        };
        if (_.isFunction(that.config.fnBeforeSplit)) {
            that.config.fnBeforeSplit.call(this, params);
        }
        kinesis.splitShard(params, function(err, data) {
            if (err) {
                console.log("error occurs while splitting shard = " + shard.ShardId + ", error = " + JSON.stringify(err));
                if (!_.isNull(snsTopic)) {
                    sns.publish({
                        Message: 'Kinesis shard(' + shard.ShardId + ')  error in split at  ' + new Date().toISOString() + ". Error : " + JSON.stringify(err),
                        MessageStructure: 'String',
                        Subject: 'kinesis shards split notification - error',
                        TopicArn: snsTopic
                    });
                }

                setTimeout(function() {
                    scale();
                }, splitNextIntervalInMs);

                return;
            }
            console.log("scaling : splitshard data =" + JSON.stringify(data));

            kinesis.waitsFor(streamName, function(err, data) {
                console.log("scaling : stream status becomes active after splitting, again checking after " + that.config.splitNextInterval + " min");

                if (!_.isNull(that.config.fnAfterSplit)) {
                    that.config.fnAfterSplit.call(this, data);
                }

                //send notification after successfull split
                if (!_.isNull(snsTopic)) {
                    sns.publish({
                        Message: 'Kinesis shard(' + shard.ShardId + ')  successfull split at  ' + new Date().toISOString() + ". ",
                        MessageStructure: 'String',
                        Subject: 'kinesis shards split notification - successfull',
                        TopicArn: snsTopic
                    });
                }

                //check for scaling again
                setTimeout(function() {
                    scale();
                }, splitNextIntervalInMs);
            });
        });

    }

    function mergeShard(shard1, shard2) {
        console.log("merging shards , shardId1, shardId2", shard1.ShardId, shard2.ShardId);
        var mergeParams = {
            AdjacentShardToMerge: shard2.ShardId,
            ShardToMerge: shard1.ShardId,
            StreamName: streamName
        };

        if (!_.isNull(that.config.fnBeforeMerge)) {
            that.config.fnBeforeMerge.call(this, mergeParams);
        }

        kinesis.mergeShards(mergeParams, function(err, data) {
            if (err) {
                console.log("after merging, error occurs = " + JSON.stringify(err));
                setTimeout(function() {
                    scale();
                }, mergeNextIntervalInMs);

                if (!_.isNull(snsTopic)) {
                    sns.publish({
                        Message: 'Kinesis shard(' + shard1.ShardId + ', ' + shard2.ShardId + ')  error in merging at  ' + new Date().toISOString() + ". Error is " + JSON.stringify(err),
                        MessageStructure: 'String',
                        Subject: 'kinesis shards merge notification - error',
                        TopicArn: snsTopic
                    });
                }

                return;
            }

            kinesis.waitsFor(streamName, function(err, data) {
                console.log("stream status becomes active, again checking after " + that.config.mergeNextInterval + " min");
                setTimeout(function() {
                    scale();
                }, mergeNextIntervalInMs);

                if (!_.isNull(that.config.fnAfterMerge)) {
                    that.config.fnAfterMerge.call(this, data);
                }

                if (!_.isNull(snsTopic)) {
                    sns.publish({
                        Message: 'Kinesis shard(' + shard1.ShardId + ', ' + shard2.ShardId + ')  successfull merging at  ' + new Date().toISOString() + ". ",
                        MessageStructure: 'String',
                        Subject: 'kinesis shards merge notification - successfull',
                        TopicArn: snsTopic
                    });
                }
            });

        });
    }

    /**
     * This function return total sum of all shards.
     */
    function getTotalShardData(shards) {
        var totalShardData = 0;
        for (i = 0; i < shards.length; i++) {
            totalShardData = totalShardData + shards[i].Sum;
        }

        return totalShardData;
    }

    function getShardData(shardsMetrics, shardId, timeStamp) {
        var shard = _.find(shardsMetrics, function(item) {
            return item.shardId == shardId;
        });
        var data = -1;
        if (!_.isUndefined(shard) && !_.isNull(shard)) {
            data = _.find(shard.dataPoints, function(item) {
                return JSON.stringify(item.Timestamp) == JSON.stringify(timeStamp); //TODO need to find better way for comparison
            });

            if (_.isUndefined(data) || _.isNull(data)) {
                data = -1;
            } else {
                data = data.Sum;
            }
        }

        return data;
    }

};
