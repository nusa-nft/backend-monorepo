"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ipfsImage = (url) => {
    return `${process.env.IPFS_GATEWAY}${url.replace('ipfs://', '')}`;
};
exports.default = ipfsImage;
