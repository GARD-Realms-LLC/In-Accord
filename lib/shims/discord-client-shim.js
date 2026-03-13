"use strict";

function unsupported() {
  throw new Error("This module is server-only and unavailable in browser bundles.");
}

module.exports = new Proxy(
  {},
  {
    get() {
      return unsupported;
    },
    apply() {
      return unsupported();
    },
  }
);
module.exports.default = module.exports;
