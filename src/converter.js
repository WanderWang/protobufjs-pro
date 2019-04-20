
//@ts-check

var Enum = require("protobufjs/src/enum"),
    util = require("protobufjs/src/util");

exports.toObject = function toObject(mtype) {
    /* eslint-disable no-unexpected-multiline, block-scoped-var, no-redeclare */
    var fields = mtype.fieldsArray.slice().sort(util.compareFieldsById);
    if (!fields.length)
        return util.codegen()("return {}");
    var gen = util.codegen(["m", "o"], mtype.name + "$toObject")
        ("if(!o)")
        ("o={}")
        ("var d={}");

    var repeatedFields = [],
        mapFields = [],
        normalFields = [],
        i = 0;
    for (; i < fields.length; ++i)
        if (!fields[i].partOf)
            (fields[i].resolve().repeated ? repeatedFields
                : fields[i].map ? mapFields
                    : normalFields).push(fields[i]);

    if (repeatedFields.length) {
        gen
            ("if(o.arrays||o.defaults){");
        for (i = 0; i < repeatedFields.length; ++i) gen
            ("d%s=[]", util.safeProp(repeatedFields[i].name));
        gen
            ("}");
    }

    if (mapFields.length) {
        gen
            ("if(o.objects||o.defaults){");
        for (i = 0; i < mapFields.length; ++i) gen
            ("d%s={}", util.safeProp(mapFields[i].name));
        gen
            ("}");
    }

    if (normalFields.length) {
        gen
            ("if(o.defaults){");
        for (let field of normalFields) {
            let prop = util.safeProp(field.name);
            if (field.resolvedType instanceof Enum) gen
                ("d%s=o.enums===String?%j:%j", prop, field.resolvedType.valuesById[field.typeDefault], field.typeDefault);
            else if (field.long) gen
                ("if(util.Long){")
                ("var n=new util.Long(%i,%i,%j)", field.typeDefault.low, field.typeDefault.high, field.typeDefault.unsigned)
                ("d%s=o.longs===String?n.toString():o.longs===Number?n.toNumber():n", prop)
                ("}else")
                ("d%s=o.longs===String?%j:%i", prop, field.typeDefault.toString(), field.typeDefault.toNumber());
            else if (field.bytes) {
                var arrayDefault = "[" + Array.prototype.slice.call(field.typeDefault).join(",") + "]";
                gen
                    ("if(o.bytes===String)d%s=%j", prop, String.fromCharCode.apply(String, field.typeDefault))
                    ("else{")
                    ("d%s=%s", prop, arrayDefault)
                    ("if(o.bytes!==Array)d%s=util.newBuffer(d%s)", prop, prop)
                    ("}");
            } else {
                gen
                    ("d%s=%j", prop, field.typeDefault); // also messages (=null)
            }
        } gen
            ("}");
    }
    var hasKs2 = false;
    for (i = 0; i < fields.length; ++i) {
        var field = fields[i],
            index = mtype._fieldsArray.indexOf(field),
            prop = util.safeProp(field.name);
        if (field.map) {
            if (!hasKs2) {
                hasKs2 = true; gen
                    ("var ks2");
            } gen
                ("if(m%s&&(ks2=Object.keys(m%s)).length){", prop, prop)
                ("d%s={}", prop)
                ("for(var j=0;j<ks2.length;++j){");
            genValuePartial_toObject(gen, field, /* sorted */ index, prop + "[ks2[j]]")
                ("}");
        } else if (field.repeated) {
            gen
                ("if(m%s&&m%s.length){", prop, prop)
                ("d%s=[]", prop)
                ("for(var j=0;j<m%s.length;++j){", prop);
            genValuePartial_toObject(gen, field, /* sorted */ index, prop + "[j]")
                ("}");
        } else {
            gen
                ("if(m%s!=null&&m.hasOwnProperty(%j)){", prop, field.name); // !== undefined && !== null
            genValuePartial_toObject(gen, field, /* sorted */ index, prop);
            if (field.partOf) gen
                ("if(o.oneofs)")
                ("d%s=%j", util.safeProp(field.partOf.name), field.name);
        }
        gen
            ("}");
    }
    return gen
        ("return d");
    /* eslint-enable no-unexpected-multiline, block-scoped-var, no-redeclare */
};


function genValuePartial_toObject(gen, field, fieldIndex, prop) {
    /* eslint-disable no-unexpected-multiline, block-scoped-var, no-redeclare */
    if (field.resolvedType) {
        if (field.resolvedType instanceof Enum) gen
            ("d%s=o.enums===String?types[%i].values[m%s]:m%s", prop, fieldIndex, prop, prop);
        else gen
            ("d%s=types[%i].toObject(m%s,o)", prop, fieldIndex, prop);
    } else {
        var isUnsigned = false;
        switch (field.type) {
            case "double":
            case "float": gen
                ("d%s=o.json&&!isFinite(m%s)?String(m%s):m%s", prop, prop, prop, prop);
                break;
            case "uint64":
                isUnsigned = true;
            // eslint-disable-line no-fallthrough
            case "int64":
            case "sint64":
            case "fixed64":
            case "sfixed64": gen
                ("if(typeof m%s===\"number\")", prop)
                ("d%s=o.longs===String?String(m%s):m%s", prop, prop, prop)
                ("else") // Long-like
                ("d%s=o.longs===String?util.Long.prototype.toString.call(m%s):o.longs===Number?new util.LongBits(m%s.low>>>0,m%s.high>>>0).toNumber(%s):m%s", prop, prop, prop, prop, isUnsigned ? "true" : "", prop);
                break;
            case "bytes": gen
                ("d%s=o.bytes===String?util.base64.encode(m%s,0,m%s.length):o.bytes===Array?Array.prototype.slice.call(m%s):m%s", prop, prop, prop, prop, prop);
                break;
            default: gen
                ("d%s=m%s", prop, prop);
                break;
        }
    }
    return gen;
    /* eslint-enable no-unexpected-multiline, block-scoped-var, no-redeclare */
}