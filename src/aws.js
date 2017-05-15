function aws(config) {
    var awsService = require("aws-sdk");
    awsService.config.update(config);
    
    return awsService;
}

module.exports = aws;
