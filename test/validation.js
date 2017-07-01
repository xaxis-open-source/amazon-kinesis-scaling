"use strict";
var chai = require("chai");
var sinon = require("sinon");
var sinonChai = require("sinon-chai");
var expect = chai.expect;
chai.use(sinonChai);

describe("validate input parameters", function() {

    var srcPath = "../src/";

    var scaling = require(srcPath + "scaling");
    var that = this;

    beforeEach(function() {
    });

    it("should return error and invoke fnError when accessKeyId is not present", function() {
        
        var errorSpy = sinon.spy();
        var successSpy = sinon.spy();
        var s1 = new scaling({
            secretAccessKey: "secretAccessKey",
            region: "us-west-2",
            streamName: "test222"
        });
        s1.start(errorSpy, successSpy);

        expect(errorSpy.calledOnce).to.equal(true);
    });

    it("should return error and invoke fnError when secretAccessKey is not present", function() {
        var errorSpy = sinon.spy();
        var successSpy = sinon.spy();
        var s1 = new scaling({
            accessKeyId: "accessKeyId",
            region: "us-west-2",
            streamName: "test"
        });
        s1.start(errorSpy, successSpy);

        expect(errorSpy.calledOnce).to.equal(true);
    });

    afterEach(function(){
    });


});
