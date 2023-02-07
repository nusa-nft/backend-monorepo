module.exports = {
  apps : [
    {
      name: "@nusa-nft/rest-api",
      script: "./packages/rest-api/dist/main.js",
      env_production: {
        NODE_ENV: "production"
      },
      env_development: {
          NODE_ENV: "development"
      }
    },
    {
      name: "@nusa-nft/indexer",
      script: "./packages/indexer/dist/main.js",
      env_production: {
        NODE_ENV: "production"
      },
      env_development: {
          NODE_ENV: "development"
      }
    },
    {
      name   : "@nusa-nft/worker",
      script : "./packages/worker/dist/main.js",
      instances: 2,
      env_production: {
        NODE_ENV: "production"
      },
      env_development: {
          NODE_ENV: "development"
      }
    },
  ]
}