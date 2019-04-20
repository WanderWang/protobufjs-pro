//@ts-check
var assert = require('assert');
var { describe, it } = require('mocha');
var protobuf = require("protobufjs");
var mylib = require('../');
var fs = require('fs');
describe('title', () => {
    it('testcase', async () => {
        const source = fs.readFileSync('test/test.proto', 'utf-8');
        const root = protobuf.parse(source, { keepCase: true }).root;
        var AwesomeMessage = root.lookupType("awesomepackage.AwesomeMessage");
        // var payload = { awesomeField: "AwesomeString" };
        var message1 = AwesomeMessage.create({});
        var buffer = AwesomeMessage.encode(message1).finish();
        let jsContent = await mylib.generateProto('test', ['test.proto']);
        jsContent = `
        var $protobuf = require('protobufjs');
        $protobuf.roots.default=global;
        ` + jsContent;
        eval(jsContent);
        fs.writeFileSync('output.js', jsContent, 'utf-8');
        // console.log(jsContent)
        // @ts-ignore
        const NewMessageClass = global.awesomepackage.AwesomeMessage;
        const message3 = NewMessageClass.decode(buffer);
        const oldJson = AwesomeMessage.toObject(message1, { defaults: true })
        const newJson = NewMessageClass.toObject(message3, { defaults: true });
        assert.deepEqual(oldJson, newJson)
    })
})