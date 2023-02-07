module.exports = {
  apps : [{
    name   : "@nusa-nft/worker",
    script : "./dist/main.js",
    instances: 2,
    env_production: {
      NODE_ENV: "production"
    },
    env_development: {
        NODE_ENV: "development"
    }
  }]
}