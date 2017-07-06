# Amazon Kinesis Scaling

This is npm module which scale amazon kinesis as per current traffic needs. This module continuously monitor traffic in kinesis stream and split and merge shards as needed.
Amazon provides Kinesis to process streaming data.
Each kinesis stream can have multiple shards and each shard can have traffic upto 1000 records per sec.
E.g. if your application needs to handle 5000 req/sec then you need to have 5 shards. Since traffic on your application can varies a lot so does number of shards. If your application needs to handle 20000 req/sec at peak time then you need to have 20 shards but when at other time you may required only 5 shards. Each shard cost money. It is important to have enough shards to serve current traffic but we should close additional shards if there is no need to save money.
Currently amazon doesn't provide any auto scaling of kinesis stream.
This npm module fill that missing link so that your application always have enough shard to process.

# Installation
```javascript
npm install @xaxis-open-source/amazon-kinesis-scaling --save
```

# How to use
After installing this module you can use this module in following way. 
Example code with only required parameters.
```javascript
var kinesisScaling = require("@xaxis-open-source/amazon/kinesis-scaling");
var streamScaler = new kinesisScaling({
        accessKeyId: "<<aws-access-id>>",
        secretAccessKey: "<<aws-secret-access-key>>",
        region: "<<aws-region-name",
        streamName: "<<kinesis stream name>>"
        });
streamScaler.start(fnError, fnSuccess);

function error(data){
    console.log("error = ", data);
}

function success(data){
    console.log("success = ", data);
}
```

It accept following parameters.
All interval are specified in minutes.

| Name         | Description           | default value | required/optional  |
| ------------- | ------------- | ----- | ---------------- |
| accessKeyId      | access key of aws | none | required |
| secretAccessKey     | secret key of aws | none  |   required |
| region | region of aws kinesis stream | none |   required |
| streamName | name of kinesis stream | none | required |
| maxShard | max number of shards, do not create shard if current number of shards reaches this value | 500 | optional |
| shardLimit | limit after which shard need to be split | 800 | optional |
|autoScaleInterval | it check stream traffic every minute specified by this propery | 1 | optional |
|scalingSplitDuration| shard will only be split if its traffic exceed shardLimit atleast number of minutes defined by this property. e.g. if this value is 3 then shard will only be split when traffic on shard exceed shardLimit in 3 times in last 3 minutes.  | 1 | optional |
|scalingMergeDuration| 2 shards will only be merged when sum of traffic of 2 shards is less than shardLimit atleast number of minutes defined by this property. | 5 | optional |
|splitNextInterval| whenever it split shard then it wait for splitNextInterval before checking for next round. | 1 | optional |
|mergeNextInterval| wait time for checking traffic after merging of traffic | 1 | optional |
|snsTopic| sns topic for notification of split and merge of shards | none | optional |
|fnBeforeSplit| callback before splitting shard| none | optional |
fnAfterSplit| callback after successfull split. It is provided with kinesis data | none | optional 
|fnBeforeMerge | callback before merging of shard | none | optional |
|fnAfterMerge | callback after successful merge of shard | none | optional |


Example code with all parameters
```javascript
var kinesisScaling = require("@xaxis-open-source/amazon/kinesis-scaling");
var streamScaler = new kinesisScaling({
        accessKeyId: "<<aws-access-id>>",
        secretAccessKey: "<<aws-secret-access-key>>",
        region: "<<aws-region-name",
        streamName: "<<kinesis stream name>>",
        shardLimit: 800,
        snsTopic: "<<your sns topic>>",
        autoScaleInterval: 1,
        scalingSplitDuration: 2,
        scalingMergeDuration: 5,
        splitNextInterval: 1,
        mergeNextInterval: 1,
        maxShard: 50,
        fnBeforeSplit: beforeSplit,
        fnAfterSplit: afterSplit,
        fnBeforeMerge: beforeMerge,
        fnAfterMerge: afterMerge
        });
streamScaler.start(fnError, fnSuccess);

function error(data){
    console.log("error = ", data);
}

function success(data){
    console.log("success = ", data);
}

function beforeSplit(data){
    //perform any action before splitting shards
    console.log("before splitting shards", data);
}
function afterSplit(data){
    //perform any action after splitting shards
    console.log("after splitting shards", data);
}
function beforeMerge(data){
    //perform any action before merging shards
    console.log("before merging shards", data);
}
function afterMerge(data){
    //perform any action after merging shards
    console.log("after merging shards", data);
}
```


# How It Works
This module takes proactive approach while creating more shards but it is conservative while destroying shards. This module can split shards as soon as it sees spike in traffic but wait for some time before merging shards.
This module get current metrics for given kinesis stream using cloudwatch api.
It then filter out any closed shards and sort remainingshards based on StartingHashKey of shard. It then iterate all open shards and check of any shard has traffic which is more than configured shardLimit. If any shard has more traffic then it split that shard. If there is no shard which needs splitting then it start checking if there are no 2 shards which needs merging. If sum of traffic of 2 adjacent shards are less shardLimit then it merge those shards. If there is no need to split or merge then this module doesn't do anything and wait for 1 min to again check.

# Test
We are using mocha, chai and sinon to write unit test case.
Currently onle one validation test case is provided. Lot of unit tests are pending.

```javascript
npm test
```
