"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ipfs_image_1 = __importDefault(require("./ipfs-image"));
const resolveImage = (url) => {
    if (!url)
        return '';
    if (url.startsWith('ipfs://')) {
        return (0, ipfs_image_1.default)(url);
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    return `${process.env.NUSA_BACKEND_UPLOAD_URL}/${url}`;
};
exports.default = resolveImage;
