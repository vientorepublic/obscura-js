function __haze_tag(v, checksum) {
  Object.defineProperty(v, __haze_sym, {
    value: checksum,
    enumerable: false
  });
  return v;
}
const __haze_sym = Symbol("jas");
const __haze_Math_floor = Math.floor.bind(Math);
const __haze_Math_random = Math.random.bind(Math);
const __haze_Math_ceil = Math.ceil.bind(Math);
const __haze_Math_round = Math.round.bind(Math);
const __haze_Object_defineProperty = Object.defineProperty.bind(Object);
const __haze_Object_keys = Object.keys.bind(Object);
const __haze_Array_prototype_slice = Array.prototype.slice.bind(Array.prototype);
const __haze_Array_prototype_forEach = Array.prototype.forEach.bind(Array.prototype);
if (0 === 1) {
  console.log("unreachable");
}
function __haze_sp(start, len, seed) {
  let __haze_s = 0;
  var key, out;
  while (true) {
    switch (__haze_s) {
      case 0:
        key = seed, out = "";
        __haze_s = 1;
        break;
      case 1:
        for (let i = 0; i < len; i++) {
          const b = (__haze_pool[start + i] ^ key) & 127;
          out += String.fromCodePoint(b);
          key = key + __haze_pool[start + i] & 127;
        }
        __haze_s = 2;
        break;
      case 2:
        return out;
        __haze_s = -1;
        break;
      default:
        return;
    }
  }
}
while (false) {
  39024;
}
const __haze_pool = __haze_tag([98, 105, 25, 98, 31, 35, 18, 11, 21, 29, 2, 5, 13, 20, 98, 20, 37, 94, 103, 79, 86, 117, 115, 25, 59, 75, 17, 107, 24, 103, 107, 113, 107, 24, 103, 80, 33, 2, 0, 6, 26, 112, 83, 33, 21, 29, 119, 100, 17, 97, 72, 66, 13, 3, 25, 56, 41, 19, 100, 2, 66, 3, 4, 10, 116, 27, 107, 0, 30, 126, 121, 64, 12, 29, 105, 79, 124, 67, 27, 119, 18, 98, 1, 74, 107, 121, 103, 22, 110], 3735928502);
var __dead_1120 = 59 & 0;
const __haze_ft = __haze_tag([function (a, b) {
  return (a ^ b) + 2 * (a & b);
}, function (a, b) {
  return a * b;
}, function (name) {
  let __haze_s = 0;
  var msg;
  while (true) {
    switch (__haze_s) {
      case 0:
        msg = __haze_sp(0, 7, 42) + name + __haze_sp(7, 18, 42);
        __haze_s = 1;
        break;
      case 1:
        name === __haze_sp(25, 5, 42) ? console.log(__haze_sp(30, 21, 42)) : console.log(msg);
        __haze_s = 2;
        break;
      case 2:
        return msg;
        __haze_s = -1;
        break;
      default:
        return;
    }
  }
}, function (x, y) {
  let __haze_s = 0;
  var base, bonus, result;
  while (true) {
    switch (__haze_s) {
      case 0:
        base = __haze_ft[0](x, y);
        __haze_s = 1;
        break;
      case 1:
        bonus = __haze_ft[1](base, 2);
        __haze_s = 2;
        break;
      case 2:
        result = (bonus ^ x) - 2 * (~bonus & x);
        __haze_s = 3;
        break;
      case 3:
        return result;
        __haze_s = -1;
        break;
      default:
        return;
    }
  }
}], 3735928555);
if (0 === 1) {
  console.log("unreachable");
}
// sample.js — haze obfuscation demo

const SECRET_KEY = __haze_sp(51, 14, 42);
while (false) {
  22017;
}
const VERSION = __haze_sp(65, 5, 42);
var __dead_7c9c = 34 & 0;
const score = __haze_ft[3](7, 3);
if (0 === 1) {
  console.log("unreachable");
}
console.log(__haze_sp(70, 6, 42), score);
while (false) {
  18259;
}
console.log(__haze_sp(76, 8, 42), VERSION);
var __dead_8dbe = 97 & 0;
console.log(__haze_ft[2](__haze_sp(84, 5, 42)));
if (0 === 1) {
  console.log("unreachable");
}