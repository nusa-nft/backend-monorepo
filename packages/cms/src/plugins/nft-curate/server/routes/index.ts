export default [
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
