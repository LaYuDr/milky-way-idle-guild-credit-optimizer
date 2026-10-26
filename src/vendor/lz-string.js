/*
 * lz-string 1.5.0, UTF-16 codec subset. Copyright (c) 2013 pieroxy.
 * MIT license: docs/THIRD_PARTY_NOTICES.md.
 * Adapted with a decoded-length limit and an isolated project export.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MwiGuildStorageLZ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const r = String.fromCharCode;
  const i = {
    compressToUTF16: function (o) {
      return null == o
        ? ""
        : i._compress(o, 15, function (o) {
            return r(o + 32);
          }) + " ";
    },
    _compress: function (r, o, n) {
      if (null == r) return "";
      var e,
        t,
        i,
        s = {},
        u = {},
        a = "",
        p = "",
        c = "",
        l = 2,
        f = 3,
        h = 2,
        d = [],
        m = 0,
        v = 0;
      for (i = 0; i < r.length; i += 1)
        if (
          ((a = r.charAt(i)),
          Object.prototype.hasOwnProperty.call(s, a) || ((s[a] = f++), (u[a] = !0)),
          (p = c + a),
          Object.prototype.hasOwnProperty.call(s, p))
        )
          c = p;
        else {
          if (Object.prototype.hasOwnProperty.call(u, c)) {
            if (c.charCodeAt(0) < 256) {
              for (e = 0; e < h; e++) ((m <<= 1), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++);
              for (t = c.charCodeAt(0), e = 0; e < 8; e++)
                ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
            } else {
              for (t = 1, e = 0; e < h; e++)
                ((m = (m << 1) | t), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t = 0));
              for (t = c.charCodeAt(0), e = 0; e < 16; e++)
                ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
            }
            (0 == --l && ((l = Math.pow(2, h)), h++), delete u[c]);
          } else
            for (t = s[c], e = 0; e < h; e++)
              ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
          (0 == --l && ((l = Math.pow(2, h)), h++), (s[p] = f++), (c = String(a)));
        }
      if ("" !== c) {
        if (Object.prototype.hasOwnProperty.call(u, c)) {
          if (c.charCodeAt(0) < 256) {
            for (e = 0; e < h; e++) ((m <<= 1), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++);
            for (t = c.charCodeAt(0), e = 0; e < 8; e++)
              ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
          } else {
            for (t = 1, e = 0; e < h; e++)
              ((m = (m << 1) | t), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t = 0));
            for (t = c.charCodeAt(0), e = 0; e < 16; e++)
              ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
          }
          (0 == --l && ((l = Math.pow(2, h)), h++), delete u[c]);
        } else
          for (t = s[c], e = 0; e < h; e++)
            ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
        0 == --l && ((l = Math.pow(2, h)), h++);
      }
      for (t = 2, e = 0; e < h; e++)
        ((m = (m << 1) | (1 & t)), v == o - 1 ? ((v = 0), d.push(n(m)), (m = 0)) : v++, (t >>= 1));
      for (;;) {
        if (((m <<= 1), v == o - 1)) {
          d.push(n(m));
          break;
        }
        v++;
      }
      return d.join("");
    },
    _decompress: function (o, n, e, maxLength) {
      let outputLength = 1;
      var t,
        i,
        s,
        u,
        a,
        p,
        c,
        l = [],
        f = 4,
        h = 4,
        d = 3,
        m = "",
        v = [],
        g = { val: e(0), position: n, index: 1 };
      for (t = 0; t < 3; t += 1) l[t] = t;
      for (s = 0, a = Math.pow(2, 2), p = 1; p != a;)
        ((u = g.val & g.position),
          (g.position >>= 1),
          0 == g.position && ((g.position = n), (g.val = e(g.index++))),
          (s |= (u > 0 ? 1 : 0) * p),
          (p <<= 1));
      switch (s) {
        case 0:
          for (s = 0, a = Math.pow(2, 8), p = 1; p != a;)
            ((u = g.val & g.position),
              (g.position >>= 1),
              0 == g.position && ((g.position = n), (g.val = e(g.index++))),
              (s |= (u > 0 ? 1 : 0) * p),
              (p <<= 1));
          c = r(s);
          break;
        case 1:
          for (s = 0, a = Math.pow(2, 16), p = 1; p != a;)
            ((u = g.val & g.position),
              (g.position >>= 1),
              0 == g.position && ((g.position = n), (g.val = e(g.index++))),
              (s |= (u > 0 ? 1 : 0) * p),
              (p <<= 1));
          c = r(s);
          break;
        case 2:
          return "";
      }
      for (l[3] = c, i = c, v.push(c); ;) {
        if (g.index > o) return "";
        for (s = 0, a = Math.pow(2, d), p = 1; p != a;)
          ((u = g.val & g.position),
            (g.position >>= 1),
            0 == g.position && ((g.position = n), (g.val = e(g.index++))),
            (s |= (u > 0 ? 1 : 0) * p),
            (p <<= 1));
        switch ((c = s)) {
          case 0:
            for (s = 0, a = Math.pow(2, 8), p = 1; p != a;)
              ((u = g.val & g.position),
                (g.position >>= 1),
                0 == g.position && ((g.position = n), (g.val = e(g.index++))),
                (s |= (u > 0 ? 1 : 0) * p),
                (p <<= 1));
            ((l[h++] = r(s)), (c = h - 1), f--);
            break;
          case 1:
            for (s = 0, a = Math.pow(2, 16), p = 1; p != a;)
              ((u = g.val & g.position),
                (g.position >>= 1),
                0 == g.position && ((g.position = n), (g.val = e(g.index++))),
                (s |= (u > 0 ? 1 : 0) * p),
                (p <<= 1));
            ((l[h++] = r(s)), (c = h - 1), f--);
            break;
          case 2:
            return v.join("");
        }
        if ((0 == f && ((f = Math.pow(2, d)), d++), l[c])) m = l[c];
        else {
          if (c !== h) return null;
          m = i + i.charAt(0);
        }
        outputLength += m.length;
        if (outputLength > maxLength) throw new Error("Decompressed storage exceeds its declared length");
        (v.push(m), (l[h++] = i + m.charAt(0)), (i = m), 0 == --f && ((f = Math.pow(2, d)), d++));
      }
    }
  };
  return {
    compressToUTF16: i.compressToUTF16,
    decompressFromUTF16(value, maxLength) {
      if (typeof value !== "string" || !value.length) return null;
      return i._decompress(value.length, 16384, (index) => value.charCodeAt(index) - 32, maxLength);
    }
  };
});
