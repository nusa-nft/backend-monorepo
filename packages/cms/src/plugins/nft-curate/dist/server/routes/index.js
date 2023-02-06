"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = [
    {
        method: 'GET',
        path: '/curated-collections',
        handler: 'curatedCollectionController.index',
        config: {
            policies: [],
        },
    },
    {
        method: 'POST',
        path: '/curated-collections',
        handler: 'curatedCollectionController.curate'
    }
];
