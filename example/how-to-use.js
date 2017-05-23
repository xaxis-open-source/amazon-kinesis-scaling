

/**
 * This file describes how you can use amazon kinesis scaling module.
 * You need to substitute your amazon keys and stream name.
 */
var srcPath = "../src/";

var accessKeyId = process.env.AWS_ACCESSKEY;
var secretKey = process.env.AWS_SECRETKEY;
var streamName = "test";
var scaling = require(srcPath + "scaling");


var s1 = new scaling(({
    accessKeyId: accessKeyId,
    secretAccessKey: secretKey,
    region: "us-west-2",
    streamName: streamName,
    snsTopic: "arn:aws:sns:us-west-2:087328716413:stream-scaling",
    shardLimit: 50,
    autoScaleInterval: 1,
    fnBeforeSplit: function(data){
        console.log("fnBeforeSplit data = ", data);
    },
    fnAfterSplit: function(data){
        console.log("fnAfterSplit data = ", data);
    },
    fnBeforeMerge: function(data){
        console.log("fnBeforeMerge data = ", data);
    },
    fnAfterMerge: function(data){
        console.log("fnAfterMerge data = ", data);
    }
}));

s1.start(error, success);

function error(data){
    console.log("error = ", data);
}

function success(data){
    console.log("success = ", data);
}