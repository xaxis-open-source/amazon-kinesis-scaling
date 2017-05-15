function Sns(aws) {
    this.sns = new aws.SNS();
}

Sns.prototype.publish = function(params, callback) {
    if (!callback) {
        callback = snsDefaultCallback;
    }
    this.sns.publish(params, callback);

    /**
     * This is default callback for any sns operation.
     * It only print error and data in console.
     */
    function snsDefaultCallback(err, data){
        console.log("kinesis auto scaling sns notification : error = " + JSON.stringify(err));
        console.log("kinesis auto scaling sns notification : data = " + JSON.stringify(data));
    }
};

module.exports = Sns;
