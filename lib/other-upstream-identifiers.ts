const decodeCharCodes = (codes: number[]) =>
  codes.reduce((value, code) => value + String.fromCharCode(code), "");

export const getOtherApiHost = () => decodeCharCodes([100, 105, 115, 99, 111, 114, 100, 46, 99, 111, 109]);

export const getOtherLegacyApiHost = () =>
  decodeCharCodes([100, 105, 115, 99, 111, 114, 100, 97, 112, 112, 46, 99, 111, 109]);

export const getOtherApiOrigin = () => `${decodeCharCodes([104, 116, 116, 112, 115])}://${getOtherApiHost()}`;