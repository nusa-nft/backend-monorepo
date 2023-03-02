
pipeline {
  parameters {
     choice(choices:['api','worker','indexer'], description: 'Users Choice', name: 'CHOICE')
  }
    
  agent any
  stages {
    stage("Build API") {
        when { 
            expression { env.CHOICE == 'api' }
        }
      steps {
            sh 'ssh -i ~/key ubuntu@10.184.0.6 "cd /home/ubuntu/backend-monorepo  && git stash && git pull && yarn install && yarn api:build && pm2 restart @nusa-nft/rest-api"'
      }      
    }

    stage ("Build Worker") {
        when { 
            expression { env.CHOICE == 'worker' }
        }
        steps {
            sh 'ssh -i ~/key ubuntu@10.184.0.6 "cd /home/ubuntu/backend-monorepo  && git stash && git pull && yarn install && yarn worker:build && pm2 restart @nusa-nft/worker"'
        }      
    }

    stage("Build Indexer") {
        when { 
            expression { env.CHOICE == 'indexer' }
        }
        steps {
            sh 'ssh -i ~/key ubuntu@10.184.0.6 "cd /home/ubuntu/backend-monorepo  && git stash && git pull && yarn install && yarn indexer:build && pm2 restart @nusa-nft/indexer"'
        }      
    }
  }
}
