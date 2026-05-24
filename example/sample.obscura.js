function _0x079909a2(v, checksum) {
  Object.defineProperty(v, _0xd341bfb6, {
    value: checksum,
    enumerable: false
  });
  return v;
}
const _0xd341bfb6 = Symbol("zom3i0");
const _0xa765331d = Math.floor.bind(Math);
const _0x51445b26 = Math.random.bind(Math);
const _0xd4369e9e = Math.ceil.bind(Math);
const _0xc0fd6ae5 = Math.round.bind(Math);
const _0xef388021 = Object.defineProperty.bind(Object);
const _0xc84bc675 = Object.keys.bind(Object);
const _0x539c47ea = Array.prototype.slice.bind(Array.prototype);
const _0x92268e2f = Array.prototype.forEach.bind(Array.prototype);
{
  var _tmp_5aa = 26088 ^ 3210233709;
  _tmp_5aa = _tmp_5aa ^ _tmp_5aa >>> 16;
  var _buf_d14 = _tmp_5aa >>> 0;
  if (_buf_d14 < 0) {
    _tmp_5aa = _buf_d14 ^ 20844;
  }
}
function _0x7b8860c8(start, len, seed) {
  {
    var _mask_edb = 87 >> 6;
    switch (_mask_edb) {
      case 257:
        var _0x41d0e943 = _mask_edb ^ 19369;
        break;
      case 513:
        _mask_edb = 0;
        break;
    }
  }
  let _0x073d29b4 = 0;
  var key, out;
  {
    var _val_7f5 = 22360 ^ 22360 | 0;
    if (_val_7f5 >>> 1 >= 1073741824) {
      _val_7f5 += 44597;
    }
  }
  while (true) {
    switch (_0x073d29b4) {
      case 0:
        key = seed, out = "";
        _0x073d29b4 = 1;
        break;
      case 1:
        for (let i = 0; i < len; i++) {
          const b = (_0x36a19173[start + i] ^ key) & 65535;
          out += String.fromCharCode(b);
          key = key + _0x36a19173[start + i] & 65535;
        }
        _0x073d29b4 = 2;
        break;
      case 2:
        return out;
        _0x073d29b4 = -1;
        break;
      default:
        return;
    }
  }
}
{
  var _key_11a = 54821 ^ 2246822507;
  _key_11a = _key_11a ^ _key_11a >>> 16;
  var _buf_0a2 = _key_11a >>> 0;
  if (_buf_0a2 < 0) {
    _key_11a = _buf_0a2 ^ 25236;
  }
}
const _0x36a19173 = _0x079909a2([19827, 39627, 13589, 27362, 54559, 43683, 21778, 60243, 55013, 44541, 23490, 46853, 28173, 56340, 47330, 28948, 58021, 50526, 35559, 5455, 10961, 21997, 43791, 22248, 44294, 23051, 46309, 26951, 35272, 4885, 9963, 19736, 39655, 10145, 20453, 40715, 15896, 31975, 63824, 62113, 58626, 51712, 37894, 10266, 20720, 41299, 17057, 34069, 2589, 5367, 10724, 21265, 42721, 19784, 50808, 36077, 6415, 13032, 25862, 51723, 38117, 10564, 21193, 42259, 19172, 38146, 10818, 21635, 43268, 21002, 42100, 25727, 51427, 37248, 8990, 18046, 726, 1336, 2812, 5629, 11241, 22351, 41194, 16835, 33563, 1783, 3346, 6882, 13569, 27210, 16050, 32201, 64263, 62998, 60654], 678237878);
{
  var _key_529 = 0,
    _0x7da2bbed = 0;
  for (; _0x7da2bbed < 0; _0x7da2bbed++) {
    _key_529 = (_key_529 ^ _0x7da2bbed * 3266489909) >>> 0;
  }
  if (_key_529 !== 0) {
    _key_529 ^= 44597;
  }
}
const _0xbcb19b7b = _0x079909a2([function (a, b) {
  return (a ^ b) + 2 * (a & b);
}, function (a, b) {
  return a * b;
}, function (name) {
  let _0x073d29b4 = 0;
  var msg;
  (function _0x527a981a() {
    var _flag_c1f = 175895103;
    _flag_c1f ^= _flag_c1f >>> 16;
    _flag_c1f = _flag_c1f * 3210233709 >>> 0;
    return _flag_c1f;
  })();
  while (true) {
    switch (_0x073d29b4) {
      case 0:
        msg = _0x7b8860c8(0, 7, 19771) + name + _0x7b8860c8(7, 21, 60274);
        _0x073d29b4 = 1;
        break;
      case 1:
        name === _0x7b8860c8(28, 5, 35241) ? console.log(_0x7b8860c8(33, 21, 10208)) : console.log(msg);
        _0x073d29b4 = 2;
        break;
      case 2:
        return msg;
        _0x073d29b4 = -1;
        break;
      default:
        return;
    }
  }
}, function (x, y) {
  {
    var _state_b0e = 52066 ^ 2654435769;
    _state_b0e = _state_b0e ^ _state_b0e >>> 16;
    var _key_60f = _state_b0e >>> 0;
    if (_key_60f < 0) {
      _state_b0e = _key_60f ^ 30821;
    }
  }
  let _0x073d29b4 = 1;
  var base, bonus, result;
  while (true) {
    switch (_0x073d29b4) {
      case 1:
        base = _0xbcb19b7b[0](x, y);
        _0x073d29b4 = 0;
        break;
      case 0:
        bonus = _0xbcb19b7b[1](base, 2);
        _0x073d29b4 = 3;
        break;
      case 3:
        result = (bonus ^ x) - 2 * (~bonus & x);
        _0x073d29b4 = 2;
        break;
      case 2:
        return result;
        _0x073d29b4 = -1;
        break;
      default:
        return;
    }
  }
}], 679841387);
{
  var _mask_da0 = 190 >> 6;
  switch (_mask_da0) {
    case 258:
      var _0x408a4086 = _mask_da0 ^ 18285;
      break;
    case 514:
      _mask_da0 = 0;
      break;
  }
}
const SECRET_KEY = _0x7b8860c8(54, 17, 50711);
{
  var _val_3b1 = 50250 ^ 50250 | 0;
  if (_val_3b1 >>> 1 >= 1073741824) {
    _val_3b1 += 31161;
  }
}
const VERSION = _0x7b8860c8(71, 5, 25678);
{
  var _tmp_ee5 = 0,
    _0xdb769cb1 = 0;
  for (; _0xdb769cb1 < 0; _0xdb769cb1++) {
    _tmp_ee5 = (_tmp_ee5 ^ _0xdb769cb1 * 1798982569) >>> 0;
  }
  if (_tmp_ee5 !== 0) {
    _tmp_ee5 ^= 19369;
  }
}
const score = _0xbcb19b7b[3](7, 3);
{
  var _hash_ffb = 0,
    _0x436f8557 = 0;
  for (; _0x436f8557 < 0; _0x436f8557++) {
    _hash_ffb = (_hash_ffb ^ _0x436f8557 * 2246822507) >>> 0;
  }
  if (_hash_ffb !== 0) {
    _hash_ffb ^= 51819;
  }
}
console.log(_0x7b8860c8(76, 6, 645), score);
{
  var _hash_fb9 = 169 >> 7;
  switch (_hash_fb9) {
    case 257:
      var _0x6faaa4bb = _hash_fb9 ^ 31161;
      break;
    case 513:
      _hash_fb9 = 0;
      break;
  }
}
console.log(_0x7b8860c8(82, 8, 41148), VERSION);
{
  var _val_b8f = 247 >> 6;
  switch (_val_b8f) {
    case 259:
      var _0x87efc4c2 = _val_b8f ^ 44597;
      break;
    case 515:
      _val_b8f = 0;
      break;
  }
}
console.log(_0xbcb19b7b[2](_0x7b8860c8(90, 5, 16115)));
try {
  var _flag_b9b = 2147483647,
    _shift_219 = 2147483647 >>> 2;
  while (_flag_b9b < _shift_219) {
    _flag_b9b = _flag_b9b >>> 1 ^ 31161;
  }
} catch (_e) {}