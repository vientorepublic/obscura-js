function _0x525cc8ba(v, checksum) {
  Object.defineProperty(v, _0x89be7519, {
    value: checksum,
    enumerable: false
  });
  return v;
}
const _0x89be7519 = Symbol("1opq4l");
const _0x35b860ad = Math.floor.bind(Math);
const _0x0f7dbe9f = Math.random.bind(Math);
const _0x8cfc0e22 = Math.ceil.bind(Math);
const _0x1f00e110 = Math.round.bind(Math);
const _0x4246d9e4 = Object.defineProperty.bind(Object);
const _0xdb91e434 = Object.keys.bind(Object);
const _0x7ba53fb0 = Array.prototype.slice.bind(Array.prototype);
const _0x25b5a43f = Array.prototype.forEach.bind(Array.prototype);
{
  var _state_27a = 29741 ^ 29741 | 0;
  if (_state_27a >>> 1 >= 1073741824) {
    _state_27a += 18285;
  }
}
function _0x5a426e1c(start, len, seed) {
  let _0x5b388b4b = 1;
  {
    var _state_ea5 = 38333 & 26485 ^ 14294;
    if (_state_ea5 === 17946) {
      var _flag_de1 = _state_ea5 >>> 16 | _state_ea5 & 65535;
      _state_ea5 = _flag_de1 ^ 51819;
    }
  }
  var key, out;
  {
    var _mask_40d = 0,
      _0x961c0f3a = 0;
    for (; _0x961c0f3a < 0; _0x961c0f3a++) {
      _mask_40d = (_mask_40d ^ _0x961c0f3a * 1798982569) >>> 0;
    }
    if (_mask_40d !== 0) {
      _mask_40d ^= 19369;
    }
  }
  while (true) {
    switch (_0x5b388b4b) {
      case 1:
        key = seed, out = "";
        _0x5b388b4b = 2;
        break;
      case 2:
        for (let i = 0; i < len; i++) {
          const b = (_0xab2cd49b[start + i] ^ key) & 65535;
          out += String.fromCharCode(b);
          key = key + _0xab2cd49b[start + i] & 65535;
        }
        _0x5b388b4b = 0;
        break;
      case 0:
        return out;
        _0x5b388b4b = -1;
        break;
      default:
        return;
    }
  }
}
{
  var _buf_6fc = 1722 ^ 1722 | 0;
  if (_buf_6fc >>> 1 >= 1073741824) {
    _buf_6fc += 31161;
  }
}
const _0xab2cd49b = _0x525cc8ba([10929, 22014, 44028, 22516, 44811, 24249, 48403, 31328, 62670, 59661, 53987, 42307, 19157, 38397, 11235, 22280, 44573, 23782, 47381, 29355, 58707, 51948, 38146, 10846, 21675, 43291, 21217, 42263, 51549, 37396, 9408, 18737, 37378, 26423, 52748, 40163, 14592, 29196, 58379, 51453, 1308, 2798, 5606, 11086, 22238, 44526, 23526, 46915, 28353, 56576, 47643, 29920, 59660, 53771, 42237, 41943, 18424, 36842, 8014, 16094, 32238, 64486, 63299, 61122, 56598, 47850, 29980, 60129, 54548, 43749, 21787, 43773, 16844, 41900, 10052, 57347, 32313, 64754, 63991, 62232, 7396, 14598, 29214, 58603, 51625, 37710, 9754, 19687, 39192, 47753, 29991, 59929, 54501, 43287, 21247, 42412, 19287, 38633, 11608, 22686, 45547, 25577, 50949, 36375, 7423, 63317, 61162, 56583, 47640, 29881, 59695, 53779, 42219, 18691, 38158, 10778, 21735, 43288, 21177, 42297, 19183, 38145, 10778, 21749, 13255, 26378, 52743, 39960, 14521, 28985, 58083, 50449, 35342, 53644, 41730, 17925, 35853, 6164, 12514, 24852, 49829, 34120, 2579, 5350, 10496, 21063, 42130, 28722, 57452, 3680, 44246, 22847, 45808, 26098, 52055, 38558, 11550, 23269, 46345, 27153, 54501, 43275, 19143, 38156, 10979, 21760, 43532, 21515, 43261, 59554, 53759, 41960, 18200, 36602, 7677, 34646, 3614, 7418, 14844, 29665, 59156, 52965, 40219, 15101, 9587, 19130, 38394, 11238, 22299, 44791, 23892], 2635945492);
{
  var _buf_4f3 = 41360 & 63099 ^ 38943;
  if (_buf_4f3 === 19270) {
    var _acc_2e6 = _buf_4f3 >>> 16 | _buf_4f3 & 65535;
    _buf_4f3 = _acc_2e6 ^ 31161;
  }
}
const API_URL = _0x5a426e1c(0, 28, 10969);
try {
  var _acc_867 = 2147483647,
    _tmp_3ee = 2147483647 >>> 2;
  while (_acc_867 < _tmp_3ee) {
    _acc_867 = _acc_867 >>> 1 ^ 19369;
  }
} catch (_e) {}
const APP_NAME = _0x5a426e1c(28, 5, 51472);
(function _0xcc2db093() {
  var _flag_3bc = 2347538716;
  _flag_3bc ^= _flag_3bc >>> 16;
  try {
    var _crc_85d = 2147483647,
      _val_6d1 = 2147483647 >>> 2;
    while (_crc_85d < _val_6d1) {
      _crc_85d = _crc_85d >>> 1 ^ 51819;
    }
  } catch (_e) {}
  _flag_3bc = _flag_3bc * 2246822507 >>> 0;
  return _flag_3bc;
})();
function Button({
  label,
  variant,
  onClick
}) {
  {
    var _acc_a0d = 56386 ^ 56386 | 0;
    if (_acc_a0d >>> 1 >= 1073741824) {
      _acc_a0d += 51819;
    }
  }
  let _0x5b388b4b = 0;
  var cls;
  try {
    var _flag_d82 = 2147483647,
      _acc_596 = 2147483647 >>> 2;
    while (_flag_d82 < _acc_596) {
      _flag_d82 = _flag_d82 >>> 1 ^ 51819;
    }
  } catch (_e) {}
  while (true) {
    switch (_0x5b388b4b) {
      case 0:
        cls = variant === _0x5a426e1c(33, 7, 26439) ? _0x5a426e1c(40, 15, 1406) : _0x5a426e1c(55, 17, 41909);
        _0x5b388b4b = 1;
        break;
      case 1:
        return <button className={cls} aria-label={label} onClick={onClick}>
      {label}
    </button>;
        _0x5b388b4b = -1;
        break;
      default:
        return;
    }
  }
}
{
  var _buf_30a = 55331 ^ 55331 | 0;
  if (_buf_30a >>> 1 >= 1073741824) {
    _buf_30a += 31161;
  }
}
function UserCard({
  name,
  role,
  avatarUrl
}) {
  let _0x5b388b4b = 0;
  {
    var _key_524 = 0,
      _0xb582614f = 0;
    for (; _0xb582614f < 0; _0xb582614f++) {
      _key_524 = (_key_524 ^ _0xb582614f * 3266489909) >>> 0;
    }
    if (_key_524 !== 0) {
      _key_524 ^= 44597;
    }
  }
  {
    var _crc_7e1 = 48234 ^ 48234 | 0;
    if (_crc_7e1 >>> 1 >= 1073741824) {
      _crc_7e1 += 51819;
    }
  }
  var title, initials;
  while (true) {
    switch (_0x5b388b4b) {
      case 0:
        title = APP_NAME + _0x5a426e1c(72, 3, 16876) + role;
        _0x5b388b4b = 2;
        break;
      case 2:
        initials = name.split(_0x5a426e1c(75, 1, 57379)).map(w => w[0]).join("");
        _0x5b388b4b = 1;
        break;
      case 1:
        return <div className={_0x5a426e1c(76, 4, 32346)} data-testid={_0x5a426e1c(80, 9, 7313)}>
      <img src={avatarUrl} alt={_0x5a426e1c(89, 10, 47816) + name} className={_0x5a426e1c(99, 6, 22783)} />
      <div className={_0x5a426e1c(105, 9, 63286)}>
        <h2 className={_0x5a426e1c(114, 10, 38253)}>{title}</h2>
        <p className={_0x5a426e1c(124, 9, 13220)}>
          {_0x5a426e1c(133, 14, 53723)}
          <strong>{name}</strong>
          {_0x5a426e1c(147, 2, 28690) + initials + _0x5a426e1c(149, 1, 3657)}
        </p>
        <Button label={_0x5a426e1c(150, 12, 44160)} variant={_0x5a426e1c(162, 7, 19127)} onClick={() => {}} />
        <Button label={_0x5a426e1c(169, 6, 59630)} variant={_0x5a426e1c(175, 9, 34597)} onClick={() => {}} />
      </div>
    </div>;
        _0x5b388b4b = -1;
        break;
      default:
        return;
    }
  }
}
{
  var _tmp_3d6 = 21917 & 11416 ^ 42673;
  if (_tmp_3d6 === 46432) {
    var _val_687 = _tmp_3d6 >>> 16 | _tmp_3d6 & 65535;
    _tmp_3d6 = _val_687 ^ 51819;
  }
}
function fetchUser(id) {
  {
    var _key_ee6 = 43093 & 38438 ^ 14629;
    if (_key_ee6 === 52312) {
      var _crc_990 = _key_ee6 >>> 16 | _key_ee6 & 65535;
      _key_ee6 = _crc_990 ^ 51819;
    }
  }
  try {
    var _buf_82e = 2147483647,
      _buf_ef7 = 2147483647 >>> 2;
    while (_buf_82e < _buf_ef7) {
      _buf_82e = _buf_82e >>> 1 ^ 19369;
    }
  } catch (_e) {}
  let _0x5b388b4b = 0;
  var url;
  while (true) {
    switch (_0x5b388b4b) {
      case 0:
        url = API_URL + _0x5a426e1c(184, 7, 9564) + id;
        _0x5b388b4b = 1;
        break;
      case 1:
        return fetch(url).then(res => res.json());
        _0x5b388b4b = -1;
        break;
      default:
        return;
    }
  }
}
{
  var _shift_188 = 16884 ^ 16884 | 0;
  if (_shift_188 >>> 1 >= 1073741824) {
    _shift_188 += 18285;
  }
}
export { UserCard, fetchUser };
try {
  var _key_0ea = 2147483647,
    _acc_201 = 2147483647 >>> 2;
  while (_key_0ea < _acc_201) {
    _key_0ea = _key_0ea >>> 1 ^ 44597;
  }
} catch (_e) {}