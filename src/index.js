//@ts-check
var fs = require('fs');


require('protobufjs/cli/util').requireAll = function (dirname) {
    const json = function (root, options, callback) {
        callback(null, JSON.stringify(root.toJSON({ keepComments: true }), null, 2));
    }
    return {
        json,
        static: require("./static")
    }
};

const { pbjs, pbts } = require('protobufjs/cli');


/**
 * @param {{mode?:"global"|"module",path:string,files:string[]}} options
 */
exports.generateProto = async function (options) {
    if (!options.mode) {
        options.mode = 'global';
    }
    const path = options.path;
    const files = options.files;
    const jsPath = 'temp.js';
    const args = [
        '--target', 'static',
        '--keep-case',
        '--path', path
    ].concat(files)
    args.unshift('--no-create');
    args.unshift('--no-verify');
    // args.unshift('--no-convert')
    args.unshift("--no-delimited")
    // args.unshift("--no-comments")
    args.unshift("--no-beautify")
    let jsContent = await executePbjs(args);
    if (options.mode === 'global') {
        jsContent = 'var $protobuf = window.protobuf;\n$protobuf.roots.default=window;\n' + jsContent;
    }
    else {
        jsContent = `
        var $protobuf = require('protobufjs');
        $protobuf.roots.default=global;
        ` + jsContent;
    }
    fs.writeFileSync(jsPath, jsContent, 'utf-8');

    let dtsContent = await execubePbts(["--main", jsPath]);
    dtsContent = dtsContent.replace(/\$protobuf/gi, "protobuf").replace(/export namespace/gi, 'declare namespace');
    dtsContent = 'type Long = protobuf.Long;\n' + dtsContent;
    fs.unlinkSync(jsPath);


    const args1 = ['--target', 'json', '--keep-case', '--path', path].concat(files)

    const jsonContent = await executePbjs(args1);
    const json = JSON.parse(jsonContent);
    return {
        jsContent, dtsContent, json
    };
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

/**
 * 
 * @param {string[]} args
 * @returns {Promise<string>} 
 */
function execubePbts(args) {
    return new Promise((resolve, reject) => {
        pbts.main(args, (result, output) => {
            resolve(output);
        })
    })
}