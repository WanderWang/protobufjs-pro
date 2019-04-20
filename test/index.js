//@ts-check
var assert = require('assert');
var { describe, it } = require('mocha');
var protobuf = require("protobufjs");
var mylib = require('../src/index');
describe('title', () => {
    it('testcase', async () => {
        const root = await protobuf.load("test/test.proto");
        var AwesomeMessage = root.lookupType("awesomepackage.AwesomeMessage");
        var payload = { awesomeField: "AwesomeString" };
        var message1 = AwesomeMessage.create(payload);
        var buffer = AwesomeMessage.encode(message1).finish();
        const jsContent = await mylib.generateProto();
        eval(jsContent);
        // console.log(jsContent)
        // @ts-ignore
        const NewMessageClass = global.awesomepackage.AwesomeMessage;
        const message3 = NewMessageClass.decode(buffer);
        assert.deepEqual(payload, message3.toJSON())
    })
})