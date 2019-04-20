//@ts-check

"use strict";
module.exports = static_target;


var protobuf = require('protobufjs'),
    UglifyJS = require("uglify-js"),
    espree = require("espree"),
    escodegen = require("escodegen"),
    estraverse = require("estraverse");

var Type = protobuf.Type,
    Service = protobuf.Service,
    Enum = protobuf.Enum,
    Namespace = protobuf.Namespace,
    util = protobuf.util;

var converter = require('./converter')


var out = [];
var indent = 0;
var config = {};

static_target.description = "Static code without reflection (non-functional on its own)";

function static_target(root, options, callback) {
    config = options;
    try {
        var aliases = [];
        if (config.decode)
            aliases.push("Reader");
        if (config.encode)
            aliases.push("Writer");
        aliases.push("util");
        if (aliases.length) {
            if (config.comments)
                push("// Common aliases");
            push((config.es6 ? "const " : "var ") + aliases.map(function (name) { return "$" + name + " = $protobuf." + name; }).join(", ") + ";");
            push("");
        }
        var rootProp = util.safeProp(config.root || "default");
        push((config.es6 ? "const" : "var") + " $root = $protobuf.roots" + rootProp + " || ($protobuf.roots" + rootProp + " = {});");
        buildNamespace(null, root);
        return callback(null, out.join("\n"));
    } catch (err) {
        return callback(err);
    } finally {
        out = [];
        indent = 0;
        config = {};
    }
}

function push(line) {
    if (line === "")
        return out.push("");
    var ind = "";
    for (var i = 0; i < indent; ++i)
        ind += "    ";
    return out.push(ind + line);
}


function exportName(object, asInterface) {
    if (asInterface) {
        if (object.__interfaceName)
            return object.__interfaceName;
    } else if (object.__exportName)
        return object.__exportName;
    var parts = object.fullName.substring(1).split("."),
        i = 0;
    while (i < parts.length)
        parts[i] = escapeName(parts[i++]);
    if (asInterface)
        parts[i - 1] = "I" + parts[i - 1];
    return object[asInterface ? "__interfaceName" : "__exportName"] = parts.join(".");
}

function escapeName(name) {
    if (!name)
        return "$root";
    return util.isReserved(name) ? name + "_" : name;
}

function aOrAn(name) {
    return ((/^[hH](?:ou|on|ei)/.test(name) || /^[aeiouAEIOU][a-z]/.test(name)) && !/^us/i.test(name)
        ? "an "
        : "a ") + name;
}

function buildNamespace(ref, ns) {
    if (!ns)
        return;
    if (ns.name !== "") {
        push("");
        if (!ref && config.es6)
            push("export const " + escapeName(ns.name) + " = " + escapeName(ref) + "." + escapeName(ns.name) + " = (() => {");
        else
            push(escapeName(ref) + "." + escapeName(ns.name) + " = (function() {");
        ++indent;
    }

    if (ns instanceof Type) {
        buildType(undefined, ns);
    } else if (ns instanceof Service)
        buildService(undefined, ns);
    else if (ns.name !== "") {
        push("");
        push((config.es6 ? "const" : "var") + " " + escapeName(ns.name) + " = {};");
    }

    ns.nestedArray.forEach(function (nested) {
        if (nested instanceof Enum)
            buildEnum(ns.name, nested);
        else if (nested instanceof Namespace)
            buildNamespace(ns.name, nested);
    });
    if (ns.name !== "") {
        push("");
        push("return " + escapeName(ns.name) + ";");
        --indent;
        push("})();");
    }
}

var reduceableBlockStatements = {
    IfStatement: true,
    ForStatement: true,
    WhileStatement: true
};

var shortVars = {
    "r": "reader",
    "w": "writer",
    "m": "message",
    "t": "tag",
    "l": "length",
    "c": "end", "c2": "end2",
    "k": "key",
    "ks": "keys", "ks2": "keys2",
    "e": "error",
    "f": "impl",
    "o": "options",
    "d": "object",
    "n": "long",
    "p": "properties"
};

function beautifyCode(code) {
    // Add semicolons
    code = UglifyJS.minify(code, {
        compress: false,
        mangle: false,
        output: { beautify: true }
    }).code;
    // Properly beautify
    var ast = espree.parse(code, undefined);
    estraverse.replace(ast, {
        enter: function (node, parent) {
            // rename short vars
            // @ts-ignore
            if (node.type === "Identifier" && (parent.property !== node || parent.computed) && shortVars[node.name])
                return {
                    "type": "Identifier",
                    "name": shortVars[node.name]
                };
            // replace var with let if es6
            if (config.es6 && node.type === "VariableDeclaration" && node.kind === "var") {
                node.kind = "let";
                return undefined;
            }
            // remove braces around block statements with a single child
            if (node.type === "BlockStatement" && reduceableBlockStatements[parent.type] && node.body.length === 1)
                return node.body[0];
            return undefined;
        }
    });
    code = escodegen.generate(ast, {
        format: {
            newline: "\n",
            quotes: "double"
        }
    });
    // Add id, wireType comments
    if (config.comments)
        code = code.replace(/\.uint32\((\d+)\)/g, function ($0, $1) {
            var id = $1 >>> 3,
                wireType = $1 & 7;
            return ".uint32(/* id " + id + ", wireType " + wireType + " =*/" + $1 + ")";
        });
    return code;
}

var renameVars = {
    "Writer": "$Writer",
    "Reader": "$Reader",
    "util": "$util"
};

function buildFunction(type, functionName, gen, scope) {
    var code = gen.toString(functionName)
        .replace(/((?!\.)types\[\d+])(\.values)/g, "$1"); // enums: use types[N] instead of reflected types[N].values

    var ast = espree.parse(code, undefined);
    /* eslint-disable no-extra-parens */
    estraverse.replace(ast, {
        enter: function (node, parent) {
            // rename vars
            if (
                node.type === "Identifier" && renameVars[node.name]
                && (
                    (parent.type === "MemberExpression" && parent.object === node)
                    || (parent.type === "BinaryExpression" && parent.right === node)
                )
            )
                return {
                    "type": "Identifier",
                    "name": renameVars[node.name]
                };
            // replace this.ctor with the actual ctor
            if (
                node.type === "MemberExpression"
                && node.object.type === "ThisExpression"
                && node.property.type === "Identifier" && node.property.name === "ctor"
            )
                return {
                    "type": "Identifier",
                    "name": "$root" + type.fullName
                };
            // replace types[N] with the field's actual type
            if (
                node.type === "MemberExpression"
                && node.object.type === "Identifier" && node.object.name === "types"
                && node.property.type === "Literal"
            )
                return {
                    "type": "Identifier",
                    // @ts-ignore
                    "name": "$root" + type.fieldsArray[node.property.value].resolvedType.fullName
                };
            return undefined;
        }
    });
    /* eslint-enable no-extra-parens */
    code = escodegen.generate(ast, {
        format: {
            newline: "\n",
            quotes: "double"
        }
    });

    if (config.beautify)
        code = beautifyCode(code);

    code = code.replace(/ {4}/g, "\t");

    var hasScope = scope && Object.keys(scope).length,
        isCtor = functionName === type.name;

    if (hasScope) // remove unused scope vars
        Object.keys(scope).forEach(function (key) {
            if (!new RegExp("\\b(" + key + ")\\b", "g").test(code))
                delete scope[key];
        });

    var lines = code.split(/\n/g);
    if (isCtor) // constructor
        push(lines[0]);
    else if (hasScope) // enclose in an iife
        push(escapeName(type.name) + "." + escapeName(functionName) + " = (function(" + Object.keys(scope).map(escapeName).join(", ") + ") { return " + lines[0]);
    else
        push(escapeName(type.name) + "." + escapeName(functionName) + " = " + lines[0]);
    lines.slice(1, lines.length - 1).forEach(function (line) {
        var prev = indent;
        var i = 0;
        while (line.charAt(i++) === "\t")
            ++indent;
        push(line.trim());
        indent = prev;
    });
    if (isCtor)
        push("}");
    else if (hasScope)
        push("};})(" + Object.keys(scope).map(function (key) { return scope[key]; }).join(", ") + ");");
    else
        push("};");
}

function toJsType(field) {
    var type;

    switch (field.type) {
        case "double":
        case "float":
        case "int32":
        case "uint32":
        case "sint32":
        case "fixed32":
        case "sfixed32":
            type = "number";
            break;
        case "int64":
        case "uint64":
        case "sint64":
        case "fixed64":
        case "sfixed64":
            type = config.forceLong ? "Long" : config.forceNumber ? "number" : "number|Long";
            break;
        case "bool":
            type = "boolean";
            break;
        case "string":
            type = "string";
            break;
        case "bytes":
            type = "Uint8Array";
            break;
        default:
            if (field.resolve().resolvedType)
                type = exportName(field.resolvedType, !(field.resolvedType instanceof protobuf.Enum || config.forceMessage));
            else
                type = "*"; // should not happen
            break;
    }
    if (field.map)
        return "Object.<string," + type + ">";
    if (field.repeated)
        return "Array.<" + type + ">";
    return type;
}

function buildType(ref, type) {

    // constructor
    push("");
    buildFunction(type, type.name, Type.generateConstructor(type));

    // default values
    var firstField = true;
    type.fieldsArray.forEach(function (field) {
        field.resolve();
        var prop = util.safeProp(field.name);
        if (config.comments) {

        } else if (firstField) {
            push("");
            firstField = false;
        }
        if (field.repeated)
            push(escapeName(type.name) + ".prototype" + prop + " = $util.emptyArray;"); // overwritten in constructor
        else if (field.map)
            push(escapeName(type.name) + ".prototype" + prop + " = $util.emptyObject;"); // overwritten in constructor
        else if (field.long)
            push(escapeName(type.name) + ".prototype" + prop + " = $util.Long ? $util.Long.fromBits("
                + JSON.stringify(field.typeDefault.low) + ","
                + JSON.stringify(field.typeDefault.high) + ","
                + JSON.stringify(field.typeDefault.unsigned)
                + ") : " + field.typeDefault.toNumber(field.type.charAt(0) === "u") + ";");
        else if (field.bytes) {
            push(escapeName(type.name) + ".prototype" + prop + " = $util.newBuffer(" + JSON.stringify(Array.prototype.slice.call(field.typeDefault)) + ");");
        } else {
            push(escapeName(type.name) + ".prototype" + prop + " = " + JSON.stringify(field.typeDefault) + ";");
        }

    });

    // virtual oneof fields
    var firstOneOf = true;
    type.oneofsArray.forEach(function (oneof) {
        if (firstOneOf) {
            firstOneOf = false;
            push("");
            if (config.comments)
                push("// OneOf field names bound to virtual getters and setters");
            push((config.es6 ? "let" : "var") + " $oneOfFields;");
        }
        oneof.resolve();
        push("");

        push("Object.defineProperty(" + escapeName(type.name) + ".prototype, " + JSON.stringify(oneof.name) + ", {");
        ++indent;
        push("get: $util.oneOfGetter($oneOfFields = [" + oneof.oneof.map(JSON.stringify).join(", ") + "]),");
        push("set: $util.oneOfSetter($oneOfFields)");
        --indent;
        push("});");
    });

    if (config.create) {
        push("");

        push(escapeName(type.name) + ".create = function create(properties) {");
        ++indent;
        push("return new " + escapeName(type.name) + "(properties);");
        --indent;
        push("};");
    }

    if (config.encode) {
        push("");

        buildFunction(type, "encode", protobuf.encoder(type));

        if (config.delimited) {
            push("");

            push(escapeName(type.name) + ".encodeDelimited = function encodeDelimited(message, writer) {");
            ++indent;
            push("return this.encode(message, writer).ldelim();");
            --indent;
            push("};");
        }
    }

    if (config.decode) {
        push("");

        buildFunction(type, "decode", protobuf.decoder(type));

        if (config.delimited) {
            push("");

            push(escapeName(type.name) + ".decodeDelimited = function decodeDelimited(reader) {");
            ++indent;
            push("if (!(reader instanceof $Reader))");
            ++indent;
            push("reader = new $Reader(reader);");
            --indent;
            push("return this.decode(reader, reader.uint32());");
            --indent;
            push("};");
        }
    }

    if (config.verify) {
        push("");
        buildFunction(type, "verify", protobuf.verifier(type));
    }

    if (config.convert) {
        // push("");
        // buildFunction(type, "fromObject", converter.fromObject(type));

        push("");
        buildFunction(type, "toObject", converter.toObject(type));

        push("");
        push(escapeName(type.name) + ".prototype.toJSON = function toJSON() {");
        ++indent;
        push("return this.constructor.toObject(this, $protobuf.util.toJSONOptions);");
        --indent;
        push("};");
    }
}

function buildService(ref, service) {

    push("");
    push("function " + escapeName(service.name) + "(rpcImpl, requestDelimited, responseDelimited) {");
    ++indent;
    push("$protobuf.rpc.Service.call(this, rpcImpl, requestDelimited, responseDelimited);");
    --indent;
    push("}");
    push("");
    push("(" + escapeName(service.name) + ".prototype = Object.create($protobuf.rpc.Service.prototype)).constructor = " + escapeName(service.name) + ";");

    if (config.create) {
        push("");
        push(escapeName(service.name) + ".create = function create(rpcImpl, requestDelimited, responseDelimited) {");
        ++indent;
        push("return new this(rpcImpl, requestDelimited, responseDelimited);");
        --indent;
        push("};");
    }

    service.methodsArray.forEach(function (method) {
        method.resolve();
        var lcName = protobuf.util.lcFirst(method.name),
            cbName = escapeName(method.name + "Callback");
        push("");
        push("Object.defineProperty(" + escapeName(service.name) + ".prototype" + util.safeProp(lcName) + " = function " + escapeName(lcName) + "(request, callback) {");
        ++indent;
        push("return this.rpcCall(" + escapeName(lcName) + ", $root." + exportName(method.resolvedRequestType) + ", $root." + exportName(method.resolvedResponseType) + ", request, callback);");
        --indent;
        push("}, \"name\", { value: " + JSON.stringify(method.name) + " });");
    });
}

function buildEnum(ref, enm) {

    push("");
    push(escapeName(ref) + "." + escapeName(enm.name) + " = (function() {");
    ++indent;
    push((config.es6 ? "const" : "var") + " valuesById = {}, values = Object.create(valuesById);");
    var aliased = [];
    Object.keys(enm.values).forEach(function (key) {
        var valueId = enm.values[key];
        var val = config.forceEnumString ? JSON.stringify(key) : valueId;
        if (aliased.indexOf(valueId) > -1)
            push("values[" + JSON.stringify(key) + "] = " + val + ";");
        else {
            push("values[valuesById[" + valueId + "] = " + JSON.stringify(key) + "] = " + val + ";");
            aliased.push(valueId);
        }
    });
    push("return values;");
    --indent;
    push("})();");
}
