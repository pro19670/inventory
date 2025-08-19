module.exports = {
  apps: [{
    name: 'smart-inventory',
    script: './backend/src/server.js',
    cwd: '/home/user/webapp',
    env_file: './backend/.env',
    env: {
      NODE_ENV: 'development',
      PORT: 3001,
      DEMO_MODE: 'true'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm Z',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
};