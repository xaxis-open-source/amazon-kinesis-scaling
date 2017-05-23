var loadTest = require("./load-generator");

var srcPath = "../src/";

var accessKeyId = process.env.AWS_ACCESSKEY;
var secretKey = process.env.AWS_SECRETKEY;

var streamName = "test";
var config = {
    accessKeyId: accessKeyId,
    secretAccessKey: secretKey,
    region: "us-west-2"
};
var aws = new require(srcPath + "aws")(config);
var kinesis = new(require(srcPath + "kinesis"))(aws);

var total = 0;
var loadTestExample = new loadTest({
    series: [
        {
            qps: 200,
            time: 600
        },
        {
            qps: 100,
            time: 180
        },
        {
            qps: 20,
            time: 200
        }

    ],
    callback: function(){
        total = total + 1;
        if(total % 1000 === 0){
            console.log("send ", new Date().toLocaleString(), total);
        }
        kinesis.putRecord(streamName, "test");
    }
});
loadTestExample.start();