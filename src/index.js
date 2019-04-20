//@ts-check



require('protobufjs/cli/util').requireAll = function (dirname) {
    console.log('what')
    const json = function (root, options, callback) {
        callback(null, JSON.stringify(root.toJSON({ keepComments: true }), null, 2));
    }
    return {
        json,
        static: require("./static")
    }
};

const { pbjs, pbts } = require('protobufjs/cli');


exports.generateProto = async function () {
    const args = [
        '--target', 'static',
        // '--keep-case',
        '--path', 'test'
    ].concat(['test.proto'])
    args.unshift('--no-create');
    args.unshift('--no-verify');
    // args.unshift('--no-convert')
    args.unshift("--no-delimited")
    args.unshift("--no-comments")
    args.unshift("--no-beautify")
    let jsContent = await executePbjs(args);
    jsContent = `
    var $protobuf = require('protobufjs');
    $protobuf.roots.default=global;
    ` + jsContent;
    return jsContent;
}



/**
 * 
 * @param {string[]} args
 * @returns {Promise<string>} 
 */
function executePbjs(args) {
    return new Promise((resolve, reject) => {
        pbjs.main(args, (result, output) => {
            resolve(output)
        })
    })
}