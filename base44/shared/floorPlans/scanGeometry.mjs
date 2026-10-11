var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// routeprofit-pro/node_modules/splaytree/dist/splay.js
var require_splay = __commonJS({
  "routeprofit-pro/node_modules/splaytree/dist/splay.js"(exports, module) {
    (function(global, factory) {
      typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : global.SplayTree = factory();
    })(exports, (function() {
      "use strict";
      function DEFAULT_COMPARE(a, b2) {
        return a > b2 ? 1 : a < b2 ? -1 : 0;
      }
      var SplayTree = function SplayTree2(compare, noDuplicates) {
        if (compare === void 0) compare = DEFAULT_COMPARE;
        if (noDuplicates === void 0) noDuplicates = false;
        this._compare = compare;
        this._root = null;
        this._size = 0;
        this._noDuplicates = !!noDuplicates;
      };
      var prototypeAccessors = { size: {} };
      SplayTree.prototype.rotateLeft = function rotateLeft(x2) {
        var y2 = x2.right;
        if (y2) {
          x2.right = y2.left;
          if (y2.left) {
            y2.left.parent = x2;
          }
          y2.parent = x2.parent;
        }
        if (!x2.parent) {
          this._root = y2;
        } else if (x2 === x2.parent.left) {
          x2.parent.left = y2;
        } else {
          x2.parent.right = y2;
        }
        if (y2) {
          y2.left = x2;
        }
        x2.parent = y2;
      };
      SplayTree.prototype.rotateRight = function rotateRight(x2) {
        var y2 = x2.left;
        if (y2) {
          x2.left = y2.right;
          if (y2.right) {
            y2.right.parent = x2;
          }
          y2.parent = x2.parent;
        }
        if (!x2.parent) {
          this._root = y2;
        } else if (x2 === x2.parent.left) {
          x2.parent.left = y2;
        } else {
          x2.parent.right = y2;
        }
        if (y2) {
          y2.right = x2;
        }
        x2.parent = y2;
      };
      SplayTree.prototype._splay = function _splay(x2) {
        var this$1 = this;
        while (x2.parent) {
          var p = x2.parent;
          if (!p.parent) {
            if (p.left === x2) {
              this$1.rotateRight(p);
            } else {
              this$1.rotateLeft(p);
            }
          } else if (p.left === x2 && p.parent.left === p) {
            this$1.rotateRight(p.parent);
            this$1.rotateRight(p);
          } else if (p.right === x2 && p.parent.right === p) {
            this$1.rotateLeft(p.parent);
            this$1.rotateLeft(p);
          } else if (p.left === x2 && p.parent.right === p) {
            this$1.rotateRight(p);
            this$1.rotateLeft(p);
          } else {
            this$1.rotateLeft(p);
            this$1.rotateRight(p);
          }
        }
      };
      SplayTree.prototype.splay = function splay(x2) {
        var this$1 = this;
        var p, gp, ggp, l, r;
        while (x2.parent) {
          p = x2.parent;
          gp = p.parent;
          if (gp && gp.parent) {
            ggp = gp.parent;
            if (ggp.left === gp) {
              ggp.left = x2;
            } else {
              ggp.right = x2;
            }
            x2.parent = ggp;
          } else {
            x2.parent = null;
            this$1._root = x2;
          }
          l = x2.left;
          r = x2.right;
          if (x2 === p.left) {
            if (gp) {
              if (gp.left === p) {
                if (p.right) {
                  gp.left = p.right;
                  gp.left.parent = gp;
                } else {
                  gp.left = null;
                }
                p.right = gp;
                gp.parent = p;
              } else {
                if (l) {
                  gp.right = l;
                  l.parent = gp;
                } else {
                  gp.right = null;
                }
                x2.left = gp;
                gp.parent = x2;
              }
            }
            if (r) {
              p.left = r;
              r.parent = p;
            } else {
              p.left = null;
            }
            x2.right = p;
            p.parent = x2;
          } else {
            if (gp) {
              if (gp.right === p) {
                if (p.left) {
                  gp.right = p.left;
                  gp.right.parent = gp;
                } else {
                  gp.right = null;
                }
                p.left = gp;
                gp.parent = p;
              } else {
                if (r) {
                  gp.left = r;
                  r.parent = gp;
                } else {
                  gp.left = null;
                }
                x2.right = gp;
                gp.parent = x2;
              }
            }
            if (l) {
              p.right = l;
              l.parent = p;
            } else {
              p.right = null;
            }
            x2.left = p;
            p.parent = x2;
          }
        }
      };
      SplayTree.prototype.replace = function replace(u, v2) {
        if (!u.parent) {
          this._root = v2;
        } else if (u === u.parent.left) {
          u.parent.left = v2;
        } else {
          u.parent.right = v2;
        }
        if (v2) {
          v2.parent = u.parent;
        }
      };
      SplayTree.prototype.minNode = function minNode(u) {
        if (u === void 0) u = this._root;
        if (u) {
          while (u.left) {
            u = u.left;
          }
        }
        return u;
      };
      SplayTree.prototype.maxNode = function maxNode(u) {
        if (u === void 0) u = this._root;
        if (u) {
          while (u.right) {
            u = u.right;
          }
        }
        return u;
      };
      SplayTree.prototype.insert = function insert(key, data) {
        var z2 = this._root;
        var p = null;
        var comp = this._compare;
        var cmp;
        if (this._noDuplicates) {
          while (z2) {
            p = z2;
            cmp = comp(z2.key, key);
            if (cmp === 0) {
              return;
            } else if (comp(z2.key, key) < 0) {
              z2 = z2.right;
            } else {
              z2 = z2.left;
            }
          }
        } else {
          while (z2) {
            p = z2;
            if (comp(z2.key, key) < 0) {
              z2 = z2.right;
            } else {
              z2 = z2.left;
            }
          }
        }
        z2 = { key, data, left: null, right: null, parent: p };
        if (!p) {
          this._root = z2;
        } else if (comp(p.key, z2.key) < 0) {
          p.right = z2;
        } else {
          p.left = z2;
        }
        this.splay(z2);
        this._size++;
        return z2;
      };
      SplayTree.prototype.find = function find(key) {
        var z2 = this._root;
        var comp = this._compare;
        while (z2) {
          var cmp = comp(z2.key, key);
          if (cmp < 0) {
            z2 = z2.right;
          } else if (cmp > 0) {
            z2 = z2.left;
          } else {
            return z2;
          }
        }
        return null;
      };
      SplayTree.prototype.contains = function contains(key) {
        var node = this._root;
        var comparator = this._compare;
        while (node) {
          var cmp = comparator(key, node.key);
          if (cmp === 0) {
            return true;
          } else if (cmp < 0) {
            node = node.left;
          } else {
            node = node.right;
          }
        }
        return false;
      };
      SplayTree.prototype.remove = function remove(key) {
        var z2 = this.find(key);
        if (!z2) {
          return false;
        }
        this.splay(z2);
        if (!z2.left) {
          this.replace(z2, z2.right);
        } else if (!z2.right) {
          this.replace(z2, z2.left);
        } else {
          var y2 = this.minNode(z2.right);
          if (y2.parent !== z2) {
            this.replace(y2, y2.right);
            y2.right = z2.right;
            y2.right.parent = y2;
          }
          this.replace(z2, y2);
          y2.left = z2.left;
          y2.left.parent = y2;
        }
        this._size--;
        return true;
      };
      SplayTree.prototype.removeNode = function removeNode(z2) {
        if (!z2) {
          return false;
        }
        this.splay(z2);
        if (!z2.left) {
          this.replace(z2, z2.right);
        } else if (!z2.right) {
          this.replace(z2, z2.left);
        } else {
          var y2 = this.minNode(z2.right);
          if (y2.parent !== z2) {
            this.replace(y2, y2.right);
            y2.right = z2.right;
            y2.right.parent = y2;
          }
          this.replace(z2, y2);
          y2.left = z2.left;
          y2.left.parent = y2;
        }
        this._size--;
        return true;
      };
      SplayTree.prototype.erase = function erase(key) {
        var z2 = this.find(key);
        if (!z2) {
          return;
        }
        this.splay(z2);
        var s = z2.left;
        var t = z2.right;
        var sMax = null;
        if (s) {
          s.parent = null;
          sMax = this.maxNode(s);
          this.splay(sMax);
          this._root = sMax;
        }
        if (t) {
          if (s) {
            sMax.right = t;
          } else {
            this._root = t;
          }
          t.parent = sMax;
        }
        this._size--;
      };
      SplayTree.prototype.pop = function pop() {
        var node = this._root, returnValue = null;
        if (node) {
          while (node.left) {
            node = node.left;
          }
          returnValue = { key: node.key, data: node.data };
          this.remove(node.key);
        }
        return returnValue;
      };
      SplayTree.prototype.next = function next(node) {
        var successor = node;
        if (successor) {
          if (successor.right) {
            successor = successor.right;
            while (successor && successor.left) {
              successor = successor.left;
            }
          } else {
            successor = node.parent;
            while (successor && successor.right === node) {
              node = successor;
              successor = successor.parent;
            }
          }
        }
        return successor;
      };
      SplayTree.prototype.prev = function prev(node) {
        var predecessor = node;
        if (predecessor) {
          if (predecessor.left) {
            predecessor = predecessor.left;
            while (predecessor && predecessor.right) {
              predecessor = predecessor.right;
            }
          } else {
            predecessor = node.parent;
            while (predecessor && predecessor.left === node) {
              node = predecessor;
              predecessor = predecessor.parent;
            }
          }
        }
        return predecessor;
      };
      SplayTree.prototype.forEach = function forEach(callback) {
        var current = this._root;
        var s = [], done = false, i = 0;
        while (!done) {
          if (current) {
            s.push(current);
            current = current.left;
          } else {
            if (s.length > 0) {
              current = s.pop();
              callback(current, i++);
              current = current.right;
            } else {
              done = true;
            }
          }
        }
        return this;
      };
      SplayTree.prototype.range = function range(low, high, fn, ctx) {
        var this$1 = this;
        var Q2 = [];
        var compare = this._compare;
        var node = this._root, cmp;
        while (Q2.length !== 0 || node) {
          if (node) {
            Q2.push(node);
            node = node.left;
          } else {
            node = Q2.pop();
            cmp = compare(node.key, high);
            if (cmp > 0) {
              break;
            } else if (compare(node.key, low) >= 0) {
              if (fn.call(ctx, node)) {
                return this$1;
              }
            }
            node = node.right;
          }
        }
        return this;
      };
      SplayTree.prototype.keys = function keys() {
        var current = this._root;
        var s = [], r = [], done = false;
        while (!done) {
          if (current) {
            s.push(current);
            current = current.left;
          } else {
            if (s.length > 0) {
              current = s.pop();
              r.push(current.key);
              current = current.right;
            } else {
              done = true;
            }
          }
        }
        return r;
      };
      SplayTree.prototype.values = function values() {
        var current = this._root;
        var s = [], r = [], done = false;
        while (!done) {
          if (current) {
            s.push(current);
            current = current.left;
          } else {
            if (s.length > 0) {
              current = s.pop();
              r.push(current.data);
              current = current.right;
            } else {
              done = true;
            }
          }
        }
        return r;
      };
      SplayTree.prototype.at = function at2(index) {
        var current = this._root;
        var s = [], done = false, i = 0;
        while (!done) {
          if (current) {
            s.push(current);
            current = current.left;
          } else {
            if (s.length > 0) {
              current = s.pop();
              if (i === index) {
                return current;
              }
              i++;
              current = current.right;
            } else {
              done = true;
            }
          }
        }
        return null;
      };
      SplayTree.prototype.load = function load(keys, values, presort) {
        if (keys === void 0) keys = [];
        if (values === void 0) values = [];
        if (presort === void 0) presort = false;
        if (this._size !== 0) {
          throw new Error("bulk-load: tree is not empty");
        }
        var size = keys.length;
        if (presort) {
          sort(keys, values, 0, size - 1, this._compare);
        }
        this._root = loadRecursive(null, keys, values, 0, size);
        this._size = size;
        return this;
      };
      SplayTree.prototype.min = function min() {
        var node = this.minNode(this._root);
        if (node) {
          return node.key;
        } else {
          return null;
        }
      };
      SplayTree.prototype.max = function max() {
        var node = this.maxNode(this._root);
        if (node) {
          return node.key;
        } else {
          return null;
        }
      };
      SplayTree.prototype.isEmpty = function isEmpty() {
        return this._root === null;
      };
      prototypeAccessors.size.get = function() {
        return this._size;
      };
      SplayTree.createTree = function createTree(keys, values, comparator, presort, noDuplicates) {
        return new SplayTree(comparator, noDuplicates).load(keys, values, presort);
      };
      Object.defineProperties(SplayTree.prototype, prototypeAccessors);
      function loadRecursive(parent, keys, values, start, end) {
        var size = end - start;
        if (size > 0) {
          var middle = start + Math.floor(size / 2);
          var key = keys[middle];
          var data = values[middle];
          var node = { key, data, parent };
          node.left = loadRecursive(node, keys, values, start, middle);
          node.right = loadRecursive(node, keys, values, middle + 1, end);
          return node;
        }
        return null;
      }
      function sort(keys, values, left, right, compare) {
        if (left >= right) {
          return;
        }
        var pivot = keys[left + right >> 1];
        var i = left - 1;
        var j2 = right + 1;
        while (true) {
          do {
            i++;
          } while (compare(keys[i], pivot) < 0);
          do {
            j2--;
          } while (compare(keys[j2], pivot) > 0);
          if (i >= j2) {
            break;
          }
          var tmp = keys[i];
          keys[i] = keys[j2];
          keys[j2] = tmp;
          tmp = values[i];
          values[i] = values[j2];
          values[j2] = tmp;
        }
        sort(keys, values, left, j2, compare);
        sort(keys, values, j2 + 1, right, compare);
      }
      return SplayTree;
    }));
  }
});

// routeprofit-pro/node_modules/robust-predicates/umd/predicates.js
var require_predicates = __commonJS({
  "routeprofit-pro/node_modules/robust-predicates/umd/predicates.js"(exports, module) {
    (function(global, factory) {
      typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = global || self, factory(global.predicates = {}));
    })(exports, function(exports2) {
      "use strict";
      const epsilon = 11102230246251565e-32;
      const splitter = 134217729;
      const resulterrbound = (3 + 8 * epsilon) * epsilon;
      function sum(elen, e, flen, f, h) {
        let Q2, Qnew, hh, bvirt;
        let enow = e[0];
        let fnow = f[0];
        let eindex = 0;
        let findex = 0;
        if (fnow > enow === fnow > -enow) {
          Q2 = enow;
          enow = e[++eindex];
        } else {
          Q2 = fnow;
          fnow = f[++findex];
        }
        let hindex = 0;
        if (eindex < elen && findex < flen) {
          if (fnow > enow === fnow > -enow) {
            Qnew = enow + Q2;
            hh = Q2 - (Qnew - enow);
            enow = e[++eindex];
          } else {
            Qnew = fnow + Q2;
            hh = Q2 - (Qnew - fnow);
            fnow = f[++findex];
          }
          Q2 = Qnew;
          if (hh !== 0) {
            h[hindex++] = hh;
          }
          while (eindex < elen && findex < flen) {
            if (fnow > enow === fnow > -enow) {
              Qnew = Q2 + enow;
              bvirt = Qnew - Q2;
              hh = Q2 - (Qnew - bvirt) + (enow - bvirt);
              enow = e[++eindex];
            } else {
              Qnew = Q2 + fnow;
              bvirt = Qnew - Q2;
              hh = Q2 - (Qnew - bvirt) + (fnow - bvirt);
              fnow = f[++findex];
            }
            Q2 = Qnew;
            if (hh !== 0) {
              h[hindex++] = hh;
            }
          }
        }
        while (eindex < elen) {
          Qnew = Q2 + enow;
          bvirt = Qnew - Q2;
          hh = Q2 - (Qnew - bvirt) + (enow - bvirt);
          enow = e[++eindex];
          Q2 = Qnew;
          if (hh !== 0) {
            h[hindex++] = hh;
          }
        }
        while (findex < flen) {
          Qnew = Q2 + fnow;
          bvirt = Qnew - Q2;
          hh = Q2 - (Qnew - bvirt) + (fnow - bvirt);
          fnow = f[++findex];
          Q2 = Qnew;
          if (hh !== 0) {
            h[hindex++] = hh;
          }
        }
        if (Q2 !== 0 || hindex === 0) {
          h[hindex++] = Q2;
        }
        return hindex;
      }
      function sum_three(alen, a, blen, b2, clen, c, tmp, out) {
        return sum(sum(alen, a, blen, b2, tmp), tmp, clen, c, out);
      }
      function scale(elen, e, b2, h) {
        let Q2, sum2, hh, product1, product0;
        let bvirt, c, ahi, alo, bhi, blo;
        c = splitter * b2;
        bhi = c - (c - b2);
        blo = b2 - bhi;
        let enow = e[0];
        Q2 = enow * b2;
        c = splitter * enow;
        ahi = c - (c - enow);
        alo = enow - ahi;
        hh = alo * blo - (Q2 - ahi * bhi - alo * bhi - ahi * blo);
        let hindex = 0;
        if (hh !== 0) {
          h[hindex++] = hh;
        }
        for (let i = 1; i < elen; i++) {
          enow = e[i];
          product1 = enow * b2;
          c = splitter * enow;
          ahi = c - (c - enow);
          alo = enow - ahi;
          product0 = alo * blo - (product1 - ahi * bhi - alo * bhi - ahi * blo);
          sum2 = Q2 + product0;
          bvirt = sum2 - Q2;
          hh = Q2 - (sum2 - bvirt) + (product0 - bvirt);
          if (hh !== 0) {
            h[hindex++] = hh;
          }
          Q2 = product1 + sum2;
          hh = sum2 - (Q2 - product1);
          if (hh !== 0) {
            h[hindex++] = hh;
          }
        }
        if (Q2 !== 0 || hindex === 0) {
          h[hindex++] = Q2;
        }
        return hindex;
      }
      function negate(elen, e) {
        for (let i = 0; i < elen; i++) e[i] = -e[i];
        return elen;
      }
      function estimate(elen, e) {
        let Q2 = e[0];
        for (let i = 1; i < elen; i++) Q2 += e[i];
        return Q2;
      }
      function vec(n) {
        return new Float64Array(n);
      }
      const ccwerrboundA = (3 + 16 * epsilon) * epsilon;
      const ccwerrboundB = (2 + 12 * epsilon) * epsilon;
      const ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
      const B = vec(4);
      const C1 = vec(8);
      const C2 = vec(12);
      const D2 = vec(16);
      const u = vec(4);
      function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
        let acxtail, acytail, bcxtail, bcytail;
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
        const acx = ax - cx;
        const bcx = bx - cx;
        const acy = ay - cy;
        const bcy = by - cy;
        s1 = acx * bcy;
        c = splitter * acx;
        ahi = c - (c - acx);
        alo = acx - ahi;
        c = splitter * bcy;
        bhi = c - (c - bcy);
        blo = bcy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = acy * bcx;
        c = splitter * acy;
        ahi = c - (c - acy);
        alo = acy - ahi;
        c = splitter * bcx;
        bhi = c - (c - bcx);
        blo = bcx - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        B[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        B[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        B[2] = _j - (u3 - bvirt) + (_i - bvirt);
        B[3] = u3;
        let det = estimate(4, B);
        let errbound = ccwerrboundB * detsum;
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        bvirt = ax - acx;
        acxtail = ax - (acx + bvirt) + (bvirt - cx);
        bvirt = bx - bcx;
        bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
        bvirt = ay - acy;
        acytail = ay - (acy + bvirt) + (bvirt - cy);
        bvirt = by - bcy;
        bcytail = by - (bcy + bvirt) + (bvirt - cy);
        if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
          return det;
        }
        errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
        det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
        if (det >= errbound || -det >= errbound) return det;
        s1 = acxtail * bcy;
        c = splitter * acxtail;
        ahi = c - (c - acxtail);
        alo = acxtail - ahi;
        c = splitter * bcy;
        bhi = c - (c - bcy);
        blo = bcy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = acytail * bcx;
        c = splitter * acytail;
        ahi = c - (c - acytail);
        alo = acytail - ahi;
        c = splitter * bcx;
        bhi = c - (c - bcx);
        blo = bcx - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        u[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        u[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        u[2] = _j - (u3 - bvirt) + (_i - bvirt);
        u[3] = u3;
        const C1len = sum(4, B, 4, u, C1);
        s1 = acx * bcytail;
        c = splitter * acx;
        ahi = c - (c - acx);
        alo = acx - ahi;
        c = splitter * bcytail;
        bhi = c - (c - bcytail);
        blo = bcytail - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = acy * bcxtail;
        c = splitter * acy;
        ahi = c - (c - acy);
        alo = acy - ahi;
        c = splitter * bcxtail;
        bhi = c - (c - bcxtail);
        blo = bcxtail - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        u[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        u[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        u[2] = _j - (u3 - bvirt) + (_i - bvirt);
        u[3] = u3;
        const C2len = sum(C1len, C1, 4, u, C2);
        s1 = acxtail * bcytail;
        c = splitter * acxtail;
        ahi = c - (c - acxtail);
        alo = acxtail - ahi;
        c = splitter * bcytail;
        bhi = c - (c - bcytail);
        blo = bcytail - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = acytail * bcxtail;
        c = splitter * acytail;
        ahi = c - (c - acytail);
        alo = acytail - ahi;
        c = splitter * bcxtail;
        bhi = c - (c - bcxtail);
        blo = bcxtail - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        u[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        u[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        u[2] = _j - (u3 - bvirt) + (_i - bvirt);
        u[3] = u3;
        const Dlen = sum(C2len, C2, 4, u, D2);
        return D2[Dlen - 1];
      }
      function orient2d(ax, ay, bx, by, cx, cy) {
        const detleft = (ay - cy) * (bx - cx);
        const detright = (ax - cx) * (by - cy);
        const det = detleft - detright;
        if (detleft === 0 || detright === 0 || detleft > 0 !== detright > 0) return det;
        const detsum = Math.abs(detleft + detright);
        if (Math.abs(det) >= ccwerrboundA * detsum) return det;
        return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
      }
      function orient2dfast(ax, ay, bx, by, cx, cy) {
        return (ay - cy) * (bx - cx) - (ax - cx) * (by - cy);
      }
      const o3derrboundA = (7 + 56 * epsilon) * epsilon;
      const o3derrboundB = (3 + 28 * epsilon) * epsilon;
      const o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
      const bc = vec(4);
      const ca = vec(4);
      const ab = vec(4);
      const at_b = vec(4);
      const at_c = vec(4);
      const bt_c = vec(4);
      const bt_a = vec(4);
      const ct_a = vec(4);
      const ct_b = vec(4);
      const bct = vec(8);
      const cat = vec(8);
      const abt = vec(8);
      const u$1 = vec(4);
      const _8 = vec(8);
      const _8b = vec(8);
      const _16 = vec(8);
      const _12 = vec(12);
      let fin = vec(192);
      let fin2 = vec(192);
      function finadd(finlen, alen, a) {
        finlen = sum(finlen, fin, alen, a, fin2);
        const tmp = fin;
        fin = fin2;
        fin2 = tmp;
        return finlen;
      }
      function tailinit(xtail, ytail, ax, ay, bx, by, a, b2) {
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3, negate2;
        if (xtail === 0) {
          if (ytail === 0) {
            a[0] = 0;
            b2[0] = 0;
            return 1;
          } else {
            negate2 = -ytail;
            s1 = negate2 * ax;
            c = splitter * negate2;
            ahi = c - (c - negate2);
            alo = negate2 - ahi;
            c = splitter * ax;
            bhi = c - (c - ax);
            blo = ax - bhi;
            a[0] = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            a[1] = s1;
            s1 = ytail * bx;
            c = splitter * ytail;
            ahi = c - (c - ytail);
            alo = ytail - ahi;
            c = splitter * bx;
            bhi = c - (c - bx);
            blo = bx - bhi;
            b2[0] = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            b2[1] = s1;
            return 2;
          }
        } else {
          if (ytail === 0) {
            s1 = xtail * ay;
            c = splitter * xtail;
            ahi = c - (c - xtail);
            alo = xtail - ahi;
            c = splitter * ay;
            bhi = c - (c - ay);
            blo = ay - bhi;
            a[0] = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            a[1] = s1;
            negate2 = -xtail;
            s1 = negate2 * by;
            c = splitter * negate2;
            ahi = c - (c - negate2);
            alo = negate2 - ahi;
            c = splitter * by;
            bhi = c - (c - by);
            blo = by - bhi;
            b2[0] = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            b2[1] = s1;
            return 2;
          } else {
            s1 = xtail * ay;
            c = splitter * xtail;
            ahi = c - (c - xtail);
            alo = xtail - ahi;
            c = splitter * ay;
            bhi = c - (c - ay);
            blo = ay - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = ytail * ax;
            c = splitter * ytail;
            ahi = c - (c - ytail);
            alo = ytail - ahi;
            c = splitter * ax;
            bhi = c - (c - ax);
            blo = ax - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 - t0;
            bvirt = s0 - _i;
            a[0] = s0 - (_i + bvirt) + (bvirt - t0);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 - t1;
            bvirt = _0 - _i;
            a[1] = _0 - (_i + bvirt) + (bvirt - t1);
            u3 = _j + _i;
            bvirt = u3 - _j;
            a[2] = _j - (u3 - bvirt) + (_i - bvirt);
            a[3] = u3;
            s1 = ytail * bx;
            c = splitter * ytail;
            ahi = c - (c - ytail);
            alo = ytail - ahi;
            c = splitter * bx;
            bhi = c - (c - bx);
            blo = bx - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = xtail * by;
            c = splitter * xtail;
            ahi = c - (c - xtail);
            alo = xtail - ahi;
            c = splitter * by;
            bhi = c - (c - by);
            blo = by - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 - t0;
            bvirt = s0 - _i;
            b2[0] = s0 - (_i + bvirt) + (bvirt - t0);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 - t1;
            bvirt = _0 - _i;
            b2[1] = _0 - (_i + bvirt) + (bvirt - t1);
            u3 = _j + _i;
            bvirt = u3 - _j;
            b2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            b2[3] = u3;
            return 4;
          }
        }
      }
      function tailadd(finlen, a, b2, k2, z2) {
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _k, _0, s1, s0, u3;
        s1 = a * b2;
        c = splitter * a;
        ahi = c - (c - a);
        alo = a - ahi;
        c = splitter * b2;
        bhi = c - (c - b2);
        blo = b2 - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        c = splitter * k2;
        bhi = c - (c - k2);
        blo = k2 - bhi;
        _i = s0 * k2;
        c = splitter * s0;
        ahi = c - (c - s0);
        alo = s0 - ahi;
        u$1[0] = alo * blo - (_i - ahi * bhi - alo * bhi - ahi * blo);
        _j = s1 * k2;
        c = splitter * s1;
        ahi = c - (c - s1);
        alo = s1 - ahi;
        _0 = alo * blo - (_j - ahi * bhi - alo * bhi - ahi * blo);
        _k = _i + _0;
        bvirt = _k - _i;
        u$1[1] = _i - (_k - bvirt) + (_0 - bvirt);
        u3 = _j + _k;
        u$1[2] = _k - (u3 - _j);
        u$1[3] = u3;
        finlen = finadd(finlen, 4, u$1);
        if (z2 !== 0) {
          c = splitter * z2;
          bhi = c - (c - z2);
          blo = z2 - bhi;
          _i = s0 * z2;
          c = splitter * s0;
          ahi = c - (c - s0);
          alo = s0 - ahi;
          u$1[0] = alo * blo - (_i - ahi * bhi - alo * bhi - ahi * blo);
          _j = s1 * z2;
          c = splitter * s1;
          ahi = c - (c - s1);
          alo = s1 - ahi;
          _0 = alo * blo - (_j - ahi * bhi - alo * bhi - ahi * blo);
          _k = _i + _0;
          bvirt = _k - _i;
          u$1[1] = _i - (_k - bvirt) + (_0 - bvirt);
          u3 = _j + _k;
          u$1[2] = _k - (u3 - _j);
          u$1[3] = u3;
          finlen = finadd(finlen, 4, u$1);
        }
        return finlen;
      }
      function orient3dadapt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, permanent) {
        let finlen;
        let adxtail, bdxtail, cdxtail;
        let adytail, bdytail, cdytail;
        let adztail, bdztail, cdztail;
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
        const adx = ax - dx;
        const bdx = bx - dx;
        const cdx = cx - dx;
        const ady = ay - dy;
        const bdy = by - dy;
        const cdy = cy - dy;
        const adz = az - dz;
        const bdz = bz - dz;
        const cdz = cz - dz;
        s1 = bdx * cdy;
        c = splitter * bdx;
        ahi = c - (c - bdx);
        alo = bdx - ahi;
        c = splitter * cdy;
        bhi = c - (c - cdy);
        blo = cdy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cdx * bdy;
        c = splitter * cdx;
        ahi = c - (c - cdx);
        alo = cdx - ahi;
        c = splitter * bdy;
        bhi = c - (c - bdy);
        blo = bdy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bc[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bc[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        bc[2] = _j - (u3 - bvirt) + (_i - bvirt);
        bc[3] = u3;
        s1 = cdx * ady;
        c = splitter * cdx;
        ahi = c - (c - cdx);
        alo = cdx - ahi;
        c = splitter * ady;
        bhi = c - (c - ady);
        blo = ady - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = adx * cdy;
        c = splitter * adx;
        ahi = c - (c - adx);
        alo = adx - ahi;
        c = splitter * cdy;
        bhi = c - (c - cdy);
        blo = cdy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ca[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ca[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ca[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ca[3] = u3;
        s1 = adx * bdy;
        c = splitter * adx;
        ahi = c - (c - adx);
        alo = adx - ahi;
        c = splitter * bdy;
        bhi = c - (c - bdy);
        blo = bdy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = bdx * ady;
        c = splitter * bdx;
        ahi = c - (c - bdx);
        alo = bdx - ahi;
        c = splitter * ady;
        bhi = c - (c - ady);
        blo = ady - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ab[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ab[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ab[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ab[3] = u3;
        finlen = sum(
          sum(
            scale(4, bc, adz, _8),
            _8,
            scale(4, ca, bdz, _8b),
            _8b,
            _16
          ),
          _16,
          scale(4, ab, cdz, _8),
          _8,
          fin
        );
        let det = estimate(finlen, fin);
        let errbound = o3derrboundB * permanent;
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        bvirt = ax - adx;
        adxtail = ax - (adx + bvirt) + (bvirt - dx);
        bvirt = bx - bdx;
        bdxtail = bx - (bdx + bvirt) + (bvirt - dx);
        bvirt = cx - cdx;
        cdxtail = cx - (cdx + bvirt) + (bvirt - dx);
        bvirt = ay - ady;
        adytail = ay - (ady + bvirt) + (bvirt - dy);
        bvirt = by - bdy;
        bdytail = by - (bdy + bvirt) + (bvirt - dy);
        bvirt = cy - cdy;
        cdytail = cy - (cdy + bvirt) + (bvirt - dy);
        bvirt = az - adz;
        adztail = az - (adz + bvirt) + (bvirt - dz);
        bvirt = bz - bdz;
        bdztail = bz - (bdz + bvirt) + (bvirt - dz);
        bvirt = cz - cdz;
        cdztail = cz - (cdz + bvirt) + (bvirt - dz);
        if (adxtail === 0 && bdxtail === 0 && cdxtail === 0 && adytail === 0 && bdytail === 0 && cdytail === 0 && adztail === 0 && bdztail === 0 && cdztail === 0) {
          return det;
        }
        errbound = o3derrboundC * permanent + resulterrbound * Math.abs(det);
        det += adz * (bdx * cdytail + cdy * bdxtail - (bdy * cdxtail + cdx * bdytail)) + adztail * (bdx * cdy - bdy * cdx) + bdz * (cdx * adytail + ady * cdxtail - (cdy * adxtail + adx * cdytail)) + bdztail * (cdx * ady - cdy * adx) + cdz * (adx * bdytail + bdy * adxtail - (ady * bdxtail + bdx * adytail)) + cdztail * (adx * bdy - ady * bdx);
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        const at_len = tailinit(adxtail, adytail, bdx, bdy, cdx, cdy, at_b, at_c);
        const bt_len = tailinit(bdxtail, bdytail, cdx, cdy, adx, ady, bt_c, bt_a);
        const ct_len = tailinit(cdxtail, cdytail, adx, ady, bdx, bdy, ct_a, ct_b);
        const bctlen = sum(bt_len, bt_c, ct_len, ct_b, bct);
        finlen = finadd(finlen, scale(bctlen, bct, adz, _16), _16);
        const catlen = sum(ct_len, ct_a, at_len, at_c, cat);
        finlen = finadd(finlen, scale(catlen, cat, bdz, _16), _16);
        const abtlen = sum(at_len, at_b, bt_len, bt_a, abt);
        finlen = finadd(finlen, scale(abtlen, abt, cdz, _16), _16);
        if (adztail !== 0) {
          finlen = finadd(finlen, scale(4, bc, adztail, _12), _12);
          finlen = finadd(finlen, scale(bctlen, bct, adztail, _16), _16);
        }
        if (bdztail !== 0) {
          finlen = finadd(finlen, scale(4, ca, bdztail, _12), _12);
          finlen = finadd(finlen, scale(catlen, cat, bdztail, _16), _16);
        }
        if (cdztail !== 0) {
          finlen = finadd(finlen, scale(4, ab, cdztail, _12), _12);
          finlen = finadd(finlen, scale(abtlen, abt, cdztail, _16), _16);
        }
        if (adxtail !== 0) {
          if (bdytail !== 0) {
            finlen = tailadd(finlen, adxtail, bdytail, cdz, cdztail);
          }
          if (cdytail !== 0) {
            finlen = tailadd(finlen, -adxtail, cdytail, bdz, bdztail);
          }
        }
        if (bdxtail !== 0) {
          if (cdytail !== 0) {
            finlen = tailadd(finlen, bdxtail, cdytail, adz, adztail);
          }
          if (adytail !== 0) {
            finlen = tailadd(finlen, -bdxtail, adytail, cdz, cdztail);
          }
        }
        if (cdxtail !== 0) {
          if (adytail !== 0) {
            finlen = tailadd(finlen, cdxtail, adytail, bdz, bdztail);
          }
          if (bdytail !== 0) {
            finlen = tailadd(finlen, -cdxtail, bdytail, adz, adztail);
          }
        }
        return fin[finlen - 1];
      }
      function orient3d(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
        const adx = ax - dx;
        const bdx = bx - dx;
        const cdx = cx - dx;
        const ady = ay - dy;
        const bdy = by - dy;
        const cdy = cy - dy;
        const adz = az - dz;
        const bdz = bz - dz;
        const cdz = cz - dz;
        const bdxcdy = bdx * cdy;
        const cdxbdy = cdx * bdy;
        const cdxady = cdx * ady;
        const adxcdy = adx * cdy;
        const adxbdy = adx * bdy;
        const bdxady = bdx * ady;
        const det = adz * (bdxcdy - cdxbdy) + bdz * (cdxady - adxcdy) + cdz * (adxbdy - bdxady);
        const permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz);
        const errbound = o3derrboundA * permanent;
        if (det > errbound || -det > errbound) {
          return det;
        }
        return orient3dadapt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, permanent);
      }
      function orient3dfast(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
        const adx = ax - dx;
        const bdx = bx - dx;
        const cdx = cx - dx;
        const ady = ay - dy;
        const bdy = by - dy;
        const cdy = cy - dy;
        const adz = az - dz;
        const bdz = bz - dz;
        const cdz = cz - dz;
        return adx * (bdy * cdz - bdz * cdy) + bdx * (cdy * adz - cdz * ady) + cdx * (ady * bdz - adz * bdy);
      }
      const iccerrboundA = (10 + 96 * epsilon) * epsilon;
      const iccerrboundB = (4 + 48 * epsilon) * epsilon;
      const iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
      const bc$1 = vec(4);
      const ca$1 = vec(4);
      const ab$1 = vec(4);
      const aa = vec(4);
      const bb = vec(4);
      const cc = vec(4);
      const u$2 = vec(4);
      const v2 = vec(4);
      const axtbc = vec(8);
      const aytbc = vec(8);
      const bxtca = vec(8);
      const bytca = vec(8);
      const cxtab = vec(8);
      const cytab = vec(8);
      const abt$1 = vec(8);
      const bct$1 = vec(8);
      const cat$1 = vec(8);
      const abtt = vec(4);
      const bctt = vec(4);
      const catt = vec(4);
      const _8$1 = vec(8);
      const _16$1 = vec(16);
      const _16b = vec(16);
      const _16c = vec(16);
      const _32 = vec(32);
      const _32b = vec(32);
      const _48 = vec(48);
      const _64 = vec(64);
      let fin$1 = vec(1152);
      let fin2$1 = vec(1152);
      function finadd$1(finlen, a, alen) {
        finlen = sum(finlen, fin$1, a, alen, fin2$1);
        const tmp = fin$1;
        fin$1 = fin2$1;
        fin2$1 = tmp;
        return finlen;
      }
      function incircleadapt(ax, ay, bx, by, cx, cy, dx, dy, permanent) {
        let finlen;
        let adxtail, bdxtail, cdxtail, adytail, bdytail, cdytail;
        let axtbclen, aytbclen, bxtcalen, bytcalen, cxtablen, cytablen;
        let abtlen, bctlen, catlen;
        let abttlen, bcttlen, cattlen;
        let n1, n0;
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
        const adx = ax - dx;
        const bdx = bx - dx;
        const cdx = cx - dx;
        const ady = ay - dy;
        const bdy = by - dy;
        const cdy = cy - dy;
        s1 = bdx * cdy;
        c = splitter * bdx;
        ahi = c - (c - bdx);
        alo = bdx - ahi;
        c = splitter * cdy;
        bhi = c - (c - cdy);
        blo = cdy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cdx * bdy;
        c = splitter * cdx;
        ahi = c - (c - cdx);
        alo = cdx - ahi;
        c = splitter * bdy;
        bhi = c - (c - bdy);
        blo = bdy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bc$1[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bc$1[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        bc$1[2] = _j - (u3 - bvirt) + (_i - bvirt);
        bc$1[3] = u3;
        s1 = cdx * ady;
        c = splitter * cdx;
        ahi = c - (c - cdx);
        alo = cdx - ahi;
        c = splitter * ady;
        bhi = c - (c - ady);
        blo = ady - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = adx * cdy;
        c = splitter * adx;
        ahi = c - (c - adx);
        alo = adx - ahi;
        c = splitter * cdy;
        bhi = c - (c - cdy);
        blo = cdy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ca$1[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ca$1[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ca$1[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ca$1[3] = u3;
        s1 = adx * bdy;
        c = splitter * adx;
        ahi = c - (c - adx);
        alo = adx - ahi;
        c = splitter * bdy;
        bhi = c - (c - bdy);
        blo = bdy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = bdx * ady;
        c = splitter * bdx;
        ahi = c - (c - bdx);
        alo = bdx - ahi;
        c = splitter * ady;
        bhi = c - (c - ady);
        blo = ady - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ab$1[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ab$1[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ab$1[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ab$1[3] = u3;
        finlen = sum(
          sum(
            sum(
              scale(scale(4, bc$1, adx, _8$1), _8$1, adx, _16$1),
              _16$1,
              scale(scale(4, bc$1, ady, _8$1), _8$1, ady, _16b),
              _16b,
              _32
            ),
            _32,
            sum(
              scale(scale(4, ca$1, bdx, _8$1), _8$1, bdx, _16$1),
              _16$1,
              scale(scale(4, ca$1, bdy, _8$1), _8$1, bdy, _16b),
              _16b,
              _32b
            ),
            _32b,
            _64
          ),
          _64,
          sum(
            scale(scale(4, ab$1, cdx, _8$1), _8$1, cdx, _16$1),
            _16$1,
            scale(scale(4, ab$1, cdy, _8$1), _8$1, cdy, _16b),
            _16b,
            _32
          ),
          _32,
          fin$1
        );
        let det = estimate(finlen, fin$1);
        let errbound = iccerrboundB * permanent;
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        bvirt = ax - adx;
        adxtail = ax - (adx + bvirt) + (bvirt - dx);
        bvirt = ay - ady;
        adytail = ay - (ady + bvirt) + (bvirt - dy);
        bvirt = bx - bdx;
        bdxtail = bx - (bdx + bvirt) + (bvirt - dx);
        bvirt = by - bdy;
        bdytail = by - (bdy + bvirt) + (bvirt - dy);
        bvirt = cx - cdx;
        cdxtail = cx - (cdx + bvirt) + (bvirt - dx);
        bvirt = cy - cdy;
        cdytail = cy - (cdy + bvirt) + (bvirt - dy);
        if (adxtail === 0 && bdxtail === 0 && cdxtail === 0 && adytail === 0 && bdytail === 0 && cdytail === 0) {
          return det;
        }
        errbound = iccerrboundC * permanent + resulterrbound * Math.abs(det);
        det += (adx * adx + ady * ady) * (bdx * cdytail + cdy * bdxtail - (bdy * cdxtail + cdx * bdytail)) + 2 * (adx * adxtail + ady * adytail) * (bdx * cdy - bdy * cdx) + ((bdx * bdx + bdy * bdy) * (cdx * adytail + ady * cdxtail - (cdy * adxtail + adx * cdytail)) + 2 * (bdx * bdxtail + bdy * bdytail) * (cdx * ady - cdy * adx)) + ((cdx * cdx + cdy * cdy) * (adx * bdytail + bdy * adxtail - (ady * bdxtail + bdx * adytail)) + 2 * (cdx * cdxtail + cdy * cdytail) * (adx * bdy - ady * bdx));
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        if (bdxtail !== 0 || bdytail !== 0 || cdxtail !== 0 || cdytail !== 0) {
          s1 = adx * adx;
          c = splitter * adx;
          ahi = c - (c - adx);
          alo = adx - ahi;
          s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
          t1 = ady * ady;
          c = splitter * ady;
          ahi = c - (c - ady);
          alo = ady - ahi;
          t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
          _i = s0 + t0;
          bvirt = _i - s0;
          aa[0] = s0 - (_i - bvirt) + (t0 - bvirt);
          _j = s1 + _i;
          bvirt = _j - s1;
          _0 = s1 - (_j - bvirt) + (_i - bvirt);
          _i = _0 + t1;
          bvirt = _i - _0;
          aa[1] = _0 - (_i - bvirt) + (t1 - bvirt);
          u3 = _j + _i;
          bvirt = u3 - _j;
          aa[2] = _j - (u3 - bvirt) + (_i - bvirt);
          aa[3] = u3;
        }
        if (cdxtail !== 0 || cdytail !== 0 || adxtail !== 0 || adytail !== 0) {
          s1 = bdx * bdx;
          c = splitter * bdx;
          ahi = c - (c - bdx);
          alo = bdx - ahi;
          s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
          t1 = bdy * bdy;
          c = splitter * bdy;
          ahi = c - (c - bdy);
          alo = bdy - ahi;
          t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
          _i = s0 + t0;
          bvirt = _i - s0;
          bb[0] = s0 - (_i - bvirt) + (t0 - bvirt);
          _j = s1 + _i;
          bvirt = _j - s1;
          _0 = s1 - (_j - bvirt) + (_i - bvirt);
          _i = _0 + t1;
          bvirt = _i - _0;
          bb[1] = _0 - (_i - bvirt) + (t1 - bvirt);
          u3 = _j + _i;
          bvirt = u3 - _j;
          bb[2] = _j - (u3 - bvirt) + (_i - bvirt);
          bb[3] = u3;
        }
        if (adxtail !== 0 || adytail !== 0 || bdxtail !== 0 || bdytail !== 0) {
          s1 = cdx * cdx;
          c = splitter * cdx;
          ahi = c - (c - cdx);
          alo = cdx - ahi;
          s0 = alo * alo - (s1 - ahi * ahi - (ahi + ahi) * alo);
          t1 = cdy * cdy;
          c = splitter * cdy;
          ahi = c - (c - cdy);
          alo = cdy - ahi;
          t0 = alo * alo - (t1 - ahi * ahi - (ahi + ahi) * alo);
          _i = s0 + t0;
          bvirt = _i - s0;
          cc[0] = s0 - (_i - bvirt) + (t0 - bvirt);
          _j = s1 + _i;
          bvirt = _j - s1;
          _0 = s1 - (_j - bvirt) + (_i - bvirt);
          _i = _0 + t1;
          bvirt = _i - _0;
          cc[1] = _0 - (_i - bvirt) + (t1 - bvirt);
          u3 = _j + _i;
          bvirt = u3 - _j;
          cc[2] = _j - (u3 - bvirt) + (_i - bvirt);
          cc[3] = u3;
        }
        if (adxtail !== 0) {
          axtbclen = scale(4, bc$1, adxtail, axtbc);
          finlen = finadd$1(finlen, sum_three(
            scale(axtbclen, axtbc, 2 * adx, _16$1),
            _16$1,
            scale(scale(4, cc, adxtail, _8$1), _8$1, bdy, _16b),
            _16b,
            scale(scale(4, bb, adxtail, _8$1), _8$1, -cdy, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (adytail !== 0) {
          aytbclen = scale(4, bc$1, adytail, aytbc);
          finlen = finadd$1(finlen, sum_three(
            scale(aytbclen, aytbc, 2 * ady, _16$1),
            _16$1,
            scale(scale(4, bb, adytail, _8$1), _8$1, cdx, _16b),
            _16b,
            scale(scale(4, cc, adytail, _8$1), _8$1, -bdx, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (bdxtail !== 0) {
          bxtcalen = scale(4, ca$1, bdxtail, bxtca);
          finlen = finadd$1(finlen, sum_three(
            scale(bxtcalen, bxtca, 2 * bdx, _16$1),
            _16$1,
            scale(scale(4, aa, bdxtail, _8$1), _8$1, cdy, _16b),
            _16b,
            scale(scale(4, cc, bdxtail, _8$1), _8$1, -ady, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (bdytail !== 0) {
          bytcalen = scale(4, ca$1, bdytail, bytca);
          finlen = finadd$1(finlen, sum_three(
            scale(bytcalen, bytca, 2 * bdy, _16$1),
            _16$1,
            scale(scale(4, cc, bdytail, _8$1), _8$1, adx, _16b),
            _16b,
            scale(scale(4, aa, bdytail, _8$1), _8$1, -cdx, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (cdxtail !== 0) {
          cxtablen = scale(4, ab$1, cdxtail, cxtab);
          finlen = finadd$1(finlen, sum_three(
            scale(cxtablen, cxtab, 2 * cdx, _16$1),
            _16$1,
            scale(scale(4, bb, cdxtail, _8$1), _8$1, ady, _16b),
            _16b,
            scale(scale(4, aa, cdxtail, _8$1), _8$1, -bdy, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (cdytail !== 0) {
          cytablen = scale(4, ab$1, cdytail, cytab);
          finlen = finadd$1(finlen, sum_three(
            scale(cytablen, cytab, 2 * cdy, _16$1),
            _16$1,
            scale(scale(4, aa, cdytail, _8$1), _8$1, bdx, _16b),
            _16b,
            scale(scale(4, bb, cdytail, _8$1), _8$1, -adx, _16c),
            _16c,
            _32,
            _48
          ), _48);
        }
        if (adxtail !== 0 || adytail !== 0) {
          if (bdxtail !== 0 || bdytail !== 0 || cdxtail !== 0 || cdytail !== 0) {
            s1 = bdxtail * cdy;
            c = splitter * bdxtail;
            ahi = c - (c - bdxtail);
            alo = bdxtail - ahi;
            c = splitter * cdy;
            bhi = c - (c - cdy);
            blo = cdy - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = bdx * cdytail;
            c = splitter * bdx;
            ahi = c - (c - bdx);
            alo = bdx - ahi;
            c = splitter * cdytail;
            bhi = c - (c - cdytail);
            blo = cdytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            u$2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            u$2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            u$2[3] = u3;
            s1 = cdxtail * -bdy;
            c = splitter * cdxtail;
            ahi = c - (c - cdxtail);
            alo = cdxtail - ahi;
            c = splitter * -bdy;
            bhi = c - (c - -bdy);
            blo = -bdy - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = cdx * -bdytail;
            c = splitter * cdx;
            ahi = c - (c - cdx);
            alo = cdx - ahi;
            c = splitter * -bdytail;
            bhi = c - (c - -bdytail);
            blo = -bdytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            v2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            v2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            v2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            v2[3] = u3;
            bctlen = sum(4, u$2, 4, v2, bct$1);
            s1 = bdxtail * cdytail;
            c = splitter * bdxtail;
            ahi = c - (c - bdxtail);
            alo = bdxtail - ahi;
            c = splitter * cdytail;
            bhi = c - (c - cdytail);
            blo = cdytail - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = cdxtail * bdytail;
            c = splitter * cdxtail;
            ahi = c - (c - cdxtail);
            alo = cdxtail - ahi;
            c = splitter * bdytail;
            bhi = c - (c - bdytail);
            blo = bdytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 - t0;
            bvirt = s0 - _i;
            bctt[0] = s0 - (_i + bvirt) + (bvirt - t0);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 - t1;
            bvirt = _0 - _i;
            bctt[1] = _0 - (_i + bvirt) + (bvirt - t1);
            u3 = _j + _i;
            bvirt = u3 - _j;
            bctt[2] = _j - (u3 - bvirt) + (_i - bvirt);
            bctt[3] = u3;
            bcttlen = 4;
          } else {
            bct$1[0] = 0;
            bctlen = 1;
            bctt[0] = 0;
            bcttlen = 1;
          }
          if (adxtail !== 0) {
            const len = scale(bctlen, bct$1, adxtail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(axtbclen, axtbc, adxtail, _16$1),
              _16$1,
              scale(len, _16c, 2 * adx, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(bcttlen, bctt, adxtail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * adx, _16$1),
              _16$1,
              scale(len2, _8$1, adxtail, _16b),
              _16b,
              scale(len, _16c, adxtail, _32),
              _32,
              _32b,
              _64
            ), _64);
            if (bdytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, cc, adxtail, _8$1), _8$1, bdytail, _16$1), _16$1);
            }
            if (cdytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, bb, -adxtail, _8$1), _8$1, cdytail, _16$1), _16$1);
            }
          }
          if (adytail !== 0) {
            const len = scale(bctlen, bct$1, adytail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(aytbclen, aytbc, adytail, _16$1),
              _16$1,
              scale(len, _16c, 2 * ady, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(bcttlen, bctt, adytail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * ady, _16$1),
              _16$1,
              scale(len2, _8$1, adytail, _16b),
              _16b,
              scale(len, _16c, adytail, _32),
              _32,
              _32b,
              _64
            ), _64);
          }
        }
        if (bdxtail !== 0 || bdytail !== 0) {
          if (cdxtail !== 0 || cdytail !== 0 || adxtail !== 0 || adytail !== 0) {
            s1 = cdxtail * ady;
            c = splitter * cdxtail;
            ahi = c - (c - cdxtail);
            alo = cdxtail - ahi;
            c = splitter * ady;
            bhi = c - (c - ady);
            blo = ady - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = cdx * adytail;
            c = splitter * cdx;
            ahi = c - (c - cdx);
            alo = cdx - ahi;
            c = splitter * adytail;
            bhi = c - (c - adytail);
            blo = adytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            u$2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            u$2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            u$2[3] = u3;
            n1 = -cdy;
            n0 = -cdytail;
            s1 = adxtail * n1;
            c = splitter * adxtail;
            ahi = c - (c - adxtail);
            alo = adxtail - ahi;
            c = splitter * n1;
            bhi = c - (c - n1);
            blo = n1 - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = adx * n0;
            c = splitter * adx;
            ahi = c - (c - adx);
            alo = adx - ahi;
            c = splitter * n0;
            bhi = c - (c - n0);
            blo = n0 - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            v2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            v2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            v2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            v2[3] = u3;
            catlen = sum(4, u$2, 4, v2, cat$1);
            s1 = cdxtail * adytail;
            c = splitter * cdxtail;
            ahi = c - (c - cdxtail);
            alo = cdxtail - ahi;
            c = splitter * adytail;
            bhi = c - (c - adytail);
            blo = adytail - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = adxtail * cdytail;
            c = splitter * adxtail;
            ahi = c - (c - adxtail);
            alo = adxtail - ahi;
            c = splitter * cdytail;
            bhi = c - (c - cdytail);
            blo = cdytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 - t0;
            bvirt = s0 - _i;
            catt[0] = s0 - (_i + bvirt) + (bvirt - t0);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 - t1;
            bvirt = _0 - _i;
            catt[1] = _0 - (_i + bvirt) + (bvirt - t1);
            u3 = _j + _i;
            bvirt = u3 - _j;
            catt[2] = _j - (u3 - bvirt) + (_i - bvirt);
            catt[3] = u3;
            cattlen = 4;
          } else {
            cat$1[0] = 0;
            catlen = 1;
            catt[0] = 0;
            cattlen = 1;
          }
          if (bdxtail !== 0) {
            const len = scale(catlen, cat$1, bdxtail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(bxtcalen, bxtca, bdxtail, _16$1),
              _16$1,
              scale(len, _16c, 2 * bdx, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(cattlen, catt, bdxtail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * bdx, _16$1),
              _16$1,
              scale(len2, _8$1, bdxtail, _16b),
              _16b,
              scale(len, _16c, bdxtail, _32),
              _32,
              _32b,
              _64
            ), _64);
            if (cdytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, aa, bdxtail, _8$1), _8$1, cdytail, _16$1), _16$1);
            }
            if (adytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, cc, -bdxtail, _8$1), _8$1, adytail, _16$1), _16$1);
            }
          }
          if (bdytail !== 0) {
            const len = scale(catlen, cat$1, bdytail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(bytcalen, bytca, bdytail, _16$1),
              _16$1,
              scale(len, _16c, 2 * bdy, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(cattlen, catt, bdytail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * bdy, _16$1),
              _16$1,
              scale(len2, _8$1, bdytail, _16b),
              _16b,
              scale(len, _16c, bdytail, _32),
              _32,
              _32b,
              _64
            ), _64);
          }
        }
        if (cdxtail !== 0 || cdytail !== 0) {
          if (adxtail !== 0 || adytail !== 0 || bdxtail !== 0 || bdytail !== 0) {
            s1 = adxtail * bdy;
            c = splitter * adxtail;
            ahi = c - (c - adxtail);
            alo = adxtail - ahi;
            c = splitter * bdy;
            bhi = c - (c - bdy);
            blo = bdy - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = adx * bdytail;
            c = splitter * adx;
            ahi = c - (c - adx);
            alo = adx - ahi;
            c = splitter * bdytail;
            bhi = c - (c - bdytail);
            blo = bdytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            u$2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            u$2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            u$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            u$2[3] = u3;
            n1 = -ady;
            n0 = -adytail;
            s1 = bdxtail * n1;
            c = splitter * bdxtail;
            ahi = c - (c - bdxtail);
            alo = bdxtail - ahi;
            c = splitter * n1;
            bhi = c - (c - n1);
            blo = n1 - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = bdx * n0;
            c = splitter * bdx;
            ahi = c - (c - bdx);
            alo = bdx - ahi;
            c = splitter * n0;
            bhi = c - (c - n0);
            blo = n0 - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 + t0;
            bvirt = _i - s0;
            v2[0] = s0 - (_i - bvirt) + (t0 - bvirt);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 + t1;
            bvirt = _i - _0;
            v2[1] = _0 - (_i - bvirt) + (t1 - bvirt);
            u3 = _j + _i;
            bvirt = u3 - _j;
            v2[2] = _j - (u3 - bvirt) + (_i - bvirt);
            v2[3] = u3;
            abtlen = sum(4, u$2, 4, v2, abt$1);
            s1 = adxtail * bdytail;
            c = splitter * adxtail;
            ahi = c - (c - adxtail);
            alo = adxtail - ahi;
            c = splitter * bdytail;
            bhi = c - (c - bdytail);
            blo = bdytail - bhi;
            s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
            t1 = bdxtail * adytail;
            c = splitter * bdxtail;
            ahi = c - (c - bdxtail);
            alo = bdxtail - ahi;
            c = splitter * adytail;
            bhi = c - (c - adytail);
            blo = adytail - bhi;
            t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
            _i = s0 - t0;
            bvirt = s0 - _i;
            abtt[0] = s0 - (_i + bvirt) + (bvirt - t0);
            _j = s1 + _i;
            bvirt = _j - s1;
            _0 = s1 - (_j - bvirt) + (_i - bvirt);
            _i = _0 - t1;
            bvirt = _0 - _i;
            abtt[1] = _0 - (_i + bvirt) + (bvirt - t1);
            u3 = _j + _i;
            bvirt = u3 - _j;
            abtt[2] = _j - (u3 - bvirt) + (_i - bvirt);
            abtt[3] = u3;
            abttlen = 4;
          } else {
            abt$1[0] = 0;
            abtlen = 1;
            abtt[0] = 0;
            abttlen = 1;
          }
          if (cdxtail !== 0) {
            const len = scale(abtlen, abt$1, cdxtail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(cxtablen, cxtab, cdxtail, _16$1),
              _16$1,
              scale(len, _16c, 2 * cdx, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(abttlen, abtt, cdxtail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * cdx, _16$1),
              _16$1,
              scale(len2, _8$1, cdxtail, _16b),
              _16b,
              scale(len, _16c, cdxtail, _32),
              _32,
              _32b,
              _64
            ), _64);
            if (adytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, bb, cdxtail, _8$1), _8$1, adytail, _16$1), _16$1);
            }
            if (bdytail !== 0) {
              finlen = finadd$1(finlen, scale(scale(4, aa, -cdxtail, _8$1), _8$1, bdytail, _16$1), _16$1);
            }
          }
          if (cdytail !== 0) {
            const len = scale(abtlen, abt$1, cdytail, _16c);
            finlen = finadd$1(finlen, sum(
              scale(cytablen, cytab, cdytail, _16$1),
              _16$1,
              scale(len, _16c, 2 * cdy, _32),
              _32,
              _48
            ), _48);
            const len2 = scale(abttlen, abtt, cdytail, _8$1);
            finlen = finadd$1(finlen, sum_three(
              scale(len2, _8$1, 2 * cdy, _16$1),
              _16$1,
              scale(len2, _8$1, cdytail, _16b),
              _16b,
              scale(len, _16c, cdytail, _32),
              _32,
              _32b,
              _64
            ), _64);
          }
        }
        return fin$1[finlen - 1];
      }
      function incircle(ax, ay, bx, by, cx, cy, dx, dy) {
        const adx = ax - dx;
        const bdx = bx - dx;
        const cdx = cx - dx;
        const ady = ay - dy;
        const bdy = by - dy;
        const cdy = cy - dy;
        const bdxcdy = bdx * cdy;
        const cdxbdy = cdx * bdy;
        const alift = adx * adx + ady * ady;
        const cdxady = cdx * ady;
        const adxcdy = adx * cdy;
        const blift = bdx * bdx + bdy * bdy;
        const adxbdy = adx * bdy;
        const bdxady = bdx * ady;
        const clift = cdx * cdx + cdy * cdy;
        const det = alift * (bdxcdy - cdxbdy) + blift * (cdxady - adxcdy) + clift * (adxbdy - bdxady);
        const permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * alift + (Math.abs(cdxady) + Math.abs(adxcdy)) * blift + (Math.abs(adxbdy) + Math.abs(bdxady)) * clift;
        const errbound = iccerrboundA * permanent;
        if (det > errbound || -det > errbound) {
          return det;
        }
        return incircleadapt(ax, ay, bx, by, cx, cy, dx, dy, permanent);
      }
      function incirclefast(ax, ay, bx, by, cx, cy, dx, dy) {
        const adx = ax - dx;
        const ady = ay - dy;
        const bdx = bx - dx;
        const bdy = by - dy;
        const cdx = cx - dx;
        const cdy = cy - dy;
        const abdet2 = adx * bdy - bdx * ady;
        const bcdet = bdx * cdy - cdx * bdy;
        const cadet = cdx * ady - adx * cdy;
        const alift = adx * adx + ady * ady;
        const blift = bdx * bdx + bdy * bdy;
        const clift = cdx * cdx + cdy * cdy;
        return alift * bcdet + blift * cadet + clift * abdet2;
      }
      const isperrboundA = (16 + 224 * epsilon) * epsilon;
      const isperrboundB = (5 + 72 * epsilon) * epsilon;
      const isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
      const ab$2 = vec(4);
      const bc$2 = vec(4);
      const cd = vec(4);
      const de = vec(4);
      const ea = vec(4);
      const ac = vec(4);
      const bd = vec(4);
      const ce = vec(4);
      const da = vec(4);
      const eb = vec(4);
      const abc = vec(24);
      const bcd = vec(24);
      const cde = vec(24);
      const dea = vec(24);
      const eab = vec(24);
      const abd = vec(24);
      const bce = vec(24);
      const cda = vec(24);
      const deb = vec(24);
      const eac = vec(24);
      const adet = vec(1152);
      const bdet = vec(1152);
      const cdet = vec(1152);
      const ddet = vec(1152);
      const edet = vec(1152);
      const abdet = vec(2304);
      const cddet = vec(2304);
      const cdedet = vec(3456);
      const deter = vec(5760);
      const _8$2 = vec(8);
      const _8b$1 = vec(8);
      const _8c = vec(8);
      const _16$2 = vec(16);
      const _24 = vec(24);
      const _48$1 = vec(48);
      const _48b = vec(48);
      const _96 = vec(96);
      const _192 = vec(192);
      const _384x = vec(384);
      const _384y = vec(384);
      const _384z = vec(384);
      const _768 = vec(768);
      function sum_three_scale(a, b2, c, az, bz, cz, out) {
        return sum_three(
          scale(4, a, az, _8$2),
          _8$2,
          scale(4, b2, bz, _8b$1),
          _8b$1,
          scale(4, c, cz, _8c),
          _8c,
          _16$2,
          out
        );
      }
      function liftexact(alen, a, blen, b2, clen, c, dlen, d, x2, y2, z2, out) {
        const len = sum(
          sum(alen, a, blen, b2, _48$1),
          _48$1,
          negate(sum(clen, c, dlen, d, _48b), _48b),
          _48b,
          _96
        );
        return sum_three(
          scale(scale(len, _96, x2, _192), _192, x2, _384x),
          _384x,
          scale(scale(len, _96, y2, _192), _192, y2, _384y),
          _384y,
          scale(scale(len, _96, z2, _192), _192, z2, _384z),
          _384z,
          _768,
          out
        );
      }
      function insphereexact(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez) {
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u3;
        s1 = ax * by;
        c = splitter * ax;
        ahi = c - (c - ax);
        alo = ax - ahi;
        c = splitter * by;
        bhi = c - (c - by);
        blo = by - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = bx * ay;
        c = splitter * bx;
        ahi = c - (c - bx);
        alo = bx - ahi;
        c = splitter * ay;
        bhi = c - (c - ay);
        blo = ay - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ab$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ab$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ab$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ab$2[3] = u3;
        s1 = bx * cy;
        c = splitter * bx;
        ahi = c - (c - bx);
        alo = bx - ahi;
        c = splitter * cy;
        bhi = c - (c - cy);
        blo = cy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cx * by;
        c = splitter * cx;
        ahi = c - (c - cx);
        alo = cx - ahi;
        c = splitter * by;
        bhi = c - (c - by);
        blo = by - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bc$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bc$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        bc$2[2] = _j - (u3 - bvirt) + (_i - bvirt);
        bc$2[3] = u3;
        s1 = cx * dy;
        c = splitter * cx;
        ahi = c - (c - cx);
        alo = cx - ahi;
        c = splitter * dy;
        bhi = c - (c - dy);
        blo = dy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = dx * cy;
        c = splitter * dx;
        ahi = c - (c - dx);
        alo = dx - ahi;
        c = splitter * cy;
        bhi = c - (c - cy);
        blo = cy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        cd[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        cd[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        cd[2] = _j - (u3 - bvirt) + (_i - bvirt);
        cd[3] = u3;
        s1 = dx * ey;
        c = splitter * dx;
        ahi = c - (c - dx);
        alo = dx - ahi;
        c = splitter * ey;
        bhi = c - (c - ey);
        blo = ey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = ex * dy;
        c = splitter * ex;
        ahi = c - (c - ex);
        alo = ex - ahi;
        c = splitter * dy;
        bhi = c - (c - dy);
        blo = dy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        de[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        de[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        de[2] = _j - (u3 - bvirt) + (_i - bvirt);
        de[3] = u3;
        s1 = ex * ay;
        c = splitter * ex;
        ahi = c - (c - ex);
        alo = ex - ahi;
        c = splitter * ay;
        bhi = c - (c - ay);
        blo = ay - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = ax * ey;
        c = splitter * ax;
        ahi = c - (c - ax);
        alo = ax - ahi;
        c = splitter * ey;
        bhi = c - (c - ey);
        blo = ey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ea[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ea[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ea[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ea[3] = u3;
        s1 = ax * cy;
        c = splitter * ax;
        ahi = c - (c - ax);
        alo = ax - ahi;
        c = splitter * cy;
        bhi = c - (c - cy);
        blo = cy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cx * ay;
        c = splitter * cx;
        ahi = c - (c - cx);
        alo = cx - ahi;
        c = splitter * ay;
        bhi = c - (c - ay);
        blo = ay - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ac[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ac[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ac[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ac[3] = u3;
        s1 = bx * dy;
        c = splitter * bx;
        ahi = c - (c - bx);
        alo = bx - ahi;
        c = splitter * dy;
        bhi = c - (c - dy);
        blo = dy - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = dx * by;
        c = splitter * dx;
        ahi = c - (c - dx);
        alo = dx - ahi;
        c = splitter * by;
        bhi = c - (c - by);
        blo = by - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bd[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bd[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        bd[2] = _j - (u3 - bvirt) + (_i - bvirt);
        bd[3] = u3;
        s1 = cx * ey;
        c = splitter * cx;
        ahi = c - (c - cx);
        alo = cx - ahi;
        c = splitter * ey;
        bhi = c - (c - ey);
        blo = ey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = ex * cy;
        c = splitter * ex;
        ahi = c - (c - ex);
        alo = ex - ahi;
        c = splitter * cy;
        bhi = c - (c - cy);
        blo = cy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ce[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ce[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        ce[2] = _j - (u3 - bvirt) + (_i - bvirt);
        ce[3] = u3;
        s1 = dx * ay;
        c = splitter * dx;
        ahi = c - (c - dx);
        alo = dx - ahi;
        c = splitter * ay;
        bhi = c - (c - ay);
        blo = ay - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = ax * dy;
        c = splitter * ax;
        ahi = c - (c - ax);
        alo = ax - ahi;
        c = splitter * dy;
        bhi = c - (c - dy);
        blo = dy - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        da[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        da[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        da[2] = _j - (u3 - bvirt) + (_i - bvirt);
        da[3] = u3;
        s1 = ex * by;
        c = splitter * ex;
        ahi = c - (c - ex);
        alo = ex - ahi;
        c = splitter * by;
        bhi = c - (c - by);
        blo = by - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = bx * ey;
        c = splitter * bx;
        ahi = c - (c - bx);
        alo = bx - ahi;
        c = splitter * ey;
        bhi = c - (c - ey);
        blo = ey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        eb[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        eb[1] = _0 - (_i + bvirt) + (bvirt - t1);
        u3 = _j + _i;
        bvirt = u3 - _j;
        eb[2] = _j - (u3 - bvirt) + (_i - bvirt);
        eb[3] = u3;
        const abclen = sum_three_scale(ab$2, bc$2, ac, cz, az, -bz, abc);
        const bcdlen = sum_three_scale(bc$2, cd, bd, dz, bz, -cz, bcd);
        const cdelen = sum_three_scale(cd, de, ce, ez, cz, -dz, cde);
        const dealen = sum_three_scale(de, ea, da, az, dz, -ez, dea);
        const eablen = sum_three_scale(ea, ab$2, eb, bz, ez, -az, eab);
        const abdlen = sum_three_scale(ab$2, bd, da, dz, az, bz, abd);
        const bcelen = sum_three_scale(bc$2, ce, eb, ez, bz, cz, bce);
        const cdalen = sum_three_scale(cd, da, ac, az, cz, dz, cda);
        const deblen = sum_three_scale(de, eb, bd, bz, dz, ez, deb);
        const eaclen = sum_three_scale(ea, ac, ce, cz, ez, az, eac);
        const deterlen = sum_three(
          liftexact(cdelen, cde, bcelen, bce, deblen, deb, bcdlen, bcd, ax, ay, az, adet),
          adet,
          liftexact(dealen, dea, cdalen, cda, eaclen, eac, cdelen, cde, bx, by, bz, bdet),
          bdet,
          sum_three(
            liftexact(eablen, eab, deblen, deb, abdlen, abd, dealen, dea, cx, cy, cz, cdet),
            cdet,
            liftexact(abclen, abc, eaclen, eac, bcelen, bce, eablen, eab, dx, dy, dz, ddet),
            ddet,
            liftexact(bcdlen, bcd, abdlen, abd, cdalen, cda, abclen, abc, ex, ey, ez, edet),
            edet,
            cddet,
            cdedet
          ),
          cdedet,
          abdet,
          deter
        );
        return deter[deterlen - 1];
      }
      const xdet = vec(96);
      const ydet = vec(96);
      const zdet = vec(96);
      const fin$2 = vec(1152);
      function liftadapt(a, b2, c, az, bz, cz, x2, y2, z2, out) {
        const len = sum_three_scale(a, b2, c, az, bz, cz, _24);
        return sum_three(
          scale(scale(len, _24, x2, _48$1), _48$1, x2, xdet),
          xdet,
          scale(scale(len, _24, y2, _48$1), _48$1, y2, ydet),
          ydet,
          scale(scale(len, _24, z2, _48$1), _48$1, z2, zdet),
          zdet,
          _192,
          out
        );
      }
      function insphereadapt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez, permanent) {
        let ab3, bc3, cd3, da3, ac3, bd3;
        let aextail, bextail, cextail, dextail;
        let aeytail, beytail, ceytail, deytail;
        let aeztail, beztail, ceztail, deztail;
        let bvirt, c, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0;
        const aex = ax - ex;
        const bex = bx - ex;
        const cex = cx - ex;
        const dex = dx - ex;
        const aey = ay - ey;
        const bey = by - ey;
        const cey = cy - ey;
        const dey = dy - ey;
        const aez = az - ez;
        const bez = bz - ez;
        const cez = cz - ez;
        const dez = dz - ez;
        s1 = aex * bey;
        c = splitter * aex;
        ahi = c - (c - aex);
        alo = aex - ahi;
        c = splitter * bey;
        bhi = c - (c - bey);
        blo = bey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = bex * aey;
        c = splitter * bex;
        ahi = c - (c - bex);
        alo = bex - ahi;
        c = splitter * aey;
        bhi = c - (c - aey);
        blo = aey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ab$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ab$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
        ab3 = _j + _i;
        bvirt = ab3 - _j;
        ab$2[2] = _j - (ab3 - bvirt) + (_i - bvirt);
        ab$2[3] = ab3;
        s1 = bex * cey;
        c = splitter * bex;
        ahi = c - (c - bex);
        alo = bex - ahi;
        c = splitter * cey;
        bhi = c - (c - cey);
        blo = cey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cex * bey;
        c = splitter * cex;
        ahi = c - (c - cex);
        alo = cex - ahi;
        c = splitter * bey;
        bhi = c - (c - bey);
        blo = bey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bc$2[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bc$2[1] = _0 - (_i + bvirt) + (bvirt - t1);
        bc3 = _j + _i;
        bvirt = bc3 - _j;
        bc$2[2] = _j - (bc3 - bvirt) + (_i - bvirt);
        bc$2[3] = bc3;
        s1 = cex * dey;
        c = splitter * cex;
        ahi = c - (c - cex);
        alo = cex - ahi;
        c = splitter * dey;
        bhi = c - (c - dey);
        blo = dey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = dex * cey;
        c = splitter * dex;
        ahi = c - (c - dex);
        alo = dex - ahi;
        c = splitter * cey;
        bhi = c - (c - cey);
        blo = cey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        cd[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        cd[1] = _0 - (_i + bvirt) + (bvirt - t1);
        cd3 = _j + _i;
        bvirt = cd3 - _j;
        cd[2] = _j - (cd3 - bvirt) + (_i - bvirt);
        cd[3] = cd3;
        s1 = dex * aey;
        c = splitter * dex;
        ahi = c - (c - dex);
        alo = dex - ahi;
        c = splitter * aey;
        bhi = c - (c - aey);
        blo = aey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = aex * dey;
        c = splitter * aex;
        ahi = c - (c - aex);
        alo = aex - ahi;
        c = splitter * dey;
        bhi = c - (c - dey);
        blo = dey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        da[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        da[1] = _0 - (_i + bvirt) + (bvirt - t1);
        da3 = _j + _i;
        bvirt = da3 - _j;
        da[2] = _j - (da3 - bvirt) + (_i - bvirt);
        da[3] = da3;
        s1 = aex * cey;
        c = splitter * aex;
        ahi = c - (c - aex);
        alo = aex - ahi;
        c = splitter * cey;
        bhi = c - (c - cey);
        blo = cey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = cex * aey;
        c = splitter * cex;
        ahi = c - (c - cex);
        alo = cex - ahi;
        c = splitter * aey;
        bhi = c - (c - aey);
        blo = aey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        ac[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        ac[1] = _0 - (_i + bvirt) + (bvirt - t1);
        ac3 = _j + _i;
        bvirt = ac3 - _j;
        ac[2] = _j - (ac3 - bvirt) + (_i - bvirt);
        ac[3] = ac3;
        s1 = bex * dey;
        c = splitter * bex;
        ahi = c - (c - bex);
        alo = bex - ahi;
        c = splitter * dey;
        bhi = c - (c - dey);
        blo = dey - bhi;
        s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
        t1 = dex * bey;
        c = splitter * dex;
        ahi = c - (c - dex);
        alo = dex - ahi;
        c = splitter * bey;
        bhi = c - (c - bey);
        blo = bey - bhi;
        t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
        _i = s0 - t0;
        bvirt = s0 - _i;
        bd[0] = s0 - (_i + bvirt) + (bvirt - t0);
        _j = s1 + _i;
        bvirt = _j - s1;
        _0 = s1 - (_j - bvirt) + (_i - bvirt);
        _i = _0 - t1;
        bvirt = _0 - _i;
        bd[1] = _0 - (_i + bvirt) + (bvirt - t1);
        bd3 = _j + _i;
        bvirt = bd3 - _j;
        bd[2] = _j - (bd3 - bvirt) + (_i - bvirt);
        bd[3] = bd3;
        const finlen = sum(
          sum(
            negate(liftadapt(bc$2, cd, bd, dez, bez, -cez, aex, aey, aez, adet), adet),
            adet,
            liftadapt(cd, da, ac, aez, cez, dez, bex, bey, bez, bdet),
            bdet,
            abdet
          ),
          abdet,
          sum(
            negate(liftadapt(da, ab$2, bd, bez, dez, aez, cex, cey, cez, cdet), cdet),
            cdet,
            liftadapt(ab$2, bc$2, ac, cez, aez, -bez, dex, dey, dez, ddet),
            ddet,
            cddet
          ),
          cddet,
          fin$2
        );
        let det = estimate(finlen, fin$2);
        let errbound = isperrboundB * permanent;
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        bvirt = ax - aex;
        aextail = ax - (aex + bvirt) + (bvirt - ex);
        bvirt = ay - aey;
        aeytail = ay - (aey + bvirt) + (bvirt - ey);
        bvirt = az - aez;
        aeztail = az - (aez + bvirt) + (bvirt - ez);
        bvirt = bx - bex;
        bextail = bx - (bex + bvirt) + (bvirt - ex);
        bvirt = by - bey;
        beytail = by - (bey + bvirt) + (bvirt - ey);
        bvirt = bz - bez;
        beztail = bz - (bez + bvirt) + (bvirt - ez);
        bvirt = cx - cex;
        cextail = cx - (cex + bvirt) + (bvirt - ex);
        bvirt = cy - cey;
        ceytail = cy - (cey + bvirt) + (bvirt - ey);
        bvirt = cz - cez;
        ceztail = cz - (cez + bvirt) + (bvirt - ez);
        bvirt = dx - dex;
        dextail = dx - (dex + bvirt) + (bvirt - ex);
        bvirt = dy - dey;
        deytail = dy - (dey + bvirt) + (bvirt - ey);
        bvirt = dz - dez;
        deztail = dz - (dez + bvirt) + (bvirt - ez);
        if (aextail === 0 && aeytail === 0 && aeztail === 0 && bextail === 0 && beytail === 0 && beztail === 0 && cextail === 0 && ceytail === 0 && ceztail === 0 && dextail === 0 && deytail === 0 && deztail === 0) {
          return det;
        }
        errbound = isperrboundC * permanent + resulterrbound * Math.abs(det);
        const abeps = aex * beytail + bey * aextail - (aey * bextail + bex * aeytail);
        const bceps = bex * ceytail + cey * bextail - (bey * cextail + cex * beytail);
        const cdeps = cex * deytail + dey * cextail - (cey * dextail + dex * ceytail);
        const daeps = dex * aeytail + aey * dextail - (dey * aextail + aex * deytail);
        const aceps = aex * ceytail + cey * aextail - (aey * cextail + cex * aeytail);
        const bdeps = bex * deytail + dey * bextail - (bey * dextail + dex * beytail);
        det += (bex * bex + bey * bey + bez * bez) * (cez * daeps + dez * aceps + aez * cdeps + (ceztail * da3 + deztail * ac3 + aeztail * cd3)) + (dex * dex + dey * dey + dez * dez) * (aez * bceps - bez * aceps + cez * abeps + (aeztail * bc3 - beztail * ac3 + ceztail * ab3)) - ((aex * aex + aey * aey + aez * aez) * (bez * cdeps - cez * bdeps + dez * bceps + (beztail * cd3 - ceztail * bd3 + deztail * bc3)) + (cex * cex + cey * cey + cez * cez) * (dez * abeps + aez * bdeps + bez * daeps + (deztail * ab3 + aeztail * bd3 + beztail * da3))) + 2 * ((bex * bextail + bey * beytail + bez * beztail) * (cez * da3 + dez * ac3 + aez * cd3) + (dex * dextail + dey * deytail + dez * deztail) * (aez * bc3 - bez * ac3 + cez * ab3) - ((aex * aextail + aey * aeytail + aez * aeztail) * (bez * cd3 - cez * bd3 + dez * bc3) + (cex * cextail + cey * ceytail + cez * ceztail) * (dez * ab3 + aez * bd3 + bez * da3)));
        if (det >= errbound || -det >= errbound) {
          return det;
        }
        return insphereexact(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez);
      }
      function insphere(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez) {
        const aex = ax - ex;
        const bex = bx - ex;
        const cex = cx - ex;
        const dex = dx - ex;
        const aey = ay - ey;
        const bey = by - ey;
        const cey = cy - ey;
        const dey = dy - ey;
        const aez = az - ez;
        const bez = bz - ez;
        const cez = cz - ez;
        const dez = dz - ez;
        const aexbey = aex * bey;
        const bexaey = bex * aey;
        const ab2 = aexbey - bexaey;
        const bexcey = bex * cey;
        const cexbey = cex * bey;
        const bc2 = bexcey - cexbey;
        const cexdey = cex * dey;
        const dexcey = dex * cey;
        const cd2 = cexdey - dexcey;
        const dexaey = dex * aey;
        const aexdey = aex * dey;
        const da2 = dexaey - aexdey;
        const aexcey = aex * cey;
        const cexaey = cex * aey;
        const ac2 = aexcey - cexaey;
        const bexdey = bex * dey;
        const dexbey = dex * bey;
        const bd2 = bexdey - dexbey;
        const abc2 = aez * bc2 - bez * ac2 + cez * ab2;
        const bcd2 = bez * cd2 - cez * bd2 + dez * bc2;
        const cda2 = cez * da2 + dez * ac2 + aez * cd2;
        const dab = dez * ab2 + aez * bd2 + bez * da2;
        const alift = aex * aex + aey * aey + aez * aez;
        const blift = bex * bex + bey * bey + bez * bez;
        const clift = cex * cex + cey * cey + cez * cez;
        const dlift = dex * dex + dey * dey + dez * dez;
        const det = clift * dab - dlift * abc2 + (alift * bcd2 - blift * cda2);
        const aezplus = Math.abs(aez);
        const bezplus = Math.abs(bez);
        const cezplus = Math.abs(cez);
        const dezplus = Math.abs(dez);
        const aexbeyplus = Math.abs(aexbey);
        const bexaeyplus = Math.abs(bexaey);
        const bexceyplus = Math.abs(bexcey);
        const cexbeyplus = Math.abs(cexbey);
        const cexdeyplus = Math.abs(cexdey);
        const dexceyplus = Math.abs(dexcey);
        const dexaeyplus = Math.abs(dexaey);
        const aexdeyplus = Math.abs(aexdey);
        const aexceyplus = Math.abs(aexcey);
        const cexaeyplus = Math.abs(cexaey);
        const bexdeyplus = Math.abs(bexdey);
        const dexbeyplus = Math.abs(dexbey);
        const permanent = ((cexdeyplus + dexceyplus) * bezplus + (dexbeyplus + bexdeyplus) * cezplus + (bexceyplus + cexbeyplus) * dezplus) * alift + ((dexaeyplus + aexdeyplus) * cezplus + (aexceyplus + cexaeyplus) * dezplus + (cexdeyplus + dexceyplus) * aezplus) * blift + ((aexbeyplus + bexaeyplus) * dezplus + (bexdeyplus + dexbeyplus) * aezplus + (dexaeyplus + aexdeyplus) * bezplus) * clift + ((bexceyplus + cexbeyplus) * aezplus + (cexaeyplus + aexceyplus) * bezplus + (aexbeyplus + bexaeyplus) * cezplus) * dlift;
        const errbound = isperrboundA * permanent;
        if (det > errbound || -det > errbound) {
          return det;
        }
        return -insphereadapt(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, ex, ey, ez, permanent);
      }
      function inspherefast(pax, pay, paz, pbx, pby, pbz, pcx, pcy, pcz, pdx, pdy, pdz, pex, pey, pez) {
        const aex = pax - pex;
        const bex = pbx - pex;
        const cex = pcx - pex;
        const dex = pdx - pex;
        const aey = pay - pey;
        const bey = pby - pey;
        const cey = pcy - pey;
        const dey = pdy - pey;
        const aez = paz - pez;
        const bez = pbz - pez;
        const cez = pcz - pez;
        const dez = pdz - pez;
        const ab2 = aex * bey - bex * aey;
        const bc2 = bex * cey - cex * bey;
        const cd2 = cex * dey - dex * cey;
        const da2 = dex * aey - aex * dey;
        const ac2 = aex * cey - cex * aey;
        const bd2 = bex * dey - dex * bey;
        const abc2 = aez * bc2 - bez * ac2 + cez * ab2;
        const bcd2 = bez * cd2 - cez * bd2 + dez * bc2;
        const cda2 = cez * da2 + dez * ac2 + aez * cd2;
        const dab = dez * ab2 + aez * bd2 + bez * da2;
        const alift = aex * aex + aey * aey + aez * aez;
        const blift = bex * bex + bey * bey + bez * bez;
        const clift = cex * cex + cey * cey + cez * cez;
        const dlift = dex * dex + dey * dey + dez * dez;
        return clift * dab - dlift * abc2 + (alift * bcd2 - blift * cda2);
      }
      exports2.incircle = incircle;
      exports2.incirclefast = incirclefast;
      exports2.insphere = insphere;
      exports2.inspherefast = inspherefast;
      exports2.orient2d = orient2d;
      exports2.orient2dfast = orient2dfast;
      exports2.orient3d = orient3d;
      exports2.orient3dfast = orient3dfast;
      Object.defineProperty(exports2, "__esModule", { value: true });
    });
  }
});

// routeprofit-pro/node_modules/martinez-polygon-clipping/dist/martinez.js
var import_splaytree = __toESM(require_splay(), 1);
var import_robust_predicates = __toESM(require_predicates(), 1);

// routeprofit-pro/node_modules/tinyqueue/index.js
var TinyQueue = class {
  constructor(data = [], compare = (a, b2) => a < b2 ? -1 : a > b2 ? 1 : 0) {
    this.data = data;
    this.length = this.data.length;
    this.compare = compare;
    if (this.length > 0) {
      for (let i = (this.length >> 1) - 1; i >= 0; i--) this._down(i);
    }
  }
  push(item) {
    this.data.push(item);
    this._up(this.length++);
  }
  pop() {
    if (this.length === 0) return void 0;
    const top = this.data[0];
    const bottom = this.data.pop();
    if (--this.length > 0) {
      this.data[0] = bottom;
      this._down(0);
    }
    return top;
  }
  peek() {
    return this.data[0];
  }
  _up(pos) {
    const { data, compare } = this;
    const item = data[pos];
    while (pos > 0) {
      const parent = pos - 1 >> 1;
      const current = data[parent];
      if (compare(item, current) >= 0) break;
      data[pos] = current;
      pos = parent;
    }
    data[pos] = item;
  }
  _down(pos) {
    const { data, compare } = this;
    const halfLength = this.length >> 1;
    const item = data[pos];
    while (pos < halfLength) {
      let bestChild = (pos << 1) + 1;
      const right = bestChild + 1;
      if (right < this.length && compare(data[right], data[bestChild]) < 0) {
        bestChild = right;
      }
      if (compare(data[bestChild], item) >= 0) break;
      data[pos] = data[bestChild];
      pos = bestChild;
    }
    data[pos] = item;
  }
};

// routeprofit-pro/node_modules/martinez-polygon-clipping/dist/martinez.js
var U = 0;
var _ = 1;
var z = 2;
var G = 3;
var R = 0;
var y = 1;
var g = 2;
var T = 3;
function P(n, t, e) {
  t === null ? (n.inOut = false, n.otherInOut = true) : (n.isSubject === t.isSubject ? (n.inOut = !t.inOut, n.otherInOut = t.otherInOut) : (n.inOut = !t.otherInOut, n.otherInOut = t.isVertical() ? !t.inOut : t.inOut), t && (n.prevInResult = !F(t, e) || t.isVertical() ? t.prevInResult : t)), F(n, e) ? n.resultTransition = J(n, e) : n.resultTransition = 0;
}
function F(n, t) {
  switch (n.type) {
    case U:
      switch (t) {
        case R:
          return !n.otherInOut;
        case y:
          return n.otherInOut;
        case g:
          return n.isSubject && n.otherInOut || !n.isSubject && !n.otherInOut;
        case T:
          return true;
      }
      break;
    case z:
      return t === R || t === y;
    case G:
      return t === g;
    case _:
      return false;
  }
  return false;
}
function J(n, t) {
  let e = !n.inOut, i = !n.otherInOut, o;
  switch (t) {
    case R:
      o = e && i;
      break;
    case y:
      o = e || i;
      break;
    case T:
      o = e !== i;
      break;
    case g:
      n.isSubject ? o = e && !i : o = i && !e;
      break;
  }
  return o ? 1 : -1;
}
var S = class _S {
  /**
   * Sweepline event
   *
   * @class {SweepEvent}
   * @param {Position}        point
   * @param {boolean}         left
   * @param {SweepEvent=}     otherEvent
   * @param {boolean}         isSubject
   * @param {EdgeType}        edgeType
   */
  constructor(t, e, i, o, r) {
    this.left = e, this.point = t, this.otherEvent = i, this.isSubject = o ?? false, this.type = r || U, this.inOut = false, this.otherInOut = false, this.prevInResult = null, this.resultTransition = 0, this.otherPos = -1, this.outputContourId = -1, this.isExteriorRing = true;
  }
  /**
   * @param  {Position}  p
   * @return {boolean}
   */
  isBelow(t) {
    const e = this.point, i = this.otherEvent.point;
    return this.left ? (e[0] - t[0]) * (i[1] - t[1]) - (i[0] - t[0]) * (e[1] - t[1]) > 0 : (i[0] - t[0]) * (e[1] - t[1]) - (e[0] - t[0]) * (i[1] - t[1]) > 0;
  }
  /**
   * @param  {Position}  p
   * @return {boolean}
   */
  isAbove(t) {
    return !this.isBelow(t);
  }
  /**
   * @return {boolean}
   */
  isVertical() {
    return this.point[0] === this.otherEvent.point[0];
  }
  /**
   * Does event belong to result?
   * @return {boolean}
   */
  get inResult() {
    return this.resultTransition !== 0;
  }
  clone() {
    const t = new _S(
      this.point,
      this.left,
      this.otherEvent,
      this.isSubject,
      this.type
    );
    return t.contourId = this.contourId, t.resultTransition = this.resultTransition, t.prevInResult = this.prevInResult, t.isExteriorRing = this.isExteriorRing, t.inOut = this.inOut, t.otherInOut = this.otherInOut, t;
  }
};
function v(n, t) {
  return n[0] === t[0] ? n[1] === t[1] : false;
}
function A(n, t, e) {
  const i = (0, import_robust_predicates.orient2d)(n[0], n[1], t[0], t[1], e[0], e[1]);
  return i > 0 ? -1 : i < 0 ? 1 : 0;
}
function w(n, t) {
  const e = n.point, i = t.point;
  return e[0] > i[0] ? 1 : e[0] < i[0] ? -1 : e[1] !== i[1] ? e[1] > i[1] ? 1 : -1 : W(n, t, e);
}
function W(n, t, e, i) {
  return n.left !== t.left ? n.left ? 1 : -1 : A(e, n.otherEvent.point, t.otherEvent.point) !== 0 ? n.isBelow(t.otherEvent.point) ? -1 : 1 : !n.isSubject && t.isSubject ? 1 : -1;
}
function m(n, t, e) {
  const i = new S(t, false, n, n.isSubject), o = new S(t, true, n.otherEvent, n.isSubject);
  return v(n.point, n.otherEvent.point) && console.warn("what is that, a collapsed segment?", n), i.contourId = o.contourId = n.contourId, w(o, n.otherEvent) > 0 && (n.otherEvent.left = true, o.left = false), n.otherEvent.otherEvent = o, n.otherEvent = i, e.push(o), e.push(i), e;
}
function k(n, t) {
  return n[0] * t[1] - n[1] * t[0];
}
function M(n, t) {
  return n[0] * t[0] + n[1] * t[1];
}
function Z(n, t, e, i, o) {
  const r = [t[0] - n[0], t[1] - n[1]], s = [i[0] - e[0], i[1] - e[1]];
  function l(d, O, B) {
    return [
      d[0] + O * B[0],
      d[1] + O * B[1]
    ];
  }
  const c = [e[0] - n[0], e[1] - n[1]];
  let u = k(r, s), f = u * u;
  const p = M(r, r);
  if (f > 0) {
    const d = k(c, s) / u;
    if (d < 0 || d > 1)
      return null;
    const O = k(c, r) / u;
    return O < 0 || O > 1 ? null : d === 0 || d === 1 ? [l(n, d, r)] : O === 0 || O === 1 ? [l(e, O, s)] : [l(n, d, r)];
  }
  if (u = k(c, r), f = u * u, f > 0)
    return null;
  const h = M(r, c) / p, E = h + M(r, s) / p, a = Math.min(h, E), I = Math.max(h, E);
  return a <= 1 && I >= 0 ? a === 1 ? [l(n, a > 0 ? a : 0, r)] : I === 0 ? [l(n, I < 1 ? I : 1, r)] : [
    l(n, a > 0 ? a : 0, r),
    l(n, I < 1 ? I : 1, r)
  ] : null;
}
function x(n, t, e) {
  const i = Z(
    n.point,
    n.otherEvent.point,
    t.point,
    t.otherEvent.point
  ), o = i ? i.length : 0;
  if (o === 0 || o === 1 && (v(n.point, t.point) || v(n.otherEvent.point, t.otherEvent.point)) || o === 2 && n.isSubject === t.isSubject)
    return 0;
  if (o === 1)
    return !v(n.point, i[0]) && !v(n.otherEvent.point, i[0]) && m(n, i[0], e), !v(t.point, i[0]) && !v(t.otherEvent.point, i[0]) && m(t, i[0], e), 1;
  const r = [];
  let s = false, l = false;
  return v(n.point, t.point) ? s = true : w(n, t) === 1 ? r.push(t, n) : r.push(n, t), v(n.otherEvent.point, t.otherEvent.point) ? l = true : w(n.otherEvent, t.otherEvent) === 1 ? r.push(t.otherEvent, n.otherEvent) : r.push(n.otherEvent, t.otherEvent), s && l || s ? (t.type = _, n.type = t.inOut === n.inOut ? z : G, s && !l && m(r[1].otherEvent, r[0].point, e), 2) : l ? (m(r[0], r[1].point, e), 3) : r[0] !== r[3].otherEvent ? (m(r[0], r[1].point, e), m(r[1], r[2].point, e), 3) : (m(r[0], r[1].point, e), m(r[3].otherEvent, r[2].point, e), 3);
}
function $(n, t) {
  if (n === t) return 0;
  if (A(n.point, n.otherEvent.point, t.point) !== 0 || A(n.point, n.otherEvent.point, t.otherEvent.point) !== 0)
    return v(n.point, t.point) ? n.isBelow(t.otherEvent.point) ? -1 : 1 : n.point[0] === t.point[0] ? n.point[1] < t.point[1] ? -1 : 1 : w(n, t) === 1 ? t.isAbove(n.point) ? -1 : 1 : n.isBelow(t.point) ? -1 : 1;
  if (n.isSubject === t.isSubject) {
    let e = n.point, i = t.point;
    if (e[0] === i[0] && e[1] === i[1])
      return e = n.otherEvent.point, i = t.otherEvent.point, e[0] === i[0] && e[1] === i[1] ? 0 : (n.contourId ?? 0) > (t.contourId ?? 0) ? 1 : -1;
  } else
    return n.isSubject ? -1 : 1;
  return w(n, t) === 1 ? 1 : -1;
}
function Q(n, t, e, i, o, r) {
  const s = new import_splaytree.default($), l = [], c = Math.min(i[2], o[2]);
  let u, f, p;
  for (; n.length !== 0; ) {
    let h = n.pop();
    if (l.push(h), r === R && h.point[0] > c || r === g && h.point[0] > i[2])
      break;
    if (h.left) {
      f = u = s.insert(h), p = s.minNode(), u !== p ? u = s.prev(u) : u = null, f = s.next(f);
      const E = u ? u.key : null;
      let a;
      if (P(h, E, r), f && x(h, f.key, n) === 2 && (P(h, E, r), P(f.key, h, r)), u && x(u.key, h, n) === 2) {
        let I = u;
        I !== p ? I = s.prev(I) : I = null, a = I ? I.key : null, P(E, a, r), P(h, E, r);
      }
    } else
      h = h.otherEvent, f = u = s.find(h), u && f && (u !== p ? u = s.prev(u) : u = null, f = s.next(f), s.remove(h), f && u && x(u.key, f.key, n));
  }
  return l;
}
var H = class {
  /**
   * Contour
   *
   * @class {Contour}
   */
  constructor() {
    this.points = [], this.holeIds = [], this.holeOf = null, this.depth = null;
  }
  isExterior() {
    return this.holeOf == null;
  }
};
function b(n) {
  let t, e, i, o, r;
  const s = [];
  for (e = 0, i = n.length; e < i; e++)
    t = n[e], (t.left && t.inResult || !t.left && t.otherEvent.inResult) && s.push(t);
  let l = false;
  for (; !l; )
    for (l = true, e = 0, i = s.length; e < i; e++)
      e + 1 < i && w(s[e], s[e + 1]) === 1 && (o = s[e], s[e] = s[e + 1], s[e + 1] = o, l = false);
  for (e = 0, i = s.length; e < i; e++)
    t = s[e], t.otherPos = e;
  for (e = 0, i = s.length; e < i; e++)
    t = s[e], t.left || (r = t.otherPos, t.otherPos = t.otherEvent.otherPos, t.otherEvent.otherPos = r);
  return s;
}
function q(n, t, e, i) {
  let o = n + 1, r = t[n].point, s;
  const l = t.length;
  for (o < l && (s = t[o].point); o < l && s[0] === r[0] && s[1] === r[1]; ) {
    if (e[o])
      o++;
    else
      return o;
    o < l && (s = t[o].point);
  }
  for (o = n - 1; e[o] && o > i; )
    o--;
  return o;
}
function tt(n, t, e) {
  const i = new H();
  if (n.prevInResult != null) {
    const o = n.prevInResult, r = o.outputContourId;
    if (o.resultTransition > 0) {
      const l = t[r];
      if (l.holeOf != null) {
        const c = l.holeOf;
        t[c].holeIds.push(e), i.holeOf = c, i.depth = t[r].depth;
      } else
        t[r].holeIds.push(e), i.holeOf = r, i.depth = t[r].depth + 1;
    } else
      i.holeOf = null, i.depth = t[r].depth;
  } else
    i.holeOf = null, i.depth = 0;
  return i;
}
function nt(n) {
  let t, e;
  const i = b(n), o = {}, r = [];
  for (t = 0, e = i.length; t < e; t++) {
    if (o[t])
      continue;
    const s = r.length, l = tt(i[t], r, s), c = (h) => {
      o[h] = true, h < i.length && i[h] && (i[h].outputContourId = s);
    };
    let u = t, f = t;
    const p = i[t].point;
    for (l.points.push(p); c(u), u = i[u].otherPos, c(u), l.points.push(i[u].point), u = q(u, i, o, f), !(u == f || u >= i.length || !i[u]); )
      ;
    r.push(l);
  }
  return r;
}
var L = Math.max;
var V = Math.min;
var N = 0;
function D(n, t, e, i, o, r) {
  let s, l, c, u, f, p;
  for (s = 0, l = n.length - 1; s < l; s++) {
    if (c = n[s], u = n[s + 1], f = new S(c, false, void 0, t), p = new S(u, false, f, t), f.otherEvent = p, c[0] === u[0] && c[1] === u[1])
      continue;
    f.contourId = p.contourId = e, r || (f.isExteriorRing = false, p.isExteriorRing = false), w(f, p) > 0 ? p.left = true : f.left = true;
    const h = c[0], E = c[1];
    o[0] = V(o[0], h), o[1] = V(o[1], E), o[2] = L(o[2], h), o[3] = L(o[3], E), i.push(f), i.push(p);
  }
}
function et(n, t, e, i, o) {
  const r = new TinyQueue(void 0, w);
  let s, l, c, u, f, p;
  for (c = 0, u = n.length; c < u; c++)
    for (s = n[c], f = 0, p = s.length; f < p; f++)
      l = f === 0, l && N++, D(
        s[f],
        true,
        N,
        r,
        e,
        l
      );
  for (c = 0, u = t.length; c < u; c++)
    for (s = t[c], f = 0, p = s.length; f < p; f++)
      l = f === 0, o === g && (l = false), l && N++, D(
        s[f],
        false,
        N,
        r,
        i,
        l
      );
  return r;
}
var C = [];
function it(n, t, e) {
  let i = null;
  return n.length * t.length === 0 && (e === R ? i = C : e === g ? i = n : (e === y || e === T) && (i = n.length === 0 ? t : n)), i;
}
function rt(n, t, e, i, o) {
  let r = null;
  return (e[0] > i[2] || i[0] > e[2] || e[1] > i[3] || i[1] > e[3]) && (o === R ? r = C : o === g ? r = n : (o === y || o === T) && (r = n.concat(t))), r;
}
function j(n, t, e) {
  let i = n, o = t;
  typeof n[0][0][0] == "number" && (i = [n]), typeof t[0][0][0] == "number" && (o = [t]);
  let r = it(i, o, e);
  if (r)
    return r === C ? null : r;
  const s = [1 / 0, 1 / 0, -1 / 0, -1 / 0], l = [1 / 0, 1 / 0, -1 / 0, -1 / 0], c = et(i, o, s, l, e);
  if (r = rt(i, o, s, l, e), r)
    return r === C ? null : r;
  const u = Q(
    c,
    i,
    o,
    s,
    l,
    e
  ), f = nt(u), p = [];
  for (let h = 0; h < f.length; h++) {
    let E = f[h];
    if (E.isExterior()) {
      let a = [E.points];
      for (let I = 0; I < E.holeIds.length; I++) {
        let d = E.holeIds[I];
        a.push(f[d].points);
      }
      p.push(a);
    }
  }
  return p;
}
function ct(n, t) {
  return j(n, t, R);
}

// routeprofit-pro/src/features/floorplans/automaticRooms.ts
var SNAP = 0.01;
var EPS = 1e-7;
var MIN_AREA = 0.09;
var MAX_WALLS = 5e3;
var MAX_NODES = 2e4;
var MAX_EDGES = 3e4;
var MAX_FACES = 500;
var MAX_POINTS = 500;
var MAX_PAIRS = 15e5;
var round = (n) => Math.round(n * 1e8) / 1e8;
var dist = (a, b2) => Math.hypot(a.x - b2.x, a.y - b2.y);
var cross = (a, b2) => a.x * b2.y - a.y * b2.x;
var sub = (a, b2) => ({ x: a.x - b2.x, y: a.y - b2.y });
var signedArea = (p) => p.reduce((n, a, i) => {
  const b2 = p[(i + 1) % p.length];
  return n + a.x * b2.y - b2.x * a.y;
}, 0) / 2;
function project(p, a, b2) {
  const d = sub(b2, a), t = Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / (d.x * d.x + d.y * d.y)));
  const point3 = { x: a.x + d.x * t, y: a.y + d.y * t };
  return { t, point: point3, distance: dist(p, point3) };
}
function inside(p, polygon) {
  let value = false;
  for (let i = 0, j2 = polygon.length - 1; i < polygon.length; j2 = i++) {
    const a = polygon[i], b2 = polygon[j2];
    if (a.y > p.y !== b2.y > p.y && p.x < (b2.x - a.x) * (p.y - a.y) / (b2.y - a.y) + a.x) value = !value;
  }
  return value;
}
function canonical(points) {
  let p = points.map((v2) => ({ x: round(v2.x), y: round(v2.y) }));
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b2 = p[i], c = p[(i + 1) % p.length];
      if (dist(a, c) > EPS && project(b2, a, c).distance < EPS && !p.some((v2, j2) => j2 !== i && dist(v2, b2) < EPS)) {
        p.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (signedArea(p) < 0) p.reverse();
  let start = 0;
  for (let i = 1; i < p.length; i++) if (p[i].x < p[start].x - EPS || Math.abs(p[i].x - p[start].x) < EPS && p[i].y < p[start].y) start = i;
  return [...p.slice(start), ...p.slice(0, start)];
}
var polygonKey = (polygon) => JSON.stringify(canonical(polygon).map((p) => [p.x, p.y]));
function detect(walls) {
  const failed = () => ({ faces: [], complete: false });
  if (walls.length > MAX_WALLS || walls.some((w2) => ![w2.start.x, w2.start.y, w2.end.x, w2.end.y].every(Number.isFinite) || dist(w2.start, w2.end) < 9e-3)) return failed();
  if (!walls.length) return { faces: [], complete: true };
  const nodes = [], buckets = /* @__PURE__ */ new Map();
  const nodeFor = (p) => {
    const x2 = Math.floor(p.x / SNAP), y2 = Math.floor(p.y / SNAP);
    let best = -1, distance3 = SNAP + EPS;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const id3 of buckets.get(`${x2 + dx}:${y2 + dy}`) || []) {
      const d = dist(p, nodes[id3].point);
      if (d < distance3 - EPS || Math.abs(d - distance3) < EPS && id3 < best) {
        best = id3;
        distance3 = d;
      }
    }
    if (best >= 0) return best;
    const id2 = nodes.length;
    nodes.push({ point: { x: round(p.x), y: round(p.y) }, links: /* @__PURE__ */ new Map() });
    const key = `${x2}:${y2}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id2);
    return id2;
  };
  const ordered = walls.slice().sort((a, b2) => a.id.localeCompare(b2.id));
  const ends = ordered.flatMap((w2) => [w2.start, w2.end]).sort((a, b2) => a.x - b2.x || a.y - b2.y);
  for (const p of ends) nodeFor(p);
  const segments = ordered.map((wall2) => {
    const start = nodes[nodeFor(wall2.start)].point, end = nodes[nodeFor(wall2.end)].point;
    return { wall: wall2, start, end, cuts: [0, 1], minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x), minY: Math.min(start.y, end.y), maxY: Math.max(start.y, end.y) };
  }).filter((s) => dist(s.start, s.end) > EPS).sort((a, b2) => a.minX - b2.minX || a.minY - b2.minY || a.wall.id.localeCompare(b2.wall.id));
  let pairs = 0;
  for (let i = 0; i < segments.length; i++) for (let j2 = i + 1; j2 < segments.length; j2++) {
    const a = segments[i], b2 = segments[j2];
    if (b2.minX > a.maxX + SNAP) break;
    if (b2.minY > a.maxY + SNAP || a.minY > b2.maxY + SNAP) continue;
    if (++pairs > MAX_PAIRS) return failed();
    const r = sub(a.end, a.start), s = sub(b2.end, b2.start), q2 = sub(b2.start, a.start), denominator = cross(r, s);
    if (Math.abs(denominator) > EPS * dist(a.start, a.end) * dist(b2.start, b2.end)) {
      const t = cross(q2, s) / denominator, u = cross(q2, r) / denominator;
      if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS) {
        a.cuts.push(Math.max(0, Math.min(1, t)));
        b2.cuts.push(Math.max(0, Math.min(1, u)));
      }
    }
    for (const p of [a.start, a.end]) {
      const hit = project(p, b2.start, b2.end);
      if (hit.distance <= SNAP + EPS) b2.cuts.push(hit.t);
    }
    for (const p of [b2.start, b2.end]) {
      const hit = project(p, a.start, a.end);
      if (hit.distance <= SNAP + EPS) a.cuts.push(hit.t);
    }
  }
  let countEdges = 0;
  for (const segment of segments) {
    const cuts = segment.cuts.sort((a, b2) => a - b2).filter((v2, i, all) => i === 0 || v2 - all[i - 1] > EPS);
    const ids = cuts.map((t) => nodeFor({ x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t }));
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1], b2 = ids[i];
      if (a === b2) continue;
      if (!nodes[a].links.has(b2)) {
        nodes[a].links.set(b2, /* @__PURE__ */ new Set());
        nodes[b2].links.set(a, /* @__PURE__ */ new Set());
        countEdges++;
      }
      nodes[a].links.get(b2).add(segment.wall.id);
      nodes[b2].links.get(a).add(segment.wall.id);
    }
    if (nodes.length > MAX_NODES || countEdges > MAX_EDGES) return failed();
  }
  const discovered = new Int32Array(nodes.length), low = new Int32Array(nodes.length), parent = new Int32Array(nodes.length).fill(-1), bridges = [];
  let clock = 0;
  for (let root = 0; root < nodes.length; root++) {
    if (discovered[root]) continue;
    discovered[root] = low[root] = ++clock;
    const stack = [{ id: root, neighbours: [...nodes[root].links.keys()], index: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1], a = frame.id;
      if (frame.index < frame.neighbours.length) {
        const b2 = frame.neighbours[frame.index++];
        if (b2 === parent[a]) continue;
        if (!discovered[b2]) {
          parent[b2] = a;
          discovered[b2] = low[b2] = ++clock;
          stack.push({ id: b2, neighbours: [...nodes[b2].links.keys()], index: 0 });
        } else low[a] = Math.min(low[a], discovered[b2]);
      } else {
        stack.pop();
        const p = parent[a];
        if (p >= 0) {
          low[p] = Math.min(low[p], low[a]);
          if (low[a] > discovered[p]) bridges.push([p, a]);
        }
      }
    }
  }
  for (const [a, b2] of bridges) {
    nodes[a].links.delete(b2);
    nodes[b2].links.delete(a);
  }
  const component = new Int32Array(nodes.length).fill(-1);
  let nextComponent = 0;
  for (let i = 0; i < nodes.length; i++) if (component[i] < 0) {
    const queue = [i];
    component[i] = nextComponent++;
    while (queue.length) {
      const a = queue.pop();
      for (const b2 of nodes[a].links.keys()) if (component[b2] < 0) {
        component[b2] = component[a];
        queue.push(b2);
      }
    }
  }
  const adjacency = nodes.map((node) => [...node.links.keys()].sort((a, b2) => Math.atan2(nodes[a].point.y - node.point.y, nodes[a].point.x - node.point.x) - Math.atan2(nodes[b2].point.y - node.point.y, nodes[b2].point.x - node.point.x)));
  const visited = /* @__PURE__ */ new Set(), positive = [], negative = [];
  for (let a = 0; a < nodes.length; a++) for (const b2 of adjacency[a]) {
    if (visited.has(`${a}:${b2}`)) continue;
    const ids = [], walls2 = /* @__PURE__ */ new Set();
    let from = a, to = b2, closed = false;
    for (let count = 0; count <= countEdges * 2; count++) {
      const key = `${from}:${to}`;
      if (visited.has(key)) {
        closed = from === a && to === b2;
        break;
      }
      visited.add(key);
      ids.push(from);
      for (const id2 of nodes[from].links.get(to)) walls2.add(id2);
      const neighbours = adjacency[to], back = neighbours.indexOf(from), next = neighbours[(back - 1 + neighbours.length) % neighbours.length];
      from = to;
      to = next;
    }
    if (!closed || ids.length < 3) continue;
    const polygon = ids.map((i) => nodes[i].point), area = signedArea(polygon);
    if (area >= MIN_AREA) positive.push({ polygon: canonical(polygon), wallIds: [...walls2].sort(), area, component: component[a], holes: [] });
    else if (area < -MIN_AREA) negative.push({ polygon, component: component[a] });
    if (positive.length > MAX_FACES) return failed();
  }
  for (const hole of negative) {
    const owner = positive.filter((face) => face.component !== hole.component && inside(hole.polygon[0], face.polygon)).sort((a, b2) => a.area - b2.area)[0];
    if (owner) owner.holes.push(hole.polygon);
  }
  const faces = [];
  for (const face of positive) {
    let polygon = face.polygon;
    for (const hole of face.holes.sort((a, b2) => Math.max(...b2.map((p) => p.x)) - Math.max(...a.map((p) => p.x)))) {
      polygon = bridgeHole(polygon, hole);
      if (!polygon.length) return failed();
    }
    polygon = canonical(polygon);
    const area = signedArea(polygon);
    if (polygon.length > MAX_POINTS) return failed();
    if (area >= MIN_AREA) faces.push({ polygon, area, wallIds: face.wallIds });
  }
  return { complete: true, faces: faces.sort((a, b2) => polygonKey(a.polygon).localeCompare(polygonKey(b2.polygon))) };
}
function bridgeHole(outer, hole) {
  let h = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i].x > hole[h].x || hole[i].x === hole[h].x && hole[i].y < hole[h].y) h = i;
  const point3 = hole[h];
  let nearest = Infinity, edge = -1, connection;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b2 = outer[(i + 1) % outer.length];
    if (a.y > point3.y === b2.y > point3.y) continue;
    const x2 = a.x + (point3.y - a.y) * (b2.x - a.x) / (b2.y - a.y);
    if (x2 > point3.x + EPS && x2 < nearest) {
      nearest = x2;
      edge = i;
      connection = { x: x2, y: point3.y };
    }
  }
  if (!connection || edge < 0) return [];
  return [...outer.slice(0, edge + 1), connection, ...hole.slice(h), ...hole.slice(0, h), point3, connection, ...outer.slice(edge + 1)];
}
function overlapArea(a, b2) {
  if (Math.max(...a.map((p) => p.x)) < Math.min(...b2.map((p) => p.x)) - EPS || Math.max(...b2.map((p) => p.x)) < Math.min(...a.map((p) => p.x)) - EPS || Math.max(...a.map((p) => p.y)) < Math.min(...b2.map((p) => p.y)) - EPS || Math.max(...b2.map((p) => p.y)) < Math.min(...a.map((p) => p.y)) - EPS) return 0;
  try {
    const ring = (p) => [...p, p[0]].map((v2) => [v2.x, v2.y]);
    const clipped = ct([ring(a)], [ring(b2)]);
    const polygons = !clipped?.length ? [] : typeof clipped[0]?.[0]?.[0] === "number" ? [clipped] : clipped;
    return polygons.reduce((sum, polygon) => sum + polygon.reduce((n, ring2, i) => n + (i === 0 ? 1 : -1) * Math.abs(signedArea(ring2.map((p) => ({ x: p[0], y: p[1] })))), 0), 0);
  } catch {
    return 0;
  }
}
function samePolygon(a, b2) {
  return polygonKey(a) === polygonKey(b2);
}
function matchingFace(room2, faces, keys) {
  return keys.get(polygonKey(room2.polygon)) || faces.find((face) => {
    const area = Math.abs(signedArea(room2.polygon));
    if (Math.abs(area - face.area) > Math.max(0.01, face.area * 2e-3)) return false;
    return overlapArea(room2.polygon, face.polygon) >= Math.max(area, face.area) - Math.max(0.01, face.area * 2e-3);
  });
}
function hash(value) {
  let a = 2166136261, b2 = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b2 = Math.imul(b2, 33) ^ value.charCodeAt(i);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b2 >>> 0).toString(16).padStart(8, "0")}`;
}
function reconcileAutomaticRooms(beforeFloor, candidateFloor) {
  const before = detect(beforeFloor.walls), after = detect(candidateFloor.walls);
  if (!before.complete || !after.complete) return candidateFloor;
  const beforeKeys = new Map(before.faces.map((face) => [polygonKey(face.polygon), face])), afterKeys = new Map(after.faces.map((face) => [polygonKey(face.polygon), face])), afterIndex = new Map(after.faces.map((face, i) => [polygonKey(face.polygon), i]));
  const oldRooms = new Map(beforeFloor.rooms.map((room2) => [room2.id, room2])), assigned = /* @__PURE__ */ new Map(), used = /* @__PURE__ */ new Set();
  const managed = [], untouched = [];
  for (const room2 of candidateFloor.rooms) {
    const exact = afterIndex.get(polygonKey(room2.polygon));
    if (exact !== void 0 && !assigned.has(exact)) {
      assigned.set(exact, room2);
      used.add(room2.id);
      continue;
    }
    const old = oldRooms.get(room2.id), prior = old && matchingFace(old, before.faces, beforeKeys);
    if (prior) managed.push({ room: room2, beforeFace: prior });
    else if (matchingFace(room2, after.faces, afterKeys)) managed.push({ room: room2 });
    else untouched.push(room2);
  }
  const options = [];
  for (const { room: room2, beforeFace } of managed) for (let i = 0; i < after.faces.length; i++) {
    if (assigned.has(i)) continue;
    const face = after.faces[i], shared = beforeFace ? face.wallIds.filter((id2) => beforeFace.wallIds.includes(id2)).length / Math.max(1, Math.min(face.wallIds.length, beforeFace.wallIds.length)) : 0;
    const overlap2 = overlapArea(room2.polygon, face.polygon), area = Math.abs(signedArea(room2.polygon));
    if (shared < 0.45 && overlap2 < Math.min(area, face.area) * 0.35) continue;
    options.push({ face: i, room: room2, score: overlap2 / Math.max(area, face.area, 0.01) * 5 + shared * 2 + Math.min(overlap2, 1e5) * 1e-7 });
  }
  options.sort((a, b2) => b2.score - a.score || a.room.id.localeCompare(b2.room.id) || a.face - b2.face);
  for (const option of options) if (!used.has(option.room.id) && !assigned.has(option.face)) {
    assigned.set(option.face, option.room);
    used.add(option.room.id);
  }
  const reserved = /* @__PURE__ */ new Set([candidateFloor.id, ...candidateFloor.walls.map((w2) => w2.id), ...candidateFloor.openings.map((o) => o.id), ...candidateFloor.symbols.map((s) => s.id), ...candidateFloor.routes.map((r) => r.id), ...candidateFloor.print.viewpoints.map((v2) => v2.id), ...(candidateFloor.furnishings || []).map((v2) => v2.id), ...candidateFloor.rooms.map((r) => r.id)]);
  const labels = new Set(candidateFloor.rooms.map((room2) => room2.label));
  let number = 1;
  const rooms = after.faces.map((face, index) => {
    const current = assigned.get(index);
    if (current) return samePolygon(current.polygon, face.polygon) ? current : { ...current, polygon: face.polygon };
    const base = `room-auto-${hash(`${candidateFloor.id}:${polygonKey(face.polygon)}`)}`;
    let id2 = base, suffix = 1;
    while (reserved.has(id2)) id2 = `${base}-${suffix++}`;
    reserved.add(id2);
    while (labels.has(`Ruimte ${number}`)) number++;
    const label = `Ruimte ${number++}`;
    labels.add(label);
    return { id: id2, label, polygon: face.polygon };
  });
  rooms.push(...untouched);
  if (JSON.stringify(rooms) === JSON.stringify(candidateFloor.rooms)) return candidateFloor;
  return { ...candidateFloor, rooms };
}

// routeprofit-pro/src/features/floorplans/roomScanOrientation.ts
var radians = Math.PI / 180;

// routeprofit-pro/src/features/floorplans/planRegistration.ts
var TAU = 2 * Math.PI;
function transformPlanPoint(point3, transform) {
  const c = Math.cos(transform.angleRadians), s = Math.sin(transform.angleRadians);
  return { x: transform.scale * (point3.x * c - point3.y * s) + transform.translation.x, y: transform.scale * (point3.x * s + point3.y * c) + transform.translation.y };
}

// routeprofit-pro/src/features/floorplans/roomScanWallPlacement.ts
var TAU2 = 2 * Math.PI;

// routeprofit-pro/src/features/floorplans/roomScanPlacement.ts
var finitePoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e3 && Math.abs(p.y) <= 1e3;
var validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 256;
function validRoomScanEvent(event) {
  if (!event || event.schemaVersion !== 1 || event.coordinateSystem !== "arkit-x-negative-z-metres" || event.alignment !== "unregistered" || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || !event.context || !event.coordinateFrameId || !event.snapshot || !Array.isArray(event.snapshot.surfaces) || event.snapshot.surfaces.length > 2500) return false;
  const context = event.context;
  if (![context.captureSessionId, context.customerId, context.objectId, context.buildingSelectionKey, context.documentId, context.floorId, event.coordinateFrameId, event.snapshot.roomId].every(validId) || !Number.isSafeInteger(context.mapVersion) || context.mapVersion < 0 || typeof event.isFinal !== "boolean" || context.targetRoomId !== void 0 && !validId(context.targetRoomId) || context.targetRoomLabel !== void 0 && (typeof context.targetRoomLabel !== "string" || context.targetRoomLabel.length > 256)) return false;
  if (event.snapshot.objects !== void 0) {
    if (!Array.isArray(event.snapshot.objects) || event.snapshot.objects.length > 2500) return false;
    const objectIds = /* @__PURE__ */ new Set();
    if (!event.snapshot.objects.every((value) => {
      if (!value || !validId(value.id) || objectIds.has(value.id) || typeof value.category !== "string" || value.category.length > 128 || !finitePoint(value.center) || ![value.width, value.depth].every((n) => Number.isFinite(n) && n > 0 && n <= 1e3) || !Number.isFinite(value.rotationRadians) || Math.abs(value.rotationRadians) > Math.PI * 2) return false;
      objectIds.add(value.id);
      return true;
    })) return false;
  }
  const ids = /* @__PURE__ */ new Set();
  return event.snapshot.surfaces.every((s) => {
    if (!s || typeof s.id !== "string" || !s.id || s.id.length > 128 || ids.has(s.id)) return false;
    ids.add(s.id);
    return ["wall", "door", "window", "opening"].includes(s.kind) && ["low", "medium", "high", "unknown"].includes(s.confidence) && (s.parentWallId === void 0 || validId(s.parentWallId)) && (s.isCurved === void 0 || typeof s.isCurved === "boolean") && finitePoint(s.start) && finitePoint(s.end) && Math.hypot(s.end.x - s.start.x, s.end.y - s.start.y) >= 1e-3 && Number.isFinite(s.height) && s.height > 0 && s.height <= 50 && Number.isFinite(s.bottomElevation) && Math.abs(s.bottomElevation) <= 1e3;
  });
}
function scanWalls(event) {
  if (!validRoomScanEvent(event)) return [];
  return event.snapshot.surfaces.filter((s) => s.kind === "wall" && !s.isCurved).map((s) => ({ id: s.id, start: { ...s.start }, end: { ...s.end }, thickness: 0.12 }));
}
function positionedRoomScan(event, floor2, transform, { includeDetails = false } = {}) {
  if (!validRoomScanEvent(event)) return { ...floor2, walls: [], openings: [], rooms: [], symbols: [], routes: [], furnishings: void 0, background: void 0 };
  const bases = event.snapshot.surfaces.filter((s) => s.kind === "wall" && !s.isCurved).map((s) => s.bottomElevation).sort((a, b2) => a - b2);
  const base = bases.length ? bases[Math.floor(bases.length / 2)] : 0;
  const surfaces = new Map(event.snapshot.surfaces.map((s) => [s.id, s]));
  const walls = scanWalls(event).map((w2) => ({ ...w2, start: transformPlanPoint(w2.start, transform), end: transformPlanPoint(w2.end, transform), ...includeDetails && surfaces.get(w2.id).height >= 0.01 ? { height: surfaces.get(w2.id).height } : {} }));
  const openings = [];
  for (const s of event.snapshot.surfaces.filter((s2) => s2.kind !== "wall" && !s2.isCurved)) {
    const a = transformPlanPoint(s.start, transform), b2 = transformPlanPoint(s.end, transform), width = Math.hypot(b2.x - a.x, b2.y - a.y);
    const candidates = walls.filter((w2) => !s.parentWallId || w2.id === s.parentWallId).map((w2) => {
      const dx = w2.end.x - w2.start.x, dy = w2.end.y - w2.start.y, length = Math.hypot(dx, dy);
      const u = { x: dx / length, y: dy / length };
      const p = (v2) => (v2.x - w2.start.x) * u.x + (v2.y - w2.start.y) * u.y;
      const offset = Math.min(p(a), p(b2));
      const gap2 = Math.max(Math.abs((a.x - w2.start.x) * u.y - (a.y - w2.start.y) * u.x), Math.abs((b2.x - w2.start.x) * u.y - (b2.y - w2.start.y) * u.x));
      return { w: w2, offset, length, gap: gap2 };
    }).filter((c) => c.gap < 0.2 && c.offset >= -0.05 && c.offset + width <= c.length + 0.05).sort((a2, b3) => a2.gap - b3.gap);
    const hit = candidates[0];
    if (!hit || width < 0.05) continue;
    openings.push({ id: s.id, wallId: hit.w.id, type: s.kind, offset: Math.max(0, hit.offset), width: Math.min(width, hit.length - Math.max(0, hit.offset)), hinge: "left", swing: "in", ...includeDetails && s.height >= 0.01 ? { height: s.height, bottomElevation: Math.max(0, s.bottomElevation - base) } : {} });
  }
  const furnishings = (includeDetails ? event.snapshot.objects || [] : []).flatMap((raw) => {
    if (!Number.isFinite(raw.height) || raw.height < 0.01 || raw.height > 1e3 || !Number.isFinite(raw.bottomElevation) || raw.bottomElevation - base > 1e3 || raw.width < 0.01 || raw.depth < 0.01) return [];
    return [{ id: raw.id, category: raw.category, position: transformPlanPoint(raw.center, transform), rotation: (raw.rotationRadians + transform.angleRadians) * 180 / Math.PI, width: raw.width, depth: raw.depth, height: raw.height, bottomElevation: Math.max(0, raw.bottomElevation - base), confidence: ["low", "medium", "high"].includes(raw.confidence) ? raw.confidence : "unknown" }];
  });
  return { ...floor2, walls, openings, rooms: [], symbols: [], routes: [], furnishings: includeDetails ? furnishings : void 0, background: void 0 };
}

// routeprofit-pro/node_modules/zod/v3/external.js
var external_exports = {};
__export(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});

// routeprofit-pro/node_modules/zod/v3/helpers/util.js
var util;
(function(util2) {
  util2.assertEqual = (_2) => {
  };
  function assertIs(_arg) {
  }
  util2.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util2.assertNever = assertNever;
  util2.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util2.getValidEnumValues = (obj) => {
    const validKeys = util2.objectKeys(obj).filter((k2) => typeof obj[obj[k2]] !== "number");
    const filtered = {};
    for (const k2 of validKeys) {
      filtered[k2] = obj[k2];
    }
    return util2.objectValues(filtered);
  };
  util2.objectValues = (obj) => {
    return util2.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util2.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util2.joinValues = joinValues;
  util2.jsonStringifyReplacer = (_2, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil2) {
  objectUtil2.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};

// routeprofit-pro/node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub2) => {
      this.issues = [...this.issues, sub2];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub2 of this.issues) {
      if (sub2.path.length > 0) {
        const firstEl = sub2.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub2));
      } else {
        formErrors.push(mapper(sub2));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};

// routeprofit-pro/node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;

// routeprofit-pro/node_modules/zod/v3/errors.js
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}

// routeprofit-pro/node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m2) => !!m2).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x2) => !!x2)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x2) => x2.status === "aborted";
var isDirty = (x2) => x2.status === "dirty";
var isValid = (x2) => x2.status === "valid";
var isAsync = (x2) => typeof Promise !== "undefined" && x2 instanceof Promise;

// routeprofit-pro/node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil2) {
  errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));

// routeprofit-pro/node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
  if (errorMap2 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap2)
    return { errorMap: errorMap2, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b2) {
  const aType = getParsedType(a);
  const bType = getParsedType(b2);
  if (a === b2) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b2);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b2 };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b2[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b2.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b2[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b2) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x2) => !!x2);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x2) => !!x2),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x2) => !!x2),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b2) {
    return new _ZodPipeline({
      in: a,
      out: b2,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind2) {
  ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;

// routeprofit-pro/src/features/floorplans/documentGuards.ts
var text = (maximum = 250) => external_exports.string().max(maximum).refine((value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
var id = external_exports.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/);
var coordinate = external_exports.number().finite().min(-1e5).max(1e5);
var point = external_exports.object({ x: coordinate, y: coordinate }).strict();
var angle = external_exports.number().finite().min(-3600).max(3600);
var wall = external_exports.object({ id, start: point, end: point, thickness: external_exports.number().finite().min(0.01).max(5), height: external_exports.number().finite().min(0.01).max(50).optional() }).strict().refine((w2) => Math.hypot(w2.start.x - w2.end.x, w2.start.y - w2.end.y) >= 0.01);
var opening = external_exports.object({ id, wallId: id, type: external_exports.enum(["door", "window", "opening"]), offset: external_exports.number().finite().min(0).max(1e5), width: external_exports.number().finite().min(0.05).max(50), hinge: external_exports.enum(["left", "right"]), swing: external_exports.enum(["in", "out"]), height: external_exports.number().finite().min(0.01).max(50).optional(), bottomElevation: external_exports.number().finite().min(0).max(1e3).optional() }).strict();
var room = external_exports.object({ id, label: text(), polygon: external_exports.array(point).min(3).max(500) }).strict().refine((room2) => Math.abs(room2.polygon.reduce((sum, p, i) => {
  const next = room2.polygon[(i + 1) % room2.polygon.length];
  return sum + p.x * next.y - next.x * p.y;
}, 0)) / 2 >= 1e-4);
var symbol = external_exports.object({ id, kind: external_exports.enum(["camera", "motion_detector", "alarm_panel", "access_control", "smoke_detector", "manual_call_point", "fire_extinguisher", "fire_hose", "aed", "emergency_exit", "assembly_point", "you_are_here", "stairs", "detector", "fire_alarm", "first_aid", "emergency_light", "lift", "electrical"]), position: point, rotation: angle, label: text(), installationId: id.optional() }).strict();
var route = external_exports.object({ id, points: external_exports.array(point).min(2).max(500), label: text() }).strict();
var background = external_exports.object({ fileId: id, width: external_exports.number().finite().min(1).max(2e4), height: external_exports.number().finite().min(1).max(2e4), origin: point, metresPerPixel: external_exports.number().finite().min(1e-6).max(100), opacity: external_exports.number().finite().min(0).max(1), calibrated: external_exports.boolean() }).strict();
var print = external_exports.object({ paper: external_exports.enum(["A4", "A3"]), orientation: external_exports.enum(["portrait", "landscape"]), scale: external_exports.number().finite().min(1).max(1e4), profile: external_exports.enum(["evacuation", "installation"]), title: text(), address: text(500), drawingNumber: text(120), instructions: text(4e3), secondaryInstructions: text(4e3), language2: text(40), viewpoints: external_exports.array(external_exports.object({ id, label: text(), position: point, rotation: angle }).strict()).max(100), cropCenter: point.optional(), logoFileId: id.optional() }).strict();
var furnishingSchema = external_exports.object({ id, category: text(128), position: point, rotation: angle, width: external_exports.number().finite().min(0.01).max(1e3), depth: external_exports.number().finite().min(0.01).max(1e3), height: external_exports.number().finite().min(0.01).max(1e3), bottomElevation: external_exports.number().finite().min(0).max(1e3), confidence: external_exports.enum(["low", "medium", "high", "unknown"]) }).strict();
var floor = external_exports.object({ id, name: text(120).refine((name) => !!name.trim()), elevation: external_exports.number().finite().min(-1e3).max(1e4), walls: external_exports.array(wall).max(5e3), rooms: external_exports.array(room).max(2e3), openings: external_exports.array(opening).max(4e3), symbols: external_exports.array(symbol).max(5e3), routes: external_exports.array(route).max(1e3), furnishings: external_exports.array(furnishingSchema).max(2500).optional(), background: background.optional(), print }).strict();
var geoReference = external_exports.object({ crs: external_exports.literal("EPSG:28992"), origin: external_exports.object({ x: external_exports.number().finite().min(-1e6).max(1e6), y: external_exports.number().finite().min(-1e6).max(1e6) }).strict(), rotation: external_exports.literal(0), verticalDatum: external_exports.literal("NAP"), axis: external_exports.literal("x-east-y-north") }).strict();
var buildingReference = external_exports.object({ id, manifestFileId: id, manifestSha256: external_exports.string().regex(/^[a-f0-9]{64}$/), usedParts: external_exports.array(external_exports.enum(["footprint", "aerial", "roof"])).min(1).max(3), floorId: id, wallIds: external_exports.array(id).max(5e3), interpretation: external_exports.enum(["closed_building", "open_structure"]), measurementStatus: external_exports.enum(["unchecked", "user_checked"]), attributions: external_exports.array(text(400)).max(8), modelFileId: id.optional() }).strict().refine((reference) => reference.usedParts.includes("roof") === Boolean(reference.modelFileId));
var documentFields = { id, title: text(), unit: external_exports.literal("m"), floors: external_exports.array(floor).min(1).max(30) };
var floorPlanDocumentSchema = external_exports.discriminatedUnion("schemaVersion", [
  external_exports.object({ ...documentFields, schemaVersion: external_exports.literal(1) }).strict(),
  external_exports.object({ ...documentFields, schemaVersion: external_exports.literal(2), geoReference: geoReference.optional(), buildingReferences: external_exports.array(buildingReference).max(30).optional() }).strict(),
  external_exports.object({ ...documentFields, schemaVersion: external_exports.literal(3), geoReference: geoReference.optional(), buildingReferences: external_exports.array(buildingReference).max(30).optional() }).strict()
]).superRefine((doc, context) => {
  const ids = /* @__PURE__ */ new Set([doc.id]);
  let entries = doc.floors.length;
  for (const f of doc.floors) {
    if (doc.schemaVersion < 3 && (f.furnishings !== void 0 || f.walls.some((w2) => w2.height !== void 0) || f.openings.some((o) => o.height !== void 0 || o.bottomElevation !== void 0))) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Gemeten hoogtes en inrichting vereisen tekenbestandversie 3." });
    for (const item of [f, ...f.walls, ...f.rooms, ...f.openings, ...f.symbols, ...f.routes, ...f.print.viewpoints, ...f.furnishings || []]) {
      if (ids.has(item.id)) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Alle tekenonderdelen moeten een uniek ID hebben." });
      ids.add(item.id);
    }
    entries += f.walls.length + f.rooms.length + f.openings.length + f.symbols.length + f.routes.length + f.print.viewpoints.length + (f.furnishings?.length || 0);
    entries += f.rooms.reduce((n, r) => n + r.polygon.length, 0) + f.routes.reduce((n, r) => n + r.points.length, 0);
    const walls = new Map(f.walls.map((w2) => [w2.id, w2]));
    for (const opening2 of f.openings) {
      const wall2 = walls.get(opening2.wallId);
      if (!wall2 || opening2.offset + opening2.width > Math.hypot(wall2.end.x - wall2.start.x, wall2.end.y - wall2.start.y) + 1e-3) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Een deur of raam valt buiten de bijbehorende muur." });
    }
  }
  if (doc.schemaVersion !== 1 && doc.buildingReferences?.length) {
    if (!doc.geoReference) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "De geografische oorsprong ontbreekt." });
    const references = /* @__PURE__ */ new Set();
    for (const reference of doc.buildingReferences) {
      if (references.has(reference.id) || new Set(reference.wallIds).size !== reference.wallIds.length || new Set(reference.usedParts).size !== reference.usedParts.length) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "De gebouwreferentie bevat dubbele onderdelen." });
      references.add(reference.id);
    }
  }
  if (entries > 4e4) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Het tekenbestand bevat te veel onderdelen." });
  if (new TextEncoder().encode(JSON.stringify(doc)).length > 4 * 1024 * 1024) context.addIssue({ code: external_exports.ZodIssueCode.custom, message: "Het tekenbestand mag maximaal 4 MiB groot zijn." });
});
function parseFloorPlanDocument(value) {
  try {
    const json = JSON.stringify(value);
    if (!json || new TextEncoder().encode(json).length > 4 * 1024 * 1024) return null;
    const result = floorPlanDocumentSchema.safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// routeprofit-pro/src/features/floorplans/liveScanMerge.ts
var safeId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value);
var sameScope = (a, b2) => a.customerId === b2.customerId && a.objectId === b2.objectId && a.buildingSelectionKey === b2.buildingSelectionKey && a.documentId === b2.documentId && a.floorId === b2.floorId && a.mapVersion === b2.mapVersion;
var validScope = (scope) => scope && [scope.customerId, scope.objectId, scope.documentId, scope.floorId].every(safeId) && typeof scope.buildingSelectionKey === "string" && /^(bag|point|manual):[A-Za-z0-9_.:-]{1,120}$/.test(scope.buildingSelectionKey) && Number.isSafeInteger(scope.mapVersion) && scope.mapVersion >= 0;
var collection = (floor2, kind) => kind === "wall" ? floor2.walls : kind === "room" ? floor2.rooms : kind === "furnishing" ? floor2.furnishings ||= [] : floor2.openings;
var elementFingerprint = (kind, value) => {
  if (kind === "wall") {
    const v3 = value;
    return JSON.stringify([v3.start.x, v3.start.y, v3.end.x, v3.end.y, v3.thickness, ...v3.height === void 0 ? [] : [v3.height]]);
  }
  if (kind === "room") {
    const v3 = value;
    return JSON.stringify([v3.label, v3.polygon.map((p) => [p.x, p.y])]);
  }
  if (kind === "furnishing") {
    const v3 = value;
    return JSON.stringify([v3.category, v3.position.x, v3.position.y, v3.rotation, v3.width, v3.depth, v3.height, v3.bottomElevation, v3.confidence]);
  }
  const v2 = value;
  return JSON.stringify([v2.wallId, v2.type, v2.offset, v2.width, v2.hinge, v2.swing, ...v2.height === void 0 && v2.bottomElevation === void 0 ? [] : [v2.height ?? null, v2.bottomElevation ?? null]]);
};
var point2 = (value) => value && [value.x, value.y].every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e5);
var text2 = (value) => typeof value === "string" && value.length <= 250 && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
function validElement(element) {
  if (!element || !safeId(element.sourceId) || !element.value) return false;
  const v2 = element.value;
  if (element.kind === "wall") {
    const wall2 = v2;
    return point2(wall2.start) && point2(wall2.end) && Math.hypot(wall2.start.x - wall2.end.x, wall2.start.y - wall2.end.y) >= 0.01 && Number.isFinite(wall2.thickness) && wall2.thickness >= 0.01 && wall2.thickness <= 5;
  }
  if (element.kind === "room") {
    const room2 = v2;
    return text2(room2.label) && Array.isArray(room2.polygon) && room2.polygon.length >= 3 && room2.polygon.length <= 500 && room2.polygon.every(point2);
  }
  if (element.kind === "opening") {
    const opening2 = v2;
    return safeId(element.sourceWallId) && ["door", "window", "opening"].includes(opening2.type) && Number.isFinite(opening2.offset) && opening2.offset >= 0 && opening2.offset <= 1e5 && Number.isFinite(opening2.width) && opening2.width >= 0.05 && opening2.width <= 50 && ["left", "right"].includes(opening2.hinge) && ["in", "out"].includes(opening2.swing);
  }
  if (element.kind === "furnishing") return furnishingSchema.safeParse({ id: element.sourceId, ...element.value }).success;
  return false;
}
function createScanMergeState(scope, sessionId, epoch) {
  if (!validScope(scope) || !safeId(sessionId) || !safeId(epoch)) throw new Error("Ongeldige scansessie.");
  return { sessionId, epoch, scope: structuredClone(scope), sequence: 0, elements: [] };
}
function mergeScanSnapshot(document, state, snapshot) {
  const result = { document, state, status: "unchanged", added: [], updated: [], removed: [], protected: [] };
  const reject = (status, reason) => ({ document, state, status, reason, added: [], updated: [], removed: [], protected: [] });
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.scope || !Array.isArray(snapshot.elements) || snapshot.elements.length > 2500 || !Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 1 || !snapshot.elements.every(validElement)) return reject("invalid", "invalid_snapshot");
  if (snapshot.sessionId !== state.sessionId || snapshot.epoch !== state.epoch || !sameScope(snapshot.scope, state.scope) || document.id !== state.scope.documentId) return reject("ignored", "different_session");
  if (snapshot.sequence <= state.sequence) return reject("ignored", "stale_sequence");
  if (!document.floors.some((floor3) => floor3.id === state.scope.floorId)) return reject("ignored", "missing_floor");
  const sourceIds = new Set(snapshot.elements.map((element) => element.sourceId));
  if (sourceIds.size !== snapshot.elements.length || snapshot.elements.reduce((total, element) => total + (element.kind === "room" ? element.value.polygon.length : 2), 0) > 2e4 || snapshot.elements.some((element) => element.kind === "opening" && !snapshot.elements.some((wall2) => wall2.sourceId === element.sourceWallId && wall2.kind === "wall"))) return reject("invalid", "invalid_snapshot");
  const next = structuredClone(document), nextState = structuredClone(state);
  if (snapshot.elements.some((e) => e.kind === "furnishing" || e.kind === "wall" && e.value.height !== void 0 || e.kind === "opening" && (e.value.height !== void 0 || e.value.bottomElevation !== void 0))) next.schemaVersion = 3;
  const floor2 = next.floors.find((f) => f.id === state.scope.floorId);
  const owned = new Map(nextState.elements.map((entry) => [entry.sourceId, entry]));
  const byId = new Map(nextState.elements.map((entry) => [entry.elementId, entry]));
  const usedIds = /* @__PURE__ */ new Set([document.id, ...document.floors.flatMap((f) => [f.id, ...[f.walls, f.rooms, f.openings, f.symbols, f.routes, f.print.viewpoints, f.furnishings || []].flat().map((item) => item.id)])]);
  const protect = (entry) => {
    entry.status = "protected";
    if (!result.protected.includes(entry.elementId)) result.protected.push(entry.elementId);
  };
  for (const entry of nextState.elements) {
    const current = collection(floor2, entry.kind).find((item) => item.id === entry.elementId);
    if (entry.status === "active" && (!current || elementFingerprint(entry.kind, current) !== entry.baseline)) protect(entry);
    if (entry.status === "withdrawn" && current) protect(entry);
  }
  for (const opening2 of floor2.openings) {
    const owner = byId.get(opening2.id), wall2 = byId.get(opening2.wallId);
    if (wall2 && (!owner || owner.status === "protected")) protect(wall2);
  }
  for (const opening2 of floor2.openings) {
    const owner = byId.get(opening2.id);
    if (owner && byId.get(opening2.wallId)?.status === "protected") protect(owner);
  }
  for (const incoming of [...snapshot.elements].sort((a, b2) => Number(a.kind === "opening") - Number(b2.kind === "opening"))) {
    let entry = owned.get(incoming.sourceId);
    if (entry && entry.kind !== incoming.kind) return reject("invalid", "invalid_snapshot");
    if (entry?.status === "protected") continue;
    if (!entry) {
      const prefix = `scan:${state.sessionId.slice(0, 36)}:${state.epoch.slice(0, 20)}:${incoming.sourceId.slice(0, 40)}`;
      let id2 = prefix, suffix = 0;
      while (usedIds.has(id2)) id2 = `${prefix}:${++suffix}`;
      usedIds.add(id2);
      entry = { sourceId: incoming.sourceId, kind: incoming.kind, elementId: id2, baseline: null, status: "withdrawn" };
      nextState.elements.push(entry);
      owned.set(incoming.sourceId, entry);
      byId.set(id2, entry);
    }
    const target = collection(floor2, incoming.kind);
    const existingIndex = target.findIndex((item) => item.id === entry.elementId);
    let value;
    if (incoming.kind === "opening") {
      const wall2 = owned.get(incoming.sourceWallId);
      if (!wall2 || wall2.status === "protected" || !floor2.walls.some((item) => item.id === wall2.elementId)) {
        protect(entry);
        continue;
      }
      const v2 = incoming.value;
      value = { ...structuredClone(v2), id: entry.elementId, wallId: wall2.elementId };
    } else if (incoming.kind === "wall") {
      const v2 = incoming.value;
      value = { ...structuredClone(v2), id: entry.elementId };
    } else if (incoming.kind === "furnishing") {
      value = { ...structuredClone(incoming.value), id: entry.elementId };
    } else {
      const v2 = incoming.value;
      value = { id: entry.elementId, label: v2.label, polygon: v2.polygon.map((p) => ({ ...p })) };
    }
    const fingerprint = elementFingerprint(incoming.kind, value);
    if (existingIndex < 0) {
      target.push(value);
      result.added.push(value.id);
    } else if (fingerprint !== entry.baseline) {
      target[existingIndex] = value;
      result.updated.push(value.id);
    }
    entry.baseline = fingerprint;
    entry.status = "active";
  }
  for (const entry of [...nextState.elements].sort((a, b2) => Number(b2.kind === "opening") - Number(a.kind === "opening"))) {
    if (sourceIds.has(entry.sourceId) || entry.status !== "active") continue;
    const target = collection(floor2, entry.kind), index = target.findIndex((item) => item.id === entry.elementId);
    if (entry.kind === "wall" && floor2.openings.some((opening2) => opening2.wallId === entry.elementId)) {
      protect(entry);
      continue;
    }
    if (index >= 0) {
      target.splice(index, 1);
      result.removed.push(entry.elementId);
    }
    entry.status = "withdrawn";
    entry.baseline = null;
  }
  if (nextState.elements.length > 5e3 || !parseFloorPlanDocument(next)) return reject("invalid", "invalid_geometry");
  nextState.sequence = snapshot.sequence;
  const changed = result.added.length + result.updated.length + result.removed.length > 0;
  return { ...result, document: changed ? next : document, state: nextState, status: changed ? "applied" : "unchanged" };
}

// routeprofit-pro/src/features/floorplans/collabDocument.mjs
var COLLECTIONS = Object.freeze(["walls", "openings", "rooms", "symbols", "routes", "furnishings"]);
var clone = (value) => structuredClone(value);
var EPS2 = 1e-3;
function canonical2(value) {
  if (Array.isArray(value)) return value.map(canonical2);
  return value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical2(value[key])])) : value;
}
var equalValue = (left, right) => JSON.stringify(canonical2(left)) === JSON.stringify(canonical2(right));
var floorResourceId = (floorId) => `floor:${encodeURIComponent(floorId)}`;
var resourceId = (floorId, collection3, id2) => `element:${encodeURIComponent(floorId)}:${collection3}:${encodeURIComponent(id2)}`;
function parseResourceId(key) {
  if (key === "document") return { kind: "document" };
  if (typeof key !== "string" || key.length > 800) throw new Error("Ongeldige onderdeelverwijzing.");
  const parts = key.split(":");
  const decode = (part) => {
    const result = decodeURIComponent(part);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(result) || encodeURIComponent(result) !== part) throw new Error("Ongeldige onderdeelverwijzing.");
    return result;
  };
  if (parts.length === 2 && parts[0] === "floor") return { kind: "floor", floorId: decode(parts[1]) };
  if (parts.length === 4 && parts[0] === "element" && COLLECTIONS.includes(parts[2])) return { kind: "element", floorId: decode(parts[1]), collection: parts[2], id: decode(parts[3]) };
  throw new Error("Ongeldige onderdeelverwijzing.");
}
function resourcesConflict(left, right) {
  const a = parseResourceId(left), b2 = parseResourceId(right);
  return a.kind === "document" || b2.kind === "document" || left === right || a.floorId === b2.floorId && (a.kind === "floor" || b2.kind === "floor");
}
function splitDocument(document) {
  const { floors, ...metadata } = document;
  if (!Array.isArray(floors) || !floors.length) throw new Error("Het tekenbestand heeft geen verdieping.");
  const result = /* @__PURE__ */ Object.create(null);
  result.document = { ...clone(metadata), floorIds: floors.map((floor2) => floor2.id) };
  for (const floor2 of floors) {
    const meta = Object.fromEntries(Object.entries(floor2).filter(([key2]) => !COLLECTIONS.includes(key2)));
    const key = floorResourceId(floor2.id);
    parseResourceId(key);
    if (Object.hasOwn(result, key)) throw new Error("Dubbele verdieping.");
    result[key] = clone(meta);
    for (const collection3 of COLLECTIONS) for (const element of floor2[collection3] || []) {
      const key2 = resourceId(floor2.id, collection3, element.id);
      parseResourceId(key2);
      if (Object.hasOwn(result, key2)) throw new Error("Dubbel tekenonderdeel.");
      result[key2] = clone(element);
    }
  }
  return result;
}
function diffDocuments(before, after) {
  const a = splitDocument(before), b2 = splitDocument(after);
  return [.../* @__PURE__ */ new Set([...Object.keys(a), ...Object.keys(b2)])].sort().filter((key) => !equalValue(a[key] ?? null, b2[key] ?? null)).map((resource_id) => ({ resource_id, before: a[resource_id] ?? null, after: b2[resource_id] ?? null }));
}
function validateChanges(changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 2e4) throw new Error("Ongeldige wijziging.");
  const ids = /* @__PURE__ */ new Set();
  for (const change of changes) {
    if (!change || Object.keys(change).some((key) => !["resource_id", "before", "after"].includes(key)) || !Object.hasOwn(change, "before") || !Object.hasOwn(change, "after")) throw new Error("Ongeldige wijziging.");
    const parsed = parseResourceId(change.resource_id);
    if (ids.has(change.resource_id) || equalValue(change.before, change.after)) throw new Error("Dubbele of lege wijziging.");
    ids.add(change.resource_id);
    for (const value of [change.before, change.after]) {
      if (value !== null && (typeof value !== "object" || Array.isArray(value) || parsed.id && value.id !== parsed.id || parsed.kind === "floor" && value.id !== parsed.floorId)) throw new Error("De wijziging hoort bij een ander onderdeel.");
    }
    if (parsed.kind === "document" && !change.after) throw new Error("Het tekenbestand kan niet worden verwijderd.");
  }
}
function conflictingChanges(document, changes) {
  validateChanges(changes);
  const resources = splitDocument(document);
  return changes.filter((change) => !equalValue(resources[change.resource_id] ?? null, change.before)).map((change) => change.resource_id);
}
function applyChanges(document, changes) {
  const conflicts = conflictingChanges(document, changes);
  if (conflicts.length) {
    const error = new Error("Een onderdeel is intussen gewijzigd.");
    error.resourceIds = conflicts;
    throw error;
  }
  const resources = splitDocument(document);
  for (const change of changes) {
    if (change.after === null) delete resources[change.resource_id];
    else resources[change.resource_id] = clone(change.after);
  }
  const { floorIds, ...metadata } = resources.document;
  if (!Array.isArray(floorIds) || !floorIds.length || new Set(floorIds).size !== floorIds.length) throw new Error("Ongeldige verdiepingen.");
  const floors = floorIds.map((id2) => {
    const floor2 = resources[floorResourceId(id2)];
    if (!floor2) throw new Error("Een verdieping ontbreekt.");
    const previous = document.floors.find((item) => item.id === id2);
    const result = clone(floor2);
    for (const collection3 of COLLECTIONS) {
      const elements = Object.keys(resources).filter((key) => {
        const parsed = parseResourceId(key);
        return parsed.kind === "element" && parsed.floorId === id2 && parsed.collection === collection3;
      }).map((key) => resources[key]);
      const order = new Map((previous?.[collection3] || []).map((element, index) => [element.id, index]));
      if (collection3 === "furnishings" && !elements.length && metadata.schemaVersion < 3) continue;
      result[collection3] = elements.sort((a, b2) => (order.get(a.id) ?? Infinity) - (order.get(b2.id) ?? Infinity) || a.id.localeCompare(b2.id));
    }
    return result;
  });
  for (const key of Object.keys(resources)) {
    const parsed = parseResourceId(key);
    if (parsed.floorId && !floorIds.includes(parsed.floorId)) throw new Error("Verwijder eerst alle onderdelen van de verdieping.");
  }
  return { ...metadata, floors };
}
var distance = (a, b2) => Math.hypot(a.x - b2.x, a.y - b2.y);
var onSegment = (p, wall2) => {
  const dx = wall2.end.x - wall2.start.x, dy = wall2.end.y - wall2.start.y, denominator = dx * dx + dy * dy;
  const t = denominator ? Math.max(0, Math.min(1, ((p.x - wall2.start.x) * dx + (p.y - wall2.start.y) * dy) / denominator)) : 0;
  return distance(p, { x: wall2.start.x + t * dx, y: wall2.start.y + t * dy }) <= EPS2;
};
var crosses = (a, b2) => {
  if ([a.start, a.end].some((p) => onSegment(p, b2)) || [b2.start, b2.end].some((p) => onSegment(p, a))) return true;
  const cross2 = (p, q2, r) => (q2.x - p.x) * (r.y - p.y) - (q2.y - p.y) * (r.x - p.x);
  return cross2(a.start, a.end, b2.start) * cross2(a.start, a.end, b2.end) < 0 && cross2(b2.start, b2.end, a.start) * cross2(b2.start, b2.end, a.end) < 0;
};
var roomEdges = (room2) => room2.polygon.map((start, index) => ({ start, end: room2.polygon[(index + 1) % room2.polygon.length] }));
var insideRoom = (point3, room2) => {
  let inside2 = false;
  for (const edge of roomEdges(room2)) {
    if (onSegment(point3, edge)) return true;
    const { start: a, end: b2 } = edge;
    if (a.y > point3.y !== b2.y > point3.y && point3.x < (b2.x - a.x) * (point3.y - a.y) / (b2.y - a.y) + a.x) inside2 = !inside2;
  }
  return inside2;
};
var roomTouchesWall = (room2, wall2) => insideRoom(wall2.start, room2) || insideRoom(wall2.end, room2) || roomEdges(room2).some((edge) => crosses(edge, wall2));
var roomsOverlap = (a, b2) => a.polygon.some((point3) => insideRoom(point3, b2)) || b2.polygon.some((point3) => insideRoom(point3, a)) || roomEdges(a).some((edge) => roomEdges(b2).some((other) => crosses(edge, other)));
function dependencyResources(document, { resourceIds = [], changes = [] } = {}) {
  resourceIds.forEach(parseResourceId);
  if (changes.length) validateChanges(changes);
  const documents = [document];
  if (changes.length) documents.push(applyChanges(document, changes));
  const output = /* @__PURE__ */ new Set([...resourceIds, ...changes.map((change) => change.resource_id)]);
  if (output.has("document")) return ["document"];
  const broadFloors = new Set([...output].map(parseResourceId).filter((item) => item.kind === "floor").map((item) => item.floorId));
  const seeds = [...output].filter((key) => {
    const parsed = parseResourceId(key);
    return parsed.kind !== "element" || !broadFloors.has(parsed.floorId);
  });
  for (const doc of documents) for (const key of seeds) {
    const parsed = parseResourceId(key);
    if (parsed.kind !== "element") continue;
    const floor2 = doc.floors.find((item) => item.id === parsed.floorId);
    const element = floor2?.[parsed.collection]?.find((item) => item.id === parsed.id);
    if (!floor2 || !element) continue;
    const change = changes.find((item) => item.resource_id === key);
    const labelOnly = parsed.collection === "rooms" && change && equalValue(change.before?.polygon, change.after?.polygon);
    if (labelOnly || ["symbols", "routes", "furnishings"].includes(parsed.collection)) continue;
    const affectedWalls2 = /* @__PURE__ */ new Set();
    if (parsed.collection === "walls") {
      for (const wall2 of floor2.walls) if (wall2.id === element.id || crosses(element, wall2)) affectedWalls2.add(wall2.id);
      for (const room2 of floor2.rooms) if (roomEdges(room2).some((edge) => crosses(edge, element))) output.add(resourceId(floor2.id, "rooms", room2.id));
    } else if (parsed.collection === "openings") affectedWalls2.add(element.wallId);
    else if (parsed.collection === "rooms") {
      for (const wall2 of floor2.walls) if (roomTouchesWall(element, wall2)) affectedWalls2.add(wall2.id);
      for (const room2 of floor2.rooms) if (room2.id !== element.id && roomsOverlap(room2, element)) output.add(resourceId(floor2.id, "rooms", room2.id));
    }
    for (const id2 of affectedWalls2) output.add(resourceId(floor2.id, "walls", id2));
    for (const opening2 of floor2.openings) if (affectedWalls2.has(opening2.wallId)) output.add(resourceId(floor2.id, "openings", opening2.id));
  }
  return [...output].filter((key) => {
    const parsed = parseResourceId(key);
    return parsed.kind !== "element" || !broadFloors.has(parsed.floorId);
  }).sort();
}

// routeprofit-pro/src/features/floorplans/model.ts
var uid = () => globalThis.crypto?.randomUUID?.() || `fp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
function createFloor(name = "Begane grond") {
  return { id: uid(), name, elevation: 0, walls: [], rooms: [], openings: [], symbols: [], routes: [], print: { paper: "A3", orientation: "landscape", scale: 100, profile: "evacuation", title: "Ontruimingsplattegrond", address: "", drawingNumber: "", instructions: "Bij brand: waarschuw de aanwezigen en bel 112.\nVerlaat het gebouw via de aangegeven vluchtroute.\nGebruik geen lift. Ga naar de verzamelplaats.", secondaryInstructions: "", language2: "", viewpoints: [] } };
}
function createDocument(title = "Gebouwplattegrond") {
  return { schemaVersion: 1, id: uid(), title, unit: "m", floors: [createFloor()] };
}

// Reference/LOQ-room-details-2026-10-11/server/scanGeometry.ts
function validateDocument(document) {
  if (!parseFloorPlanDocument(document)) throw new Error("invalid_document");
  return document;
}
function dependencies(before, after, readResources = []) {
  return dependencyResources(before, { changes: diffDocuments(before, after), resourceIds: readResources });
}
var gap = (a, b2) => Math.hypot(a.x - b2.x, a.y - b2.y);
var wallStamp = (w2) => JSON.stringify([w2.id, w2.start.x, w2.start.y, w2.end.x, w2.end.y, w2.thickness, ...w2.height === void 0 ? [] : [w2.height]]);
var openingStamp = (o) => JSON.stringify([o.id, o.wallId, o.type, o.offset, o.width, o.hinge, o.swing, ...o.height === void 0 && o.bottomElevation === void 0 ? [] : [o.height ?? null, o.bottomElevation ?? null]]);
function closedPolygon(walls) {
  if (walls.length < 3 || walls.length > 500) return null;
  const remaining = walls.slice(1), points = [walls[0].start, walls[0].end];
  while (remaining.length) {
    const end = points[points.length - 1], i = remaining.findIndex((w3) => Math.min(gap(w3.start, end), gap(w3.end, end)) < 0.08);
    if (i < 0) return null;
    const w2 = remaining.splice(i, 1)[0];
    points.push(gap(w2.start, end) < gap(w2.end, end) ? w2.end : w2.start);
  }
  if (gap(points[0], points[points.length - 1]) >= 0.08) return null;
  points.pop();
  return points;
}
function onExistingWall(opening2, incomingWall, existingWall) {
  const length = gap(incomingWall.start, incomingWall.end), targetLength = gap(existingWall.start, existingWall.end);
  const u = { x: (incomingWall.end.x - incomingWall.start.x) / length, y: (incomingWall.end.y - incomingWall.start.y) / length };
  const v2 = { x: (existingWall.end.x - existingWall.start.x) / targetLength, y: (existingWall.end.y - existingWall.start.y) / targetLength };
  const endpoints = [opening2.offset, opening2.offset + opening2.width].map((d) => ({ x: incomingWall.start.x + u.x * d, y: incomingWall.start.y + u.y * d }));
  const offsets = endpoints.map((p) => (p.x - existingWall.start.x) * v2.x + (p.y - existingWall.start.y) * v2.y);
  const perpendicular = endpoints.map((p) => Math.abs((p.x - existingWall.start.x) * v2.y - (p.y - existingWall.start.y) * v2.x));
  const offset = Math.min(...offsets), width = Math.abs(offsets[1] - offsets[0]);
  if (Math.max(...perpendicular) > 0.061 || offset < -1e-3 || offset + width > targetLength + 1e-3 || width < 0.05) return null;
  const reversed = u.x * v2.x + u.y * v2.y < 0;
  return { ...opening2, wallId: existingWall.id, offset: Math.max(0, offset), width: Math.min(width, targetLength - Math.max(0, offset)), hinge: reversed ? opening2.hinge === "left" ? "right" : "left" : opening2.hinge, swing: reversed ? opening2.swing === "in" ? "out" : "in" : opening2.swing };
}
function mergeExternalOpenings(document, session, positioned, bindings, conflicts, heldWallSources = /* @__PURE__ */ new Set()) {
  const next = structuredClone(document), floor2 = next.floors.find((f) => f.id === session.context.floorId);
  const owned = structuredClone(session.externalOpenings || []), protectedIds = [];
  const bySource = new Map(owned.map((o) => [o.sourceId, o])), seen = /* @__PURE__ */ new Set();
  const incomingSources = new Set(positioned.openings.map((o) => o.id));
  const used = /* @__PURE__ */ new Set([next.id, ...next.floors.flatMap((f) => [f.id, ...[f.walls, f.rooms, f.openings, f.symbols, f.routes, f.print.viewpoints, f.furnishings || []].flat().map((x2) => x2.id)])]);
  const protect = (entry, reason) => {
    entry.status = "protected";
    protectedIds.push(entry.elementId);
    conflicts.push({ code: reason, sourceId: entry.sourceId, elementId: entry.elementId });
  };
  for (const entry of owned) {
    const current = floor2.openings.find((o) => o.id === entry.elementId), wall2 = floor2.walls.find((w2) => w2.id === entry.wallId);
    if (entry.status === "active" && (!current || openingStamp(current) !== entry.baseline)) protect(entry, "manual_opening_preserved");
    if (entry.status === "withdrawn" && current) protect(entry, "manual_opening_preserved");
    if (entry.status !== "protected" && (!wall2 || wallStamp(wall2) !== entry.wallBaseline)) protect(entry, "changed_parent_wall_preserved");
    if (heldWallSources.has(entry.sourceWallId)) seen.add(entry.sourceId);
  }
  for (const source of positioned.openings) {
    const matches = bindings.filter((b2) => b2.sourceId === source.wallId);
    if (!matches.length) continue;
    seen.add(source.id);
    if (heldWallSources.has(source.wallId)) continue;
    let entry = bySource.get(source.id);
    if (entry?.status === "protected") continue;
    const incoming = positioned.walls.find((w2) => w2.id === source.wallId);
    if (matches.some((b2) => b2.status === "protected")) {
      if (entry) protect(entry, "changed_parent_wall_preserved");
      else conflicts.push({ code: "changed_parent_wall_preserved", sourceId: source.id });
      continue;
    }
    const usable = matches.filter((b2) => {
      const w2 = floor2.walls.find((w3) => w3.id === b2.elementId);
      return w2 && wallStamp(w2) === b2.baseline && onExistingWall(source, incoming, w2);
    });
    if (usable.length !== 1) {
      conflicts.push({ code: "opening_crosses_wall_segments_requires_review", sourceId: source.id });
      continue;
    }
    const binding = usable[0], wall2 = floor2.walls.find((w2) => w2.id === binding.elementId);
    if (entry && entry.wallId !== binding.elementId) {
      protect(entry, "changed_parent_wall_preserved");
      continue;
    }
    if (!wall2 || wallStamp(wall2) !== binding.baseline) {
      if (entry) protect(entry, "changed_parent_wall_preserved");
      else conflicts.push({ code: "changed_parent_wall_preserved", sourceId: source.id });
      continue;
    }
    const value = onExistingWall(source, incoming, wall2);
    if (!value) {
      conflicts.push({ code: "opening_position_requires_review", sourceId: source.id });
      continue;
    }
    if (!entry) {
      const tombstone = owned.find((o) => {
        if (o.status !== "protected" || o.wallId !== wall2.id || !o.baseline) return false;
        try {
          const b2 = JSON.parse(o.baseline);
          return b2[2] === value.type && Math.abs(b2[3] - value.offset) < 0.05 && Math.abs(b2[4] - value.width) < 0.05;
        } catch {
          return false;
        }
      });
      if (tombstone) {
        entry = { ...tombstone, sourceId: source.id, sourceWallId: source.wallId };
        owned.push(entry);
        bySource.set(source.id, entry);
        protect(entry, "manual_opening_preserved");
        continue;
      }
    }
    let others = floor2.openings.filter((o) => o.wallId === wall2.id && o.id !== entry?.elementId);
    if (!entry) {
      const existing = others.find((o) => o.type === value.type && Math.abs(o.offset - value.offset) < 0.05 && Math.abs(o.width - value.width) < 0.05);
      if (existing) {
        const owner = owned.find((o) => o.elementId === existing.id && o.status === "active" && o.baseline === openingStamp(existing) && o.wallBaseline === binding.baseline);
        if (owner && !incomingSources.has(owner.sourceId)) {
          bySource.delete(owner.sourceId);
          owner.sourceId = source.id;
          owner.sourceWallId = source.wallId;
          bySource.set(source.id, owner);
          entry = owner;
          others = others.filter((o) => o.id !== owner.elementId);
        } else if (owner) {
          conflicts.push({ code: "duplicate_scan_opening_ignored", sourceId: source.id, elementId: existing.id });
          continue;
        } else {
          entry = { sourceId: source.id, elementId: existing.id, wallId: wall2.id, sourceWallId: source.wallId, wallBaseline: binding.baseline, baseline: openingStamp(existing), status: "protected" };
          owned.push(entry);
          bySource.set(source.id, entry);
          conflicts.push({ code: "existing_opening_preserved", sourceId: source.id, elementId: existing.id });
          continue;
        }
      }
    }
    const overlap2 = others.some((o) => Math.min(o.offset + o.width, value.offset + value.width) - Math.max(o.offset, value.offset) > 0.01);
    if (overlap2) {
      conflicts.push({ code: "overlapping_opening_requires_review", sourceId: source.id });
      continue;
    }
    if (!entry) {
      const prefix = `scan:${session.context.captureSessionId.slice(0, 36)}:ext:${source.id.slice(0, 40)}`;
      let id2 = prefix, n = 0;
      while (used.has(id2)) id2 = `${prefix}:${++n}`;
      used.add(id2);
      entry = { sourceId: source.id, elementId: id2, wallId: wall2.id, sourceWallId: source.wallId, wallBaseline: binding.baseline, baseline: null, status: "withdrawn" };
      owned.push(entry);
      bySource.set(source.id, entry);
    }
    const updated = { ...value, id: entry.elementId }, index = floor2.openings.findIndex((o) => o.id === entry.elementId);
    if (index < 0) floor2.openings.push(updated);
    else floor2.openings[index] = updated;
    entry.baseline = openingStamp(updated);
    entry.status = "active";
  }
  for (const entry of owned) {
    if (seen.has(entry.sourceId) || entry.status !== "active") continue;
    const index = floor2.openings.findIndex((o) => o.id === entry.elementId);
    if (index >= 0) floor2.openings.splice(index, 1);
    entry.status = "withdrawn";
    entry.baseline = null;
  }
  return { document: next, owned, protectedIds: [.../* @__PURE__ */ new Set([...protectedIds, ...owned.filter((o) => o.status === "protected").map((o) => o.elementId)])] };
}
var wallLength = (w2) => gap(w2.start, w2.end);
var wallUnit = (w2) => {
  const n = wallLength(w2);
  return { x: (w2.end.x - w2.start.x) / n, y: (w2.end.y - w2.start.y) / n };
};
var along = (p, w2) => {
  const u = wallUnit(w2);
  return (p.x - w2.start.x) * u.x + (p.y - w2.start.y) * u.y;
};
var at = (w2, d) => {
  const u = wallUnit(w2);
  return { x: w2.start.x + u.x * d, y: w2.start.y + u.y * d };
};
var lineGap = (p, w2) => {
  const u = wallUnit(w2);
  return Math.abs((p.x - w2.start.x) * u.y - (p.y - w2.start.y) * u.x);
};
function overlap(incoming, host) {
  const a = wallUnit(incoming), b2 = wallUnit(host), angle2 = Math.abs(a.x * b2.y - a.y * b2.x);
  if (angle2 > Math.sin(Math.PI / 90)) return null;
  const low = Math.max(0, Math.min(along(host.start, incoming), along(host.end, incoming))), high = Math.min(wallLength(incoming), Math.max(along(host.start, incoming), along(host.end, incoming)));
  const normal = Math.max(lineGap(at(incoming, low), host), lineGap(at(incoming, high), host));
  if (high - low < Math.min(0.1, wallLength(incoming) * 0.2)) return null;
  return { low, high, normal, angle: angle2 };
}
function ownedStamp(kind, value) {
  if (kind === "wall") return JSON.stringify([value.start.x, value.start.y, value.end.x, value.end.y, value.thickness, ...value.height === void 0 ? [] : [value.height]]);
  if (kind === "opening") return JSON.stringify([value.wallId, value.type, value.offset, value.width, value.hinge, value.swing, ...value.height === void 0 && value.bottomElevation === void 0 ? [] : [value.height ?? null, value.bottomElevation ?? null]]);
  if (kind === "furnishing") return JSON.stringify([value.category, value.position.x, value.position.y, value.rotation, value.width, value.depth, value.height, value.bottomElevation, value.confidence]);
  return JSON.stringify([value.label, value.polygon.map((p) => [p.x, p.y])]);
}
var collection2 = (floor2, kind) => kind === "wall" ? floor2.walls : kind === "opening" ? floor2.openings : kind === "furnishing" ? floor2.furnishings || [] : floor2.rooms;
function affectedWalls(before, after, floorId) {
  const a = before.floors.find((f) => f.id === floorId), b2 = after.floors.find((f) => f.id === floorId), ids = /* @__PURE__ */ new Set();
  for (const w2 of [...a.walls, ...b2.walls]) {
    const old = a.walls.find((x2) => x2.id === w2.id), next = b2.walls.find((x2) => x2.id === w2.id);
    if (!old || !next || wallStamp(old) !== wallStamp(next)) ids.add(w2.id);
  }
  for (const o of [...a.openings, ...b2.openings]) {
    const old = a.openings.find((x2) => x2.id === o.id), next = b2.openings.find((x2) => x2.id === o.id);
    if (!old || !next || openingStamp(old) !== openingStamp(next)) {
      if (old) ids.add(old.wallId);
      if (next) ids.add(next.wallId);
    }
  }
  return [...ids].sort();
}
function merge(document, session, event, transform) {
  const floor2 = document.floors.find((f) => f.id === session.context.floorId);
  const scope = { customerId: session.context.customerId, objectId: session.context.objectId, buildingSelectionKey: session.context.buildingSelectionKey, documentId: session.context.documentId, floorId: session.context.floorId, mapVersion: session.context.mapVersion };
  const previous = structuredClone(session.mergeState || createScanMergeState(scope, session.context.captureSessionId, event.coordinateFrameId));
  if (previous.sequence === event.sequence) return { document, state: previous, status: "unchanged", protected: [], conflicts: [], readResources: [], affectedWallIds: [] };
  const positioned = positionedRoomScan(event, floor2, transform, { includeDetails: session.richDetails === true }), ownedIds = new Set(previous.elements.map((e) => e.elementId));
  const bindings = structuredClone(session.externalWallBindings || []), ledgers = structuredClone(session.wallSources || []), conflicts = [], reads = /* @__PURE__ */ new Set();
  const contacts = session.placement?.wallContacts || [], elements = [], routes = /* @__PURE__ */ new Map(), held = /* @__PURE__ */ new Set();
  const incomingIds = new Set(event.snapshot.surfaces.map((s) => s.id)), reservedFragments = /* @__PURE__ */ new Set();
  let fragmentCollision = false;
  const hostById = new Map(floor2.walls.map((w2) => [w2.id, w2]));
  const holdEntries = (ids) => {
    const selected = previous.elements.filter((e) => ids.includes(e.sourceId) || e.kind === "opening" && ids.some((id2) => previous.elements.find((w2) => w2.sourceId === id2)?.elementId === floor2.openings.find((o) => o.id === e.elementId)?.wallId));
    for (const e of selected) {
      const value = collection2(floor2, e.kind).find((v2) => v2.id === e.elementId);
      if (!value || elements.some((x2) => x2.sourceId === e.sourceId)) continue;
      const { id: id2, ...rest } = value;
      if (e.kind === "opening") {
        const owner = previous.elements.find((w2) => w2.kind === "wall" && w2.elementId === value.wallId);
        if (owner) {
          const { wallId, ...opening2 } = rest;
          elements.push({ sourceId: e.sourceId, sourceWallId: owner.sourceId, kind: "opening", value: opening2 });
        }
      } else elements.push({ sourceId: e.sourceId, kind: e.kind, value: rest });
    }
  };
  const isManual = (e) => {
    const value = collection2(floor2, e.kind).find((v2) => v2.id === e.elementId);
    return e.status === "protected" || e.status === "active" && (!value || ownedStamp(e.kind, value) !== e.baseline) || e.status === "withdrawn" && !!value;
  };
  for (const binding of bindings) {
    const host = hostById.get(binding.elementId);
    reads.add(resourceId(floor2.id, "walls", binding.elementId));
    if (!host || wallStamp(host) !== binding.baseline) binding.status = "protected";
  }
  for (const ledger of ledgers) {
    const sourceIds = [ledger.sourceId, ...ledger.fragments || []], entries = previous.elements.filter((e) => sourceIds.includes(e.sourceId));
    const wallIds = new Set(entries.filter((e) => e.kind === "wall").map((e) => e.elementId));
    const manualOpening = floor2.openings.some((o) => wallIds.has(o.wallId) && (!previous.elements.some((e) => e.elementId === o.id) || isManual(previous.elements.find((e) => e.elementId === o.id))));
    const manualExternal = (session.externalOpenings || []).some((o) => o.sourceWallId === ledger.sourceId && (o.status === "protected" || o.status === "active" && (!floor2.openings.some((v2) => v2.id === o.elementId) || openingStamp(floor2.openings.find((v2) => v2.id === o.elementId)) !== o.baseline)));
    if (entries.some(isManual) || manualOpening || manualExternal || bindings.some((b2) => b2.sourceId === ledger.sourceId && b2.status === "protected")) ledger.protected = true;
    if (ledger.protected) {
      for (const e of previous.elements) if (sourceIds.includes(e.sourceId) || e.kind === "opening" && wallIds.has(floor2.openings.find((o) => o.id === e.elementId)?.wallId)) e.status = "protected";
    }
  }
  for (const incoming of positioned.walls) {
    let ledger = ledgers.find((l) => l.sourceId === incoming.id);
    if (!ledger) {
      const alias = ledgers.find((l) => {
        if (!l.protected || !l.baseline) return false;
        try {
          const b2 = JSON.parse(l.baseline), old = { start: { x: b2[1], y: b2[2] }, end: { x: b2[3], y: b2[4] } };
          return Math.min(Math.max(gap(incoming.start, old.start), gap(incoming.end, old.end)), Math.max(gap(incoming.start, old.end), gap(incoming.end, old.start))) < 0.1;
        } catch {
          return false;
        }
      });
      ledger = { sourceId: incoming.id, baseline: wallStamp(incoming), fragments: [], protected: !!alias };
      ledgers.push(ledger);
    }
    const bound = bindings.filter((b2) => b2.sourceId === incoming.id), members = [incoming.id, ...ledger.fragments];
    const oldEntries = previous.elements.filter((e) => members.includes(e.sourceId));
    const oldWallIds = new Set(oldEntries.filter((e) => e.kind === "wall").map((e) => e.elementId));
    const manualChild = floor2.openings.some((o) => oldWallIds.has(o.wallId) && (!previous.elements.some((e) => e.elementId === o.id) || isManual(previous.elements.find((e) => e.elementId === o.id))));
    const manualExternal = (session.externalOpenings || []).some((o) => o.sourceWallId === incoming.id && (o.status === "protected" || o.status === "active" && (!floor2.openings.some((v2) => v2.id === o.elementId) || openingStamp(floor2.openings.find((v2) => v2.id === o.elementId)) !== o.baseline)));
    if (oldEntries.some(isManual) || manualChild || manualExternal || bound.some((b2) => b2.status === "protected")) ledger.protected = true;
    if (ledger.protected) {
      held.add(incoming.id);
      holdEntries(members);
      for (const b2 of bound) b2.status = "protected";
      conflicts.push({ code: "manual_scan_wall_preserved", sourceId: incoming.id });
      continue;
    }
    const explicit = contacts.filter((c) => c.sourceWallId === incoming.id), candidates = [], near = [];
    for (const host of floor2.walls) {
      if (ownedIds.has(host.id)) continue;
      const part = overlap(incoming, host);
      if (!part) continue;
      const requested = explicit.some((c) => c.targetWallId === host.id), remembered = bound.find((b2) => b2.elementId === host.id);
      const nearby = part.normal <= Math.min(0.35, (incoming.thickness + host.thickness) / 2 + 0.03);
      if (nearby || requested || remembered) {
        reads.add(resourceId(floor2.id, "walls", host.id));
        near.push({ host, ...part });
      }
      if (part.angle <= Math.sin(Math.PI / 180) && part.normal <= (requested || remembered?.contact === "explicit" ? 0.06 : 0.012)) candidates.push({ host, ...part, explicit: requested || remembered?.contact === "explicit" });
    }
    let review = explicit.some((c) => !candidates.some((p) => p.host.id === c.targetWallId)) || bound.some((b2) => !candidates.some((p) => p.host.id === b2.elementId));
    const accepted = [];
    for (const candidate of candidates.sort((a, b2) => Number(b2.explicit) - Number(a.explicit) || a.low - b2.low || a.host.id.localeCompare(b2.host.id))) {
      const overlaps = accepted.filter((p) => Math.min(p.high, candidate.high) - Math.max(p.low, candidate.low) > 0.02);
      if (overlaps.length) {
        review = true;
        conflicts.push({ code: "overlapping_host_walls_require_review", sourceId: incoming.id });
        continue;
      }
      accepted.push(candidate);
    }
    if (near.some((p) => !accepted.some((a) => a.host.id === p.host.id))) review = true;
    if (review) {
      held.add(incoming.id);
      holdEntries(members);
      conflicts.push({ code: "wall_contact_requires_review", sourceId: incoming.id });
      continue;
    }
    const segments = [];
    routes.set(incoming.id, segments);
    for (const hit of accepted) {
      let binding = bound.find((b2) => b2.elementId === hit.host.id);
      if (!binding) {
        binding = { sourceId: incoming.id, elementId: hit.host.id, baseline: wallStamp(hit.host) };
        bindings.push(binding);
      }
      Object.assign(binding, { status: "active", contact: hit.explicit ? "explicit" : "axis", range: [hit.low, hit.high], sourceBaseline: wallStamp(incoming) });
      segments.push({ kind: "external", low: hit.low, high: hit.high, binding, wall: hit.host });
    }
    if (!accepted.length) {
      elements.push({ sourceId: incoming.id, kind: "wall", value: { start: incoming.start, end: incoming.end, thickness: incoming.thickness, ...incoming.height === void 0 ? {} : { height: incoming.height } } });
      segments.push({ kind: "owned", low: 0, high: wallLength(incoming), sourceId: incoming.id, wall: incoming });
      ledger.fragments = [];
      ledger.baseline = wallStamp(incoming);
      continue;
    }
    accepted.sort((a, b2) => a.low - b2.low);
    let cursor = 0, index = 0;
    const fragments = [];
    const append = (low, high) => {
      if (high - low < 0.01) return;
      const id2 = `scanpart:${incoming.id.slice(0, 96)}:${index++}`;
      if (incomingIds.has(id2) || reservedFragments.has(id2)) {
        fragmentCollision = true;
        return;
      }
      reservedFragments.add(id2);
      fragments.push(id2);
      const wall2 = { ...incoming, start: at(incoming, low), end: at(incoming, high) };
      for (const end of ["start", "end"]) for (const hit of accepted) for (const point3 of [hit.host.start, hit.host.end]) if (gap(wall2[end], point3) <= 0.061) wall2[end] = { ...point3 };
      elements.push({ sourceId: id2, kind: "wall", value: { start: wall2.start, end: wall2.end, thickness: wall2.thickness, ...wall2.height === void 0 ? {} : { height: wall2.height } } });
      segments.push({ kind: "owned", sourceId: id2, low, high, wall: wall2 });
    };
    for (const hit of accepted) {
      append(cursor, hit.low);
      cursor = Math.max(cursor, hit.high);
    }
    append(cursor, wallLength(incoming));
    ledger.fragments = fragments;
    ledger.baseline = wallStamp(incoming);
  }
  for (const opening2 of positioned.openings) {
    if (held.has(opening2.wallId)) continue;
    const entry = previous.elements.find((e) => e.kind === "opening" && e.sourceId === opening2.id);
    if (!entry || !floor2.openings.some((o) => o.id === entry.elementId)) continue;
    const segments = routes.get(opening2.wallId) || [], fitting = segments.filter((s) => opening2.offset >= s.low - 1e-3 && opening2.offset + opening2.width <= s.high + 1e-3);
    const incoming = positioned.walls.find((w2) => w2.id === opening2.wallId);
    if (fitting.length === 1 && onExistingWall(opening2, incoming, fitting[0].wall)) continue;
    held.add(opening2.wallId);
    routes.delete(opening2.wallId);
    const ledger = ledgers.find((l) => l.sourceId === opening2.wallId), oldLedger = (session.wallSources || []).find((l) => l.sourceId === opening2.wallId);
    const members = [opening2.wallId, ...ledger?.fragments || [], ...oldLedger?.fragments || []];
    const openingIds = positioned.openings.filter((o) => o.wallId === opening2.wallId).map((o) => o.id);
    for (let i = elements.length - 1; i >= 0; i--) if (members.includes(elements[i].sourceId) || openingIds.includes(elements[i].sourceId)) elements.splice(i, 1);
    for (let i = bindings.length - 1; i >= 0; i--) if (bindings[i].sourceId === opening2.wallId) bindings.splice(i, 1);
    bindings.push(...structuredClone((session.externalWallBindings || []).filter((b2) => b2.sourceId === opening2.wallId)));
    if (oldLedger) Object.assign(ledger, structuredClone(oldLedger));
    holdEntries(members);
    conflicts.push({ code: "opening_crosses_wall_segments_requires_review", sourceId: opening2.id });
  }
  const externalOpenings = [];
  for (const opening2 of positioned.openings) {
    if (held.has(opening2.wallId)) {
      if (bindings.some((b2) => b2.sourceId === opening2.wallId)) externalOpenings.push(opening2);
      continue;
    }
    const segments = routes.get(opening2.wallId) || [], low = opening2.offset, high = opening2.offset + opening2.width;
    const fitting = segments.filter((s) => low >= s.low - 1e-3 && high <= s.high + 1e-3);
    if (fitting.length !== 1) {
      conflicts.push({ code: "opening_crosses_wall_segments_requires_review", sourceId: opening2.id });
      if (bindings.some((b2) => b2.sourceId === opening2.wallId)) externalOpenings.push(opening2);
      continue;
    }
    const segment = fitting[0];
    if (segment.kind === "external") {
      externalOpenings.push(opening2);
      continue;
    }
    const incoming = positioned.walls.find((w2) => w2.id === opening2.wallId), mapped = onExistingWall(opening2, incoming, segment.wall);
    if (!mapped) {
      conflicts.push({ code: "opening_position_requires_review", sourceId: opening2.id });
      continue;
    }
    const { id: id2, wallId, ...value } = mapped;
    elements.push({ sourceId: id2, sourceWallId: segment.sourceId, kind: "opening", value });
  }
  const furnishingIds = new Set((positioned.furnishings || []).map((f) => `object:${f.id}`.slice(0, 119)));
  for (const furnishing of positioned.furnishings || []) {
    const { id: id2, ...value } = furnishing, sourceId = `object:${id2}`.slice(0, 119);
    const equivalent = (entry) => {
      try {
        const b2 = JSON.parse(entry.baseline);
        return b2 && b2[0] === value.category && Math.hypot(b2[1] - value.position.x, b2[2] - value.position.y) < 0.08 && Math.abs((b2[3] - value.rotation + 540) % 360 - 180) < 5 && Math.abs(b2[4] - value.width) < 0.05 && Math.abs(b2[5] - value.depth) < 0.05 && Math.abs(b2[6] - value.height) < 0.08 && Math.abs(b2[7] - value.bottomElevation) < 0.08;
      } catch {
        return false;
      }
    };
    const sameSource = previous.elements.find((e) => e.kind === "furnishing" && e.sourceId === sourceId);
    if (!sameSource) {
      const alias = previous.elements.find((e) => e.kind === "furnishing" && equivalent(e));
      if (alias) {
        if (isManual(alias)) {
          alias.status = "protected";
          conflicts.push({ code: "manual_furnishing_preserved", sourceId, elementId: alias.elementId });
          continue;
        }
        if (alias.status === "active" && !furnishingIds.has(alias.sourceId)) {
          alias.sourceId = sourceId;
        } else if (alias.status === "active") {
          conflicts.push({ code: "duplicate_scan_furnishing_ignored", sourceId, elementId: alias.elementId });
          continue;
        }
      }
    }
    elements.push({ sourceId, kind: "furnishing", value });
  }
  const polygon = !held.size && !session.context.targetRoomId && closedPolygon(positioned.walls);
  if (polygon) elements.push({ sourceId: `room:${event.snapshot.roomId}`.slice(0, 119), kind: "room", value: { label: session.context.targetRoomLabel || "Gescande ruimte", polygon } });
  else if (held.size) holdEntries(previous.elements.filter((e) => e.kind === "room").map((e) => e.sourceId));
  if (fragmentCollision) return { document, state: session.mergeState || previous, status: "invalid", reason: "invalid_snapshot", protected: [], conflicts: [], readResources: [], affectedWallIds: [] };
  const result = mergeScanSnapshot(document, previous, { schemaVersion: 1, sessionId: session.context.captureSessionId, epoch: event.coordinateFrameId, sequence: event.sequence, scope, elements });
  if (result.status === "invalid" || result.status === "ignored") return result;
  const external = mergeExternalOpenings(result.document, session, { ...positioned, openings: externalOpenings }, bindings, conflicts, held);
  const mergedFloor = external.document.floors.find((f) => f.id === floor2.id);
  for (const entry of previous.elements.filter((e) => e.kind === "room" && e.status === "active")) {
    const prior = floor2.rooms.find((r) => r.id === entry.elementId);
    if (prior && ownedStamp("room", prior) === entry.baseline && !mergedFloor.rooms.some((r) => r.id === entry.elementId)) mergedFloor.rooms.push(structuredClone(prior));
  }
  const reconciledFloor = reconcileAutomaticRooms(floor2, mergedFloor);
  external.document.floors = external.document.floors.map((f) => f.id === floor2.id ? reconciledFloor : f);
  for (const entry of result.state.elements.filter((e) => e.kind === "room" && e.status !== "protected")) {
    const prior = mergedFloor.rooms.find((r) => r.id === entry.elementId), current = reconciledFloor.rooms.find((r) => r.id === entry.elementId);
    const old = previous.elements.find((e) => e.sourceId === entry.sourceId);
    if (!prior || ownedStamp("room", prior) !== (entry.baseline ?? old?.baseline)) continue;
    if (current) {
      entry.baseline = ownedStamp("room", current);
      entry.status = "active";
    } else {
      entry.status = "withdrawn";
      entry.baseline = null;
    }
  }
  if (session.richDetails === true && external.document.floors.some((f) => f.furnishings !== void 0 || f.walls.some((w2) => w2.height !== void 0) || f.openings.some((o) => o.height !== void 0 || o.bottomElevation !== void 0))) external.document.schemaVersion = 3;
  if (bindings.length > 2500 || ledgers.length > 2500 || external.owned.length > 4e3 || !parseFloorPlanDocument(external.document)) return { ...result, status: "invalid", document, state: session.mergeState || previous };
  const unsupported = event.snapshot.surfaces.filter((s) => s.isCurved).map((s) => ({ code: "curved_surface_requires_review", sourceId: s.id }));
  return { ...result, document: external.document, protected: [.../* @__PURE__ */ new Set([...result.protected, ...previous.elements.filter((e) => e.status === "protected").map((e) => e.elementId), ...external.protectedIds])], conflicts: [...conflicts, ...unsupported], readResources: [...reads].sort(), affectedWallIds: affectedWalls(document, external.document, floor2.id), sessionPatch: { externalWallBindings: bindings, externalOpenings: external.owned, wallSources: ledgers } };
}
export {
  createDocument,
  dependencies,
  merge,
  resourcesConflict,
  validateDocument
};
/*! Bundled license information:

splaytree/dist/splay.js:
  (**
   * splaytree v0.1.4
   * Fast Splay tree for Node and browser
   *
   * @author Alexander Milevski <info@w8r.name>
   * @license MIT
   * @preserve
   *)
*/
