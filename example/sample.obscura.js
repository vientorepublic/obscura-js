function _0xaa90310а87eсdаа3(v, checksum, kind) {
    Object.defineProperty(v, _0xе021f70db82fа08b, {
        value: [
            checksum,
            kind
        ],
        enumerable: false,
        configurable: false,
        writable: false
    });
    return v;
}
function _0xf81bd3b174267d81(v) {
    var _tag = v[_0xе021f70db82fа08b];
    if (_tag === undefined || _tag === null) {
        if (Array.isArray(v)) {
            for(var _ci = 0; _ci < v.length; _ci++)v[_ci] = 0;
        } else {
            var _ck = Object.keys(v);
            for(var _cj = 0; _cj < _ck.length; _cj++)delete v[_ck[_cj]];
        }
        return v;
    }
    var _cs = _tag[0];
    var _kind = _tag[1];
    var _expected;
    if (_kind === 1) {
        var _acc = 15919;
        for(var _vi = 0; _vi < v.length; _vi++){
            var _el = v[_vi];
            var _val = typeof _el === 'number' ? (_el & 0xffff) >>> 0 : typeof _el === 'boolean' ? (_el ? 1 : 0) : typeof _el === 'string' ? _el.charCodeAt(0) & 0xffff : 0;
            _acc = (((_acc ^ _val) * 32795) ^ (_acc >>> 3)) >>> 0;
        }
        _expected = (((_acc ^ 15919) * 32795) ^ (15919 >>> 3)) >>> 0;
    } else if (_kind === 2) {
        var _len = Object.keys(v).length;
        _expected = (((_len ^ 15919) * 32795) ^ (15919 >>> 3)) >>> 0;
    } else {
        _expected = (((v.length ^ 15919) * 32795) ^ (15919 >>> 3)) >>> 0;
    }
    if (_cs !== _expected) {
        if (Array.isArray(v)) {
            for(var _di = 0; _di < v.length; _di++)v[_di] = 0;
        } else {
            var _dk = Object.keys(v);
            for(var _dj = 0; _dj < _dk.length; _dj++)delete v[_dk[_dj]];
        }
    }
    return v;
}
const _0xе021f70db82fа08b = Symbol("6fq9w5");
const _0x52df7d392е9f8а5a = Math.floor.bind(Math);
const _0x0ab9117e0eсaedd7 = Math.random.bind(Math);
const _0x5b5а7b37ff200b0f = Math.ceil.bind(Math);
const _0x2ea9d6dfbe4dae92 = Math.round.bind(Math);
const _0x6d5822e6сс930c51 = Object.defineProperty.bind(Object);
const _0x0d306с09243e03f2 = Object.keys.bind(Object);
const _0x5259dаbсеd048f20 = Array.prototype.slice.bind(Array.prototype);
const _0xе9df5с4a9074f500 = Array.prototype.forEach.bind(Array.prototype);
{
    var _mask_e5d = 31112 ^ 31112 | 0;
    if (_mask_e5d >>> 1 >= 1073741824) {
        _mask_e5d += 31161;
    }
}function _0x59b4а391ce0е354f(start, len, seed) {
    {
        var _hash_1b5 = 156 >> 6;
        switch(_hash_1b5){
            case 258:
                var _0x258aacc3 = _hash_1b5 ^ 44597;
                break;
            case 514:
                _hash_1b5 = 0;
                break;
        }
    }
    let _0x88f2476f7de396с2 = 2;
    var key, out;
    while(true){
        switch(_0x88f2476f7de396с2){
            case 2:
                key = seed, out = "";
                _0x88f2476f7de396с2 = 0;
                break;
            case 0:
                for(let i = 0; i < len; i++){
                    const b = _0xd6e1b06803d3c8ec[start + i] ^ key & 65535;
                    out += String.fromCharCode(b);
                    key = key + _0xd6e1b06803d3c8ec[start + i] & 65535;
                }
                _0x88f2476f7de396с2 = 1;
                break;
            case 1:
                return out;
                _0x88f2476f7de396с2 = -1;
                break;
            default:
                return;
        }
    }
}
{
    var _flag_feb = 7043 & 59665 ^ 6163;
    if (_flag_feb === 9289) {
        var _buf_d2b = _flag_feb >>> 16 | _flag_feb & 65535;
        _flag_feb = _buf_d2b ^ 51819;
    }
}const _0xd6e1b06803d3c8ec = _0xf81bd3b174267d81(_0xaa90310а87eсdаа3([
    33864,
    2093,
    4121,
    8418,
    16671,
    33443,
    1298,
    8726,
    17517,
    35053,
    4546,
    8965,
    17933,
    35860,
    6370,
    12564,
    25253,
    50526,
    35559,
    5455,
    10961,
    21997,
    43791,
    22248,
    44294,
    23051,
    46309,
    26951,
    49167,
    32793,
    251,
    504,
    999,
    24292,
    48621,
    31515,
    63224,
    60903,
    56144,
    46753,
    27906,
    55808,
    46086,
    26650,
    53488,
    41299,
    17057,
    34069,
    2589,
    5367,
    10724,
    21265,
    42721,
    19784,
    64691,
    63981,
    62223,
    59112,
    52486,
    39435,
    13541,
    26948,
    53961,
    42259,
    19172,
    38146,
    10818,
    21635,
    43268,
    21002,
    42100,
    39714,
    13851,
    27744,
    55454,
    45438,
    14617,
    29184,
    58380,
    51229,
    37097,
    8527,
    55255,
    44861,
    24295,
    48399,
    31458,
    62722,
    59905,
    54346,
    30201,
    60381,
    55271,
    44822,
    24302
], 3143343046, 1));
{
    var _hash_aff = 62470 ^ 2654435769;
    _hash_aff = _hash_aff ^ _hash_aff >>> 16;
    var _idx_c95 = _hash_aff >>> 0;
    if (_idx_c95 < 0) {
        _hash_aff = _idx_c95 ^ 25523;
    }
}const _0x71с2e15с6b3f2277 = _0xf81bd3b174267d81(_0xaa90310а87eсdаа3([
    function(a, b) {
        return (a ^ b) + 2 * (a & b);
    },
    function(a, b) {
        return a * b;
    },
    function(name) {
        {
            var _tmp_675 = 0, _0x9d08c5be = 0;
            for(; _0x9d08c5be < 0; _0x9d08c5be++){
                _tmp_675 = _tmp_675 ^ _0x9d08c5be * 2246822507 >>> 0;
            }
            if (_tmp_675 !== 0) {
                _tmp_675 ^= 51819;
            }
        }
        let _0x17сa8cdb842b28df = 1;
        var msg;
        while(true){
            switch(_0x17сa8cdb842b28df){
                case 1:
                    msg = _0x59b4а391ce0е354f(0, 7, 33792) + name + _0x59b4а391ce0е354f(7, 21, 8759);
                    _0x17сa8cdb842b28df = 2;
                    break;
                case 2:
                    name === _0x59b4а391ce0е354f(28, 5, 49262) ? console.log(_0x59b4а391ce0е354f(33, 21, 24229)) : console.log(msg);
                    _0x17сa8cdb842b28df = 0;
                    break;
                case 0:
                    return msg;
                    _0x17сa8cdb842b28df = -1;
                    break;
                default:
                    return;
            }
        }
    },
    function(x, y) {
        let _0xссdc2329324da71b = 3;
        var base, bonus, result;
        {
            var _val_664 = 101 >> 4;
            switch(_val_664){
                case 262:
                    var _0x53789f9a = _val_664 ^ 19369;
                    break;
                case 518:
                    _val_664 = 0;
                    break;
            }
        }
        while(true){
            switch(_0xссdc2329324da71b){
                case 3:
                    base = _0x71с2e15с6b3f2277[0](x, y);
                    _0xссdc2329324da71b = 2;
                    break;
                case 2:
                    bonus = _0x71с2e15с6b3f2277[1](base, 2);
                    _0xссdc2329324da71b = 1;
                    break;
                case 1:
                    result = (bonus ^ x) - 2 * (~bonus & x);
                    _0xссdc2329324da71b = 0;
                    break;
                case 0:
                    return result;
                    _0xссdc2329324da71b = -1;
                    break;
                default:
                    return;
            }
        }
    }
], 521931084, 0));
try {
    var _tmp_a91 = 2147483647, _shift_f80 = 2147483647 >>> 2;
    while(_tmp_a91 < _shift_f80){
        _tmp_a91 = _tmp_a91 >>> 1 ^ 44597;
    }
} catch (_e) {}
const SECRET_KEY = _0x59b4а391ce0е354f(54, 17, 64732);
try {
    var _idx_93b = 2147483647, _state_f10 = 2147483647 >>> 2;
    while(_idx_93b < _state_f10){
        _idx_93b = _idx_93b >>> 1 ^ 44597;
    }
} catch (_e) {}
const VERSION = _0x59b4а391ce0е354f(71, 5, 39699);
{
    var _shift_5af = 0, _0x979f5dfd = 0;
    for(; _0x979f5dfd < 0; _0x979f5dfd++){
        _shift_5af = _shift_5af ^ _0x979f5dfd * 2246822507 >>> 0;
    }
    if (_shift_5af !== 0) {
        _shift_5af ^= 51819;
    }
}const score = _0x71с2e15с6b3f2277[3](7, 3);
{
    var _mask_995 = 18991 ^ 2654435769;
    _mask_995 = _mask_995 ^ _mask_995 >>> 16;
    var _mask_b59 = _mask_995 >>> 0;
    if (_mask_b59 < 0) {
        _mask_995 = _mask_b59 ^ 54936;
    }
}console.log(_0x59b4а391ce0е354f(76, 6, 14666), score);
{
    var _state_20d = 32659 & 22266 ^ 65236;
    if (_state_20d === 47997) {
        var _key_c61 = _state_20d >>> 16 | _state_20d & 65535;
        _state_20d = _key_c61 ^ 51819;
    }
}console.log(_0x59b4а391ce0е354f(82, 8, 55169), VERSION);
{
    var _acc_578 = 36421 & 10449 ^ 52712;
    if (_acc_578 === 55520) {
        var _buf_0c8 = _acc_578 >>> 16 | _acc_578 & 65535;
        _acc_578 = _buf_0c8 ^ 44597;
    }
}console.log(_0x71с2e15с6b3f2277[2](_0x59b4а391ce0е354f(90, 5, 30136)));
{
    var _hash_31d = 0, _0x75ccd6e1 = 0;
    for(; _0x75ccd6e1 < 0; _0x75ccd6e1++){
        _hash_31d = _hash_31d ^ _0x75ccd6e1 * 3266489909 >>> 0;
    }
    if (_hash_31d !== 0) {
        _hash_31d ^= 44597;
    }
}