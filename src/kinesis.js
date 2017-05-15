/**
 * This class encapsulate kinesis wrapper for aws.
 * All kinesis related functions should be inside this file.
 * You can initialize kinesis it passing it aws object.
 * var kinesis = new(require("./kinesis"))(aws);
 */

var node_uuid = require("node-uuid");
var _ = require("lodash");

/**
 * constructor to initialize Kinesis service.
 */
function Kinesis(aws) {
    this.aws = aws;
    this.kinesis = new this.aws.Kinesis();
}

Kinesis.prototype.createStream = function(streamName, callback) {
    var params = {
        ShardCount: 1,
        StreamName: streamName
    };
    this.kinesis.createStream(params, callback);
};

Kinesis.prototype.listStreams = function(callback) {
    this.kinesis.listStreams({}, callback);
};

Kinesis.prototype.deleteStream = function(streamName, callback) {
    this.kinesis.deleteStream({
        StreamName: streamName
    }, callback);
};

Kinesis.prototype.describeStream = function(streamName, callback) {
    var params = {
        StreamName: streamName,
        Limit: 1000
    };
    console.log("calling describeStream with params = ", params);
    this.kinesis.describeStream(params, callback);
};

/**
 * Cloudwatch provide stream level metrics free of cost but charges nominal for shard level metrics.
 * We need to explicitly enable shard level metrics.
 * This method enable shard level metrics for incoming records.
 */
Kinesis.prototype.enableEnhancedMonitoring = function(streamName, callback) {
    var params = {
        "ShardLevelMetrics": [
            "IncomingRecords"
        ],
        "StreamName": streamName
    };
    console.log("calling enableEnhancedMonitoring with params = ", params);
    this.kinesis.enableEnhancedMonitoring(params, function(err, data) {
        callback.call(this, err, data);
    });

};

Kinesis.prototype.splitShard = function(params, callback) {
    console.log("kinesis.splitShard : params = " + JSON.stringify(params));
    this.kinesis.splitShard(params, callback);
};

Kinesis.prototype.mergeShards = function(params, callback) {
    console.log("kinesis.mergeShards : params = " + JSON.stringify(params));
    this.kinesis.mergeShards(params, callback);
};

/**
 * It put record into kinesis. If partition key is not provided then it uses uuid 
 * as partitionkey. using uuid as partition key send data evenly to all shards
 */
Kinesis.prototype.putRecord = function(streamName, params, partitionKey, callback) {
    if (_.isUndefined(partitionKey) || _.isNull(partitionKey)) {
        partitionKey = node_uuid.v4();
    }
    var kinesisParams = {
        Data: params,
        StreamName: streamName,
        PartitionKey: partitionKey
    };

    if (_.isUndefined(callback)) {
        var awsKinesis = this.kinesis.putRecord(kinesisParams);
        awsKinesis.send();
    } else {
        this.kinesis.putRecord(kinesisParams, callback);
    }

};

/**
 * It keep checking(30 sec interval) untill stream becomes active and then function callback.
 * It is generally used after splitting and merging stream.
 */
Kinesis.prototype.waitsFor = function(streamName, callback) {
    var self = this;

    var params = {
        StreamName: streamName,
        Limit: 1000
    };

    this.kinesis.describeStream(params, function(err, data) {
        if (err) {
            console.log("error while checking for stream statys", err);
            return;
        }
        var status = data.StreamDescription.StreamStatus;
        console.log("kinesis.waitsFor : streamName " + params.StreamName + " , status = " + status);
        if (status.toLowerCase() == 'active') {
            console.log("stream status has changed to " + status + ", calling user supplied function");
            callback.call(self, err, data);
        } else {
            console.log("kinesis.waitsFor : streamName " + params.StreamName + " , status = " + status + ", checking again after 30 sec.");
            setTimeout(function() {
                self.waitsFor(streamName, callback);
            }, 30000);
        }
    });
};

module.exports = Kinesis;
